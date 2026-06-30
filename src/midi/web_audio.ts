/**
 * Web Audio renderer for Loophaus.
 *
 * Replaces the GM-soundfont MIDI path with actual subtractive synthesis,
 * real filter envelopes, and sidechain compression. The same solved graph
 * goes in; a proper-sounding WAV comes out.
 *
 * Synth design philosophy: each track context maps to a sound type
 * (defined here), and each event triggers a voice — oscillators, filter,
 * envelopes — all wired up natively in Web Audio.
 */
import { OfflineAudioContext } from "node-web-audio-api";
import * as fs from "fs";
import type { Graph } from "../core/types.ts";
import type { SolveResult } from "../core/solver.ts";
import { lookup } from "../core/graph.ts";
import { renderInstrumentVoice } from "./audio_renderer.ts";
import { midiToHz, renderInstrumentNote } from "./render_instrument.ts";

// Map track names to synth voices. Names match what daft_punk_v2.ts uses.
type SoundKind =
  | "kick" | "snare" | "closed_hat" | "open_hat" | "crash" | "clap"
  | "synth_bass" | "clavinet_stab" | "warm_pad" | "saw_lead";

function soundForTrack(trackName: string): SoundKind {
  const t = trackName.toLowerCase();
  if (t.includes("kick") || t === "drums") return "kick"; // 'drums' track contains kick+others
  if (t.includes("bass")) return "synth_bass";
  if (t.includes("stab") || t.includes("clavinet")) return "clavinet_stab";
  if (t.includes("pad")) return "warm_pad";
  if (t.includes("lead")) return "saw_lead";
  return "saw_lead";
}

/**
 * The drum track multiplexes — kick, snare, hat all share the track.
 * We disambiguate by MIDI note number:
 *   36 = kick, 38 = snare, 39 = clap, 42 = closed hat, 46 = open hat, 49 = crash
 */
function soundForDrumNote(midi: number): SoundKind {
  if (midi === 36) return "kick";
  if (midi === 38) return "snare";
  if (midi === 39) return "clap";
  if (midi === 42) return "closed_hat";
  if (midi === 46) return "open_hat";
  if (midi === 49) return "crash";
  return "kick"; // fallback
}

/**
 * Pre-render a single instrument voice (instrument + pitch + duration) to an
 * AudioBuffer. The track context then uses BufferSourceNode (2 nodes) per event
 * instead of constructing the full instrument graph (~10 nodes) per event.
 *
 * The duration is bucketed so we don't make a unique buffer per fractional dur.
 */
async function prerenderInstrumentBuffer(
  inst: any, midi: number, durSec: number, sr: number
): Promise<any> {
  try {
    return await renderInstrumentNote(inst, {
      midi,
      durationSec: durSec,
      sampleRate: sr,
      tailSec: 1.5,
    });
  } catch {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate: sr });
    return await ctx.startRendering();
  }
}

/** Bucket a duration into a small set of canonical values to keep cache small. */
function durBucket(durSec: number): number {
  if (durSec < 0.15) return 0.15;
  if (durSec < 0.3)  return 0.3;
  if (durSec < 0.6)  return 0.6;
  if (durSec < 1.2)  return 1.2;
  if (durSec < 2.4)  return 2.4;
  if (durSec < 5.0)  return 5.0;
  return 8.0;
}

/**
 * Pre-render a single drum hit to an AudioBuffer so the track context can use
 * BufferSourceNode (2 nodes) per hit instead of 4-5 nodes. Big perf win for
 * tracks with many drum events.
 */
async function prerenderDrum(sound: SoundKind, midi: number, sr: number): Promise<any> {
  const dur =
    sound === "crash" ? 2.5 :
    sound === "open_hat" ? 0.6 :
    sound === "closed_hat" ? 0.15 :
    sound === "snare" || sound === "clap" ? 0.4 :
    sound === "kick" ? 0.4 :
    0.5;
  const ctx = new OfflineAudioContext({
    numberOfChannels: 1,
    length: Math.ceil(sr * dur),
    sampleRate: sr,
  });
  triggerVoice(ctx as any, sound, midiToHz(midi), 0, dur * 0.8, 1.0, ctx.destination as any);
  return await ctx.startRendering();
}

