import { describe, expect, it } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import type { Instrument } from "../../src/core/audio_types.ts";
import { startLiveVoice } from "../../src/midi/audio_renderer.ts";
import { LivePlayer } from "../../src/live/player.ts";
import { buildInstrument } from "../../src/instruments/registry.ts";

const SR = 22050;

function makeCtx(durSec: number) {
  return new OfflineAudioContext({ numberOfChannels: 1, length: Math.ceil(SR * durSec), sampleRate: SR });
}

function windowRms(buffer: AudioBuffer, fromSec: number, toSec: number): number {
  const data = buffer.getChannelData(0);
  const from = Math.max(0, Math.floor(fromSec * buffer.sampleRate));
  const to = Math.min(data.length, Math.floor(toSec * buffer.sampleRate));
  let sumSq = 0;
  for (let i = from; i < to; i++) sumSq += data[i] * data[i];
  return to > from ? Math.sqrt(sumSq / (to - from)) : 0;
}

/** Sustaining test instrument: saw through ADSR amp (s=0.7, r=0.2). */
function sustainer(): Instrument {
  return {
    kind: "instrument", id: "inst_l", name: "l", polyphony: 4,
    audioNodes: {
      osc: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq" },
      env: { kind: "audio_node", type: "env_gen", envType: "adsr", a: 0.01, d: 0.05, s: 0.7, r: 0.2 },
      amp: { kind: "audio_node", type: "amp", input: "osc",
             gain: { base: 0, mod: [{ source: "env", amount: 0.5 }] } },
    },
    output: "amp",
  };
}

describe("startLiveVoice", () => {
  it("sustains indefinitely while the gate is held", async () => {
    const ctx = makeCtx(2.0);
    const voice = startLiveVoice(sustainer(), {
      ctx, destination: ctx.destination, freqHz: 220, when: 0,
    });
    expect(voice.active).toBe(true);
    const buf = await ctx.startRendering();
    // Still fully sounding at 1.9s — no pre-scheduled end anywhere
    expect(windowRms(buf as AudioBuffer, 1.7, 1.95)).toBeGreaterThan(0.05);
  });

  it("noteOff releases the voice, which then goes silent", async () => {
    const ctx = makeCtx(2.0);
    const voice = startLiveVoice(sustainer(), {
      ctx, destination: ctx.destination, freqHz: 220, when: 0,
    });
    const silentAt = voice.noteOff(1.0);
    expect(voice.active).toBe(false);
    expect(silentAt).toBeGreaterThan(1.2);   // release r=0.2 + margins
    const buf = await ctx.startRendering();
    const sustain = windowRms(buf as AudioBuffer, 0.7, 0.95);
    const released = windowRms(buf as AudioBuffer, 1.5, 1.9);
    expect(sustain).toBeGreaterThan(0.05);
    expect(released).toBeLessThan(sustain * 0.02);
  });

  it("double noteOff is a no-op", async () => {
    const ctx = makeCtx(0.5);
    const voice = startLiveVoice(sustainer(), {
      ctx, destination: ctx.destination, freqHz: 220, when: 0,
    });
    voice.noteOff(0.2);
    expect(() => voice.noteOff(0.3)).not.toThrow();
  });

  it("live voices work for library instruments with effect chains", async () => {
    const ctx = makeCtx(1.5);
    const { instrument } = buildInstrument("echo_pluck");   // has feedback delay
    const voice = startLiveVoice(instrument, {
      ctx, destination: ctx.destination, freqHz: 330, when: 0,
    });
    voice.noteOff(0.2);
    const buf = await ctx.startRendering();
    // Echoes (0.28s delay) keep arriving after the released pluck
    expect(windowRms(buf as AudioBuffer, 0.8, 1.2)).toBeGreaterThan(0.002);
  });
});