export async function renderWebAudio(g: Graph, result: SolveResult, outputPath: string) {
  const transport = lookup<any>(g, g.transport);
  const tempo = lookup<any>(g, transport.tempo);
  const bpm: number = tempo.bpm;
  const beatsToSec = (b: number) => (b / bpm) * 60;

  const lastBeat = Math.max(...result.events.map(e => e.positionBeats + e.durationBeats), 4);
  const lengthSec = beatsToSec(lastBeat) + 2.5;
  const sr = 44100;
  const totalSamples = Math.ceil(sr * lengthSec);

  // ---- Compute kick times globally (for sidechain across all tracks) ----
  const kickTimesSec: number[] = [];
  for (const ev of result.events) {
    if (ev.pitch === undefined) continue;
    const trackCtx = lookup<any>(g, ev.track);
    if (trackCtx.isPercussion && soundForDrumNote(ev.pitch) === "kick") {
      kickTimesSec.push(beatsToSec(ev.positionBeats));
    }
  }

  // ---- Group events by track ----
  const eventsByTrack = new Map<string, any[]>();
  for (const ev of result.events) {
    if (ev.pitch === undefined) continue;
    const list = eventsByTrack.get(ev.track) ?? [];
    list.push(ev);
    eventsByTrack.set(ev.track, list);
  }

  // ---- Find sidechain declarations (which tracks duck which) ----
  const sidechainRels = [...g.nodes.values()].filter(
    n => n.kind === "relationship" && (n as any).type === "sidechain"
  ) as any[];

  // Map: target track id -> { amount, releaseMs, triggerTimes }
  const trackSidechainConfig = new Map<string, { amount: number; releaseSec: number; triggerTimes: number[] }>();
  if (sidechainRels.length > 0) {
    for (const sc of sidechainRels) {
      const triggerTimes: number[] = [];
      for (const ev of result.events) {
        if (ev.pitch === undefined) continue;
        if (ev.track !== sc.trigger) continue;
        const trk = lookup<any>(g, ev.track);
        if (trk.isPercussion && ev.pitch !== 36) continue;
        triggerTimes.push(beatsToSec(ev.positionBeats));
      }
      const releaseSec = sc.releaseMs / 1000;
      for (const duckId of sc.ducks) {
        trackSidechainConfig.set(duckId, { amount: sc.amount, releaseSec, triggerTimes });
      }
    }
  }

  // ---- Render each track to its own buffer ----
  const tracks: any[] = [];
  for (const n of g.nodes.values()) {
    if (n.kind === "context" && (n as any).type === "track") tracks.push(n);
  }
  console.log(`  Rendering ${tracks.length} tracks separately...`);

  const trackBuffers: any[] = [];
  let totalEnvelopesApplied = 0;
  let totalPerNoteEnvelopesApplied = 0;

  for (const track of tracks) {
    const events = eventsByTrack.get(track.id) ?? [];
    if (events.length === 0) continue;

    console.log(`    "${track.name}": starting (${events.length} events)...`);
    const t0 = Date.now();
    const { buffer, envelopesApplied, perNoteEnvelopesApplied } = await renderOneTrack(
      g, track, events, kickTimesSec, trackSidechainConfig.get(track.id),
      lengthSec, sr, beatsToSec
    );
    totalEnvelopesApplied += envelopesApplied;
    totalPerNoteEnvelopesApplied += perNoteEnvelopesApplied;
    console.log(`    "${track.name}": ${events.length} events in ${Date.now() - t0}ms`);
    trackBuffers.push(buffer);
  }

  if (totalEnvelopesApplied > 0) console.log(`  Applied ${totalEnvelopesApplied} envelope binding(s)`);
  if (totalPerNoteEnvelopesApplied > 0) console.log(`  Applied ${totalPerNoteEnvelopesApplied} per-note envelope(s)`);

  // ---- Final mix: sum track buffers, apply master saturation ----
  console.log("  Mixing...");
  const mixCtx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: totalSamples,
    sampleRate: sr,
  });
  const master = mixCtx.createGain();
  master.gain.value = 0.8;
  const masterClip = mixCtx.createWaveShaper();
  masterClip.curve = makeSoftClipCurve(2.5);
  masterClip.oversample = "4x";
  master.connect(masterClip);
  masterClip.connect(mixCtx.destination);

  for (const buf of trackBuffers) {
    const src = mixCtx.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start(0);
  }

  console.log("Rendering...");
  const finalBuf = await mixCtx.startRendering();
  console.log(`Rendered ${finalBuf.length} samples (${(finalBuf.length / sr).toFixed(1)}s), writing WAV...`);
  writeWav(finalBuf, outputPath);
}