describe("LivePlayer", () => {
  it("plays several instruments with effect chains at once", async () => {
    const ctx = makeCtx(2.0);
    const player = new LivePlayer(ctx, { masterGain: 0.9 });
    player.addTrack("bass", buildInstrument("acid_bass").instrument);
    player.addTrack("keys", buildInstrument("fm_epiano").instrument);
    player.addTrack("pad", buildInstrument("string_machine").instrument, { gain: 0.6 });

    player.noteOn("bass", 33, 1.0, 0.05);
    player.noteOn("keys", 64, 0.8, 0.05);
    player.noteOn("keys", 67, 0.8, 0.05);
    player.noteOn("pad", 52, 0.7, 0.05);
    player.noteOn("pad", 59, 0.7, 0.05);

    expect(player.activeVoices("keys")).toBe(2);
    expect(player.trackNames()).toEqual(["bass", "keys", "pad"]);

    player.noteOff("bass", 33, 1.0);
    player.noteOff("keys", 64, 1.0);
    player.noteOff("keys", 67, 1.0);
    player.noteOff("pad", 52, 1.0);
    player.noteOff("pad", 59, 1.0);

    const buf = await ctx.startRendering();
    // All three instruments sounding together mid-note
    expect(windowRms(buf as AudioBuffer, 0.4, 0.9)).toBeGreaterThan(0.05);
    // And released by the end
    expect(windowRms(buf as AudioBuffer, 1.8, 1.98)).toBeLessThan(0.02);
  });

  it("enforces polyphony by stealing the oldest voice", () => {
    const ctx = makeCtx(1.0);
    const player = new LivePlayer(ctx);
    player.addTrack("mono-ish", sustainer(), { polyphony: 2 });
    player.noteOn("mono-ish", 60, 0.8, 0.0);
    player.noteOn("mono-ish", 64, 0.8, 0.1);
    player.noteOn("mono-ish", 67, 0.8, 0.2);   // steals the 60
    expect(player.activeVoices("mono-ish")).toBe(2);
  });

  it("bus effect chains process the summed track", async () => {
    const ctx = makeCtx(2.5);
    const player = new LivePlayer(ctx, { noLimiter: true });
    player.addTrack("keys", sustainer(), {
      effects: [{
        kind: "audio_node", type: "effect", effectType: "delay",
        input: "", params: { time: 0.4, feedback: 0.5, mix: 0.5 },
      }],
    });
    player.noteOn("keys", 60, 0.9, 0.0);
    player.noteOff("keys", 60, 0.3);
    const buf = await ctx.startRendering();
    // Voice is silent by ~0.55s; bus delay echoes at 0.4/0.8/1.2... persist
    expect(windowRms(buf as AudioBuffer, 1.1, 1.4)).toBeGreaterThan(0.003);
  });

  it("allNotesOff releases everything; unknown tracks throw", () => {
    const ctx = makeCtx(1.0);
    const player = new LivePlayer(ctx);
    player.addTrack("a", sustainer());
    player.noteOn("a", 60, 0.8, 0.0);
    player.allNotesOff(0.5);
    expect(player.activeVoices("a")).toBe(0);
    expect(() => player.noteOn("nope", 60)).toThrow(/Unknown track/);
  });

  it("samplers play live, including loops stopped at noteOff", async () => {
    const ctx = makeCtx(2.0);
    const sampleCtx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: SR });
    const smp = sampleCtx.createBuffer(1, Math.ceil(SR * 0.25), SR);
    const data = smp.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = 0.7 * Math.sin(2 * Math.PI * 440 * i / SR);

    const inst: Instrument = {
      kind: "instrument", id: "inst_sl", name: "sl", polyphony: 2,
      audioNodes: {
        smp: { kind: "audio_node", type: "sampler", sample: "tone", rootMidi: 69, loop: true },
        env: { kind: "audio_node", type: "env_gen", envType: "adsr", a: 0.01, d: 0.02, s: 1, r: 0.1 },
        amp: { kind: "audio_node", type: "amp", input: "smp",
               gain: { base: 0, mod: [{ source: "env", amount: 0.8 }] } },
      },
      output: "amp",
    };
    const player = new LivePlayer(ctx, { samples: { tone: smp } });
    player.addTrack("smp", inst);
    player.noteOn("smp", 69, 0.9, 0.0);
    player.noteOff("smp", 69, 1.0);
    const buf = await ctx.startRendering();
    // Looped well past the 0.25s sample length while held
    expect(windowRms(buf as AudioBuffer, 0.6, 0.95)).toBeGreaterThan(0.05);
    // Stopped after release
    expect(windowRms(buf as AudioBuffer, 1.5, 1.95)).toBeLessThan(0.01);
  });
});