/**
 * Render a single track to an AudioBuffer.
 * Each track gets its own OfflineAudioContext so node count per context stays manageable.
 */
async function renderOneTrack(
  g: Graph,
  track: any,
  events: any[],
  kickTimesSec: number[],
  sidechainConfig: { amount: number; releaseSec: number; triggerTimes: number[] } | undefined,
  lengthSec: number,
  sr: number,
  beatsToSec: (b: number) => number,
): Promise<{ buffer: any; envelopesApplied: number; perNoteEnvelopesApplied: number }> {
  const totalSamples = Math.ceil(sr * lengthSec);
  const ctx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: totalSamples,
    sampleRate: sr,
  });

  const trackName = track.name.toLowerCase();
  const isLead   = trackName.includes("lead");
  const isPad    = trackName.includes("pad");
  const isStab   = trackName.includes("stab");
  const isBass   = trackName.includes("bass");
  const isDrums  = trackName === "drums" || track.isPercussion;

  // ---- Build per-track bus chain ----
  // voice -> volumeBus (envelope target) -> duck (sidechain) -> [filter for pad] -> [reverb send] -> destination
  const defaultGain = isPad ? 0.55 : isStab ? 0.55 : isLead ? 0.7 : isBass ? 0.9 : isDrums ? 1.0 : 0.7;
  const volumeBus = ctx.createGain();
  volumeBus.gain.value = defaultGain;

  const duck = ctx.createGain();
  duck.gain.value = 1.0;
  volumeBus.connect(duck);

  // Pad gets a filter; others go straight through
  let postBus: any = duck;
  let trackFilter: any = null;
  if (isPad) {
    trackFilter = ctx.createBiquadFilter();
    trackFilter.type = "lowpass";
    trackFilter.frequency.value = 800;
    trackFilter.Q.value = 0.7;
    duck.connect(trackFilter);
    postBus = trackFilter;
  }

  // Reverb sends for pad, lead, stab
  if (isPad || isLead || isStab) {
    const reverbDur = isPad ? 2.5 : isLead ? 1.4 : 0.9;
    const reverbMix = isPad ? 0.3 : isLead ? 0.18 : 0.15;
    const reverb = makeSimpleReverb(ctx, reverbDur, reverbMix);
    postBus.connect(reverb.input);
    postBus.connect(ctx.destination);  // dry
    reverb.output.connect(ctx.destination);  // wet
  } else {
    postBus.connect(ctx.destination);
  }

  // ---- Apply sidechain ducking on this track's duck node ----
  // Drums never duck themselves. Non-drum tracks duck on kicks.
  let envelopesApplied = 0;
  if (!isDrums) {
    const cfg = sidechainConfig ?? (kickTimesSec.length > 0
      ? { amount: 0.35, releaseSec: 0.18, triggerTimes: kickTimesSec }
      : undefined);
    if (cfg && cfg.triggerTimes.length > 0) {
      duck.gain.setValueAtTime(1.0, 0);
      for (const tSec of cfg.triggerTimes) {
        duck.gain.setValueAtTime(1.0, Math.max(0, tSec - 0.001));
        duck.gain.linearRampToValueAtTime(1.0 - cfg.amount, tSec + 0.005);
        duck.gain.linearRampToValueAtTime(1.0, tSec + cfg.releaseSec);
      }
    }
  }

  // ---- Apply envelope bindings on this track (gain + filter.cutoff) ----
  let hasFilterEnv = false;
  for (const node of g.nodes.values()) {
    if (node.kind !== "relationship" || (node as any).type !== "envelope_binding") continue;
    const bind = node as any;
    if (bind.targetEntity !== track.id) continue;
    const env = lookup<any>(g, bind.envelope);
    const t0 = beatsToSec(env.startBeats);
    const t1 = beatsToSec(env.endBeats);
    if (bind.targetParameter === "gain") {
      volumeBus.gain.cancelScheduledValues(t0);
      volumeBus.gain.setValueAtTime(Math.max(0.0001, env.from), t0);
      if (env.curve === "exp") volumeBus.gain.exponentialRampToValueAtTime(Math.max(0.0001, env.to), t1);
      else                     volumeBus.gain.linearRampToValueAtTime(Math.max(0.0001, env.to), t1);
      envelopesApplied++;
    } else if (bind.targetParameter === "filter.cutoff" && trackFilter) {
      trackFilter.frequency.cancelScheduledValues(t0);
      trackFilter.frequency.setValueAtTime(Math.max(20, env.from), t0);
      if (env.curve === "exp") trackFilter.frequency.exponentialRampToValueAtTime(Math.max(20, env.to), t1);
      else                     trackFilter.frequency.linearRampToValueAtTime(Math.max(20, env.to), t1);
      envelopesApplied++;
      hasFilterEnv = true;
    }
  }
  // Default slow filter open for pad if no explicit envelope
  if (trackFilter && !hasFilterEnv) {
    trackFilter.frequency.setValueAtTime(400, 0);
    trackFilter.frequency.linearRampToValueAtTime(3500, lengthSec * 0.7);
  }

  // ---- Pre-render drum buffers if this is a drums track (perf win) ----
  // Replaces per-hit voice synthesis (4-5 nodes) with one BufferSourceNode per hit.
  const drumBufferCache = new Map<string, any>();
  if (isDrums) {
    const needed = new Set<string>();
    for (const ev of events) {
      const sound = soundForDrumNote(ev.pitch);
      needed.add(`${sound}|${ev.pitch}`);
    }
    for (const key of needed) {
      const [sound, midiStr] = key.split("|");
      const midi = parseInt(midiStr, 10);
      drumBufferCache.set(key, await prerenderDrum(sound as SoundKind, midi, sr));
    }
  }

  // ---- Pre-render instrument voices for synth tracks (perf win) ----
  // Cache by (pitch, durBucket). Each event uses BufferSourceNode + GainNode (2 nodes)
  // instead of constructing the full instrument graph (~10 nodes) per event.
  //
  // EXCEPTION: events whose source instance has a per-note envelope must use full
  // voice synthesis so we can attach the envelope to the noteGain output.
  const instrumentBufferCache = new Map<string, any>();
  const instancesWithEnvelopes = new Set<string>();
  for (const node of g.nodes.values()) {
    if (node.kind !== "relationship" || (node as any).type !== "envelope_binding") continue;
    const bind = node as any;
    if (bind.targetParameter !== "gain") continue;
    const target = g.nodes.get(bind.targetEntity);
    if (target?.kind === "instance") instancesWithEnvelopes.add(bind.targetEntity);
  }

  if (track.instrument && !isDrums) {
    const inst = lookup<any>(g, track.instrument);
    const needed = new Set<string>();
    for (const ev of events) {
      // Only cache buffers for events without per-note envelopes
      if (ev.fromInstance && instancesWithEnvelopes.has(ev.fromInstance)) continue;
      const dur = beatsToSec(ev.durationBeats);
      needed.add(`${ev.pitch}|${durBucket(dur)}`);
    }
    for (const key of needed) {
      const [midiStr, durStr] = key.split("|");
      const midi = parseInt(midiStr, 10);
      const durSec = parseFloat(durStr);
      instrumentBufferCache.set(key, await prerenderInstrumentBuffer(inst, midi, durSec, sr));
    }
  }

  // ---- Render each event ----
  const instanceNoteGains = new Map<string, any[]>();
  for (const ev of events) {
    const tSec = beatsToSec(ev.positionBeats);
    const durSec = Math.max(0.02, beatsToSec(ev.durationBeats));
    const vel = (ev.velocity ?? 90) / 127;

    if (track.instrument && !isDrums) {
      const needsFullVoice = ev.fromInstance && instancesWithEnvelopes.has(ev.fromInstance);
      if (needsFullVoice) {
        // Full voice synthesis so per-note envelope can attach to noteGain
        const inst = lookup<any>(g, track.instrument);
        const freqHz = midiToHz(ev.pitch);
        try {
          const { noteGain } = renderInstrumentVoice(inst, {
            ctx: ctx as any,
            startTime: tSec,
            endTime: tSec + durSec,
            freqHz,
            velocity: vel,
            outputDest: volumeBus,
          });
          if (ev.fromInstance) {
            const list = instanceNoteGains.get(ev.fromInstance) ?? [];
            list.push({ gain: noteGain, startSec: tSec, endSec: tSec + durSec });
            instanceNoteGains.set(ev.fromInstance, list);
          }
        } catch (e: any) {
          console.error(`  Instrument ${inst.name} voice failed: ${e.message}`);
        }
      } else {
        // Fast path: use pre-rendered buffer
        const key = `${ev.pitch}|${durBucket(durSec)}`;
        const buf = instrumentBufferCache.get(key);
        if (!buf) continue;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const velGain = ctx.createGain();
        velGain.gain.value = vel;
        src.connect(velGain);
        velGain.connect(volumeBus);
        src.start(tSec);
      }
    } else if (isDrums) {
      const sound = soundForDrumNote(ev.pitch);
      const key = `${sound}|${ev.pitch}`;
      const buf = drumBufferCache.get(key);
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const velGain = ctx.createGain();
      velGain.gain.value = vel;
      src.connect(velGain);
      velGain.connect(volumeBus);
      src.start(tSec);
    } else {
      // Legacy voice path (tracks without an instrument)
      const sound = soundForTrack(track.name);
      triggerVoice(ctx as any, sound, midiToHz(ev.pitch), tSec, durSec, vel, volumeBus);
    }
  }

  // ---- Apply per-note envelopes (only for instances owned by this track) ----
  let perNoteEnvelopesApplied = 0;
  for (const node of g.nodes.values()) {
    if (node.kind !== "relationship" || (node as any).type !== "envelope_binding") continue;
    const bind = node as any;
    if (bind.targetParameter !== "gain") continue;
    const gainList = instanceNoteGains.get(bind.targetEntity);
    if (!gainList) continue;
    const env = lookup<any>(g, bind.envelope);
    const t0 = beatsToSec(env.startBeats);
    const t1 = beatsToSec(env.endBeats);
    for (const { gain } of gainList) {
      gain.gain.setValueAtTime(Math.max(0.0001, env.from), t0);
      if (env.curve === "exp") gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, env.to), t1);
      else                     gain.gain.linearRampToValueAtTime(Math.max(0.0001, env.to), t1);
    }
    perNoteEnvelopesApplied++;
  }

  const buffer = await ctx.startRendering();
  return { buffer, envelopesApplied, perNoteEnvelopesApplied };
}

// ===== Voice synthesis ===================================================

function triggerVoice(
  ctx: OfflineAudioContext,
  sound: SoundKind,
  freq: number,
  t: number,
  dur: number,
  vel: number,
  dest: AudioNode,
) {
  switch (sound) {
    case "kick":           return voiceKick(ctx, t, vel, dest);
    case "snare":          return voiceSnare(ctx, t, vel, dest);
    case "closed_hat":     return voiceClosedHat(ctx, t, vel, dest);
    case "open_hat":       return voiceOpenHat(ctx, t, vel, dest);
    case "crash":          return voiceCrash(ctx, t, vel, dest);
    case "clap":           return voiceClap(ctx, t, vel, dest);
    case "synth_bass":     return voiceSynthBass(ctx, freq, t, dur, vel, dest);
    case "clavinet_stab":  return voiceClavinet(ctx, freq, t, dur, vel, dest);
    case "warm_pad":       return voiceWarmPad(ctx, freq, t, dur, vel, dest);
    case "saw_lead":       return voiceSawLead(ctx, freq, t, dur, vel, dest);
  }
}

function voiceKick(ctx: OfflineAudioContext, t: number, vel: number, dest: AudioNode) {
  // Sine with pitch sweep and click. 808-style.
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel * 1.1, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + 0.4);

  // Click transient — high-passed noise burst for impact
  const noise = makeNoise(ctx, 0.01);
  const click = ctx.createBiquadFilter();
  click.type = "highpass";
  click.frequency.value = 3000;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(vel * 0.4, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
  noise.connect(click);
  click.connect(clickGain);
  clickGain.connect(dest);
  noise.start(t);
  noise.stop(t + 0.02);
}

function voiceSnare(ctx: OfflineAudioContext, t: number, vel: number, dest: AudioNode) {
  // Noise + a 180 Hz body tone.
  const noise = makeNoise(ctx, 0.25);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1500;
  const ngain = ctx.createGain();
  ngain.gain.setValueAtTime(0, t);
  ngain.gain.linearRampToValueAtTime(vel * 0.7, t + 0.002);
  ngain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  noise.connect(hp);
  hp.connect(ngain);
  ngain.connect(dest);
  noise.start(t);
  noise.stop(t + 0.25);

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.value = 180;
  const bgain = ctx.createGain();
  bgain.gain.setValueAtTime(0, t);
  bgain.gain.linearRampToValueAtTime(vel * 0.35, t + 0.002);
  bgain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  body.connect(bgain);
  bgain.connect(dest);
  body.start(t);
  body.stop(t + 0.1);
}

function voiceClosedHat(ctx: OfflineAudioContext, t: number, vel: number, dest: AudioNode) {
  const noise = makeNoise(ctx, 0.06);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel * 0.3, t + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  noise.connect(hp);
  hp.connect(gain);
  gain.connect(dest);
  noise.start(t);
  noise.stop(t + 0.06);
}

function voiceOpenHat(ctx: OfflineAudioContext, t: number, vel: number, dest: AudioNode) {
  const noise = makeNoise(ctx, 0.4);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel * 0.35, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  noise.connect(hp);
  hp.connect(gain);
  gain.connect(dest);
  noise.start(t);
  noise.stop(t + 0.4);
}

function voiceCrash(ctx: OfflineAudioContext, t: number, vel: number, dest: AudioNode) {
  const noise = makeNoise(ctx, 2.0);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel * 0.5, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
  noise.connect(hp);
  hp.connect(gain);
  gain.connect(dest);
  noise.start(t);
  noise.stop(t + 2.0);
}

function voiceClap(ctx: OfflineAudioContext, t: number, vel: number, dest: AudioNode) {
  // Three quick noise bursts ~10ms apart, then a slower tail.
  for (let i = 0; i < 3; i++) {
    const tt = t + i * 0.012;
    const noise = makeNoise(ctx, 0.03);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 1.0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(vel * 0.45, tt + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, tt + 0.03);
    noise.connect(bp);
    bp.connect(g);
    g.connect(dest);
    noise.start(tt);
    noise.stop(tt + 0.04);
  }
}

function voiceSynthBass(ctx: OfflineAudioContext, freq: number, t: number, dur: number, vel: number, dest: AudioNode) {
  // Saw + sub-sine, lowpass with quick envelope. Punchy.
  const saw = ctx.createOscillator();
  saw.type = "sawtooth";
  saw.frequency.value = freq;

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = freq * 0.5;

  const mix = ctx.createGain();
  const sawGain = ctx.createGain();
  sawGain.gain.value = 0.7;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.8;
  saw.connect(sawGain);
  sub.connect(subGain);
  sawGain.connect(mix);
  subGain.connect(mix);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(1800, t);
  filter.frequency.exponentialRampToValueAtTime(280, t + Math.min(0.18, dur));

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel * 0.8, t + 0.005);
  amp.gain.setValueAtTime(vel * 0.7, t + dur * 0.5);
  amp.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.05);

  mix.connect(filter);
  filter.connect(amp);
  amp.connect(dest);

  saw.start(t);
  sub.start(t);
  saw.stop(t + dur + 0.1);
  sub.stop(t + dur + 0.1);
}

function voiceClavinet(ctx: OfflineAudioContext, freq: number, t: number, dur: number, vel: number, dest: AudioNode) {
  // Two square waves slightly detuned, fast filter envelope, short percussive amp envelope.
  const sq1 = ctx.createOscillator();
  sq1.type = "square";
  sq1.frequency.value = freq;
  const sq2 = ctx.createOscillator();
  sq2.type = "square";
  sq2.frequency.value = freq * 1.005;

  const mix = ctx.createGain();
  mix.gain.value = 0.5;
  sq1.connect(mix);
  sq2.connect(mix);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq * 6, t);
  filter.frequency.exponentialRampToValueAtTime(freq * 2.5, t + 0.06);
  filter.Q.value = 3;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel * 0.7, t + 0.003);
  amp.gain.exponentialRampToValueAtTime(0.001, t + Math.min(dur + 0.1, 0.25));

  mix.connect(filter);
  filter.connect(amp);
  amp.connect(dest);

  sq1.start(t);
  sq2.start(t);
  sq1.stop(t + 0.3);
  sq2.stop(t + 0.3);
}

function voiceWarmPad(ctx: OfflineAudioContext, freq: number, t: number, dur: number, vel: number, dest: AudioNode) {
  // Stack of detuned sawtooths — supersaw flavor — with slow attack/release.
  const detunes = [-12, -7, 0, 7, 12]; // cents
  const mix = ctx.createGain();
  mix.gain.value = 1 / detunes.length;
  const oscs: OscillatorNode[] = [];
  for (const d of detunes) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    o.detune.value = d;
    o.connect(mix);
    oscs.push(o);
  }

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel * 0.45, t + 0.25);
  amp.gain.setValueAtTime(vel * 0.45, t + dur - 0.3);
  amp.gain.linearRampToValueAtTime(0.001, t + dur + 0.3);
  mix.connect(amp);
  amp.connect(dest);

  for (const o of oscs) {
    o.start(t);
    o.stop(t + dur + 0.4);
  }
}

function voiceSawLead(ctx: OfflineAudioContext, freq: number, t: number, dur: number, vel: number, dest: AudioNode) {
  // Two detuned sawtooths, lowpass with envelope, slight bite.
  const s1 = ctx.createOscillator();
  s1.type = "sawtooth";
  s1.frequency.value = freq;
  s1.detune.value = -6;
  const s2 = ctx.createOscillator();
  s2.type = "sawtooth";
  s2.frequency.value = freq;
  s2.detune.value = 6;

  const mix = ctx.createGain();
  mix.gain.value = 0.5;
  s1.connect(mix);
  s2.connect(mix);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 5;
  filter.frequency.setValueAtTime(freq * 8, t);
  filter.frequency.exponentialRampToValueAtTime(freq * 3, t + Math.min(dur, 0.3));

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel * 0.55, t + 0.008);
  amp.gain.setValueAtTime(vel * 0.5, t + dur * 0.6);
  amp.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.06);

  mix.connect(filter);
  filter.connect(amp);
  amp.connect(dest);

  s1.start(t);
  s2.start(t);
  s1.stop(t + dur + 0.1);
  s2.stop(t + dur + 0.1);
}

// ===== Helpers ==========================================================

function makeNoise(ctx: OfflineAudioContext, durSec: number): AudioBufferSourceNode {
  const sr = ctx.sampleRate;
  const length = Math.ceil(sr * durSec);
  const buf = ctx.createBuffer(1, length, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function makeSoftClipCurve(amount: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

function makeSimpleReverb(ctx: OfflineAudioContext, durSec: number, mix: number) {
  // Convolution with an exponentially-decaying noise impulse — cheap but works.
  const sr = ctx.sampleRate;
  const length = Math.ceil(sr * durSec);
  const buf = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / sr;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / (durSec * 0.4));
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  const wet = ctx.createGain();
  wet.gain.value = mix;
  const input = ctx.createGain();
  input.gain.value = 1;
  const output = ctx.createGain();
  output.gain.value = 1;
  input.connect(conv);
  conv.connect(wet);
  wet.connect(output);
  return { input, output };
}

function writeWav(buf: any, path: string) {
  const sr = buf.sampleRate;
  const left = buf.getChannelData(0);
  const right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : left;
  const samples = left.length;
  const blockAlign = 4; // stereo, 16-bit
  const byteRate = sr * blockAlign;
  const dataSize = samples * blockAlign;
  const out = Buffer.alloc(44 + dataSize);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);   // PCM
  out.writeUInt16LE(2, 22);   // stereo
  out.writeUInt32LE(sr, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    out.writeInt16LE(Math.floor(l * 32767), 44 + i * 4);
    out.writeInt16LE(Math.floor(r * 32767), 44 + i * 4 + 2);
  }
  fs.writeFileSync(path, out);
}
