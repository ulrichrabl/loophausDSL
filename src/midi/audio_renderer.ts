/**
 * Audio-graph renderer.
 *
 * Given an Instrument (a named sub-graph of audio nodes), allocate a voice
 * at note-on time: build the Web Audio nodes, wire connections, route
 * modulation, schedule the gate. The voice plays until the release tail
 * completes, then disconnects.
 *
 * Modulation routing:
 *   - Param is a number       → setValueAtTime once
 *   - Param is "$port"        → per-voice value (freq/vel/gate)
 *   - Param is "nodeRef"      → audio-rate signal connected to the AudioParam
 *   - Param is { base, mod }  → base value + each modulation source connected
 *                                through a gain (the amount) to the AudioParam
 */
import type { OfflineAudioContext as OACType } from "node-web-audio-api";
import type { Instrument, AudioNode, AudioParam, Modulation, SampleBank } from "../core/audio_types.ts";

interface VoiceContext {
  ctx: OACType;
  startTime: number;
  endTime: number;          // gate-off time (note duration)
  freqHz: number;
  velocity: number;         // 0..1
  outputDest: any;          // AudioNode to connect the voice's output to (track bus)
  /** Source run-out after gate-off. Computed from envelope releases if unset. */
  tailSec?: number;
  /** Host-provided sample buffers, required if the instrument has sampler nodes. */
  samples?: SampleBank;
  /**
   * Live mode: note duration is unknown at note-on. Envelopes hold their
   * sustain phase until noteOff() is called on the LiveVoice handle;
   * sources start but don't schedule stops; noise buffers loop.
   */
  live?: boolean;
}

interface BuiltNode {
  /** The Web Audio node producing audio output (if any). */
  audioOut?: any;
  /**
   * Where upstream audio should connect. Compound nodes (delay, chorus,
   * reverb — anything with internal wet/dry routing) have a distinct entry
   * point; simple nodes leave this unset and receive input on audioOut.
   */
  audioIn?: any;
  /** Some nodes produce control-rate signals; same property holds it. */
  controlOut?: any;
  /** Filter/amp nodes have AudioParams (cutoff, gain) that modulation targets. */
  params?: Record<string, any>;
  /** Internal source nodes needing explicit start/stop (e.g. LFO oscillator). */
  sources?: any[];
  /** Live mode: envelope generators awaiting their release phase. */
  liveEnv?: { node: import("../core/audio_types.ts").EnvGenNode; cs: any };
}

interface VoiceHandle {
  noteGain: any;   // The music-graph-controllable gain at the voice's output
}

const TAIL_SEC = 0.5;  // minimum padding after note-off for release decay

/**
 * How long sources must keep running after gate-off so envelope releases
 * complete. (Effect ring-out is separate — see instrumentTailSec.)
 */
function releaseTailSec(inst: Instrument): number {
  let tail = TAIL_SEC;
  for (const node of Object.values(inst.audioNodes)) {
    if ((node as AudioNode).type === "env_gen") {
      const r = (node as { r?: number }).r ?? 0;
      tail = Math.max(tail, r + 0.1);
    }
  }
  return tail;
}

/**
 * Total tail an instrument needs after note-off: envelope releases plus
 * ring-out of time-based effects (delay feedback, reverb decay), plus
 * one-shot sample run-out when a SampleBank is provided. Used to size
 * pre-render buffers so nothing gets truncated.
 */
export function instrumentTailSec(inst: Instrument, minTailSec = 1.5, samples?: SampleBank): number {
  let tail = Math.max(minTailSec, releaseTailSec(inst));
  for (const node of Object.values(inst.audioNodes)) {
    const n = node as AudioNode;
    if (n.type === "sampler" && !n.loop && samples) {
      const buf = samples[n.sample] as { duration?: number } | undefined;
      if (buf?.duration) tail = Math.max(tail, buf.duration + 0.1);
      continue;
    }
    if (n.type !== "effect") continue;
    const p = (name: string, dflt: number): number => {
      const v = n.params?.[name];
      return typeof v === "number" ? v : dflt;
    };
    if (n.effectType === "delay") {
      const time = p("time", 0.25);
      const feedback = Math.min(0.95, Math.max(0, p("feedback", 0.35)));
      // Echoes repeat every `time` sec, decaying by `feedback` each pass.
      // Ring until the echo falls below -60 dB (0.001).
      const repeats = feedback > 0 ? Math.ceil(Math.log(0.001) / Math.log(feedback)) : 1;
      tail += Math.min(6, time * repeats);
    } else if (n.effectType === "reverb") {
      tail += p("duration", 1.8);
    } else if (n.effectType === "chorus") {
      tail += 0.05;
    }
  }
  return Math.min(tail, 10);
}

/**
 * Whether any modulation route in the instrument reads the given port
 * (e.g. "$vel"). Used by the track renderer to decide if pre-rendered
 * voice buffers must be bucketed by velocity to preserve timbre.
 */
export function instrumentUsesPort(inst: Instrument, port: string): boolean {
  const paramUses = (p: unknown): boolean =>
    typeof p === "object" && p !== null && Array.isArray((p as { mod?: Modulation[] }).mod) &&
    ((p as { mod: Modulation[] }).mod).some(m => m.source === port);
  for (const node of Object.values(inst.audioNodes)) {
    for (const value of Object.values(node as unknown as Record<string, unknown>)) {
      if (paramUses(value)) return true;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        // effect params: Record<string, AudioParam>
        for (const inner of Object.values(value as Record<string, unknown>)) {
          if (paramUses(inner)) return true;
        }
      }
    }
  }
  return false;
}

export function renderInstrumentVoice(inst: Instrument, voice: VoiceContext): VoiceHandle {
  const { ctx } = voice;
  voice.tailSec = voice.tailSec ?? releaseTailSec(inst);
  const built: Record<string, BuiltNode> = {};
  const order = topoSort(inst);

  // Pass 1: instantiate every node
  for (const name of order) {
    const node = inst.audioNodes[name] as AudioNode;
    built[name] = instantiate(ctx, node, voice, built);
  }

  // Pass 2: wire modulations (now that all nodes exist)
  for (const name of order) {
    const node = inst.audioNodes[name] as AudioNode;
    wireMods(ctx, node, built[name], voice, built);
  }

  // Connect output → noteGain → destination.
  // The noteGain is the hook the music graph uses to modulate this voice
  // (e.g. a swell envelope on a specific held note).
  const outNode = built[inst.output];
  if (!outNode?.audioOut) {
    throw new Error(`Instrument ${inst.name}: output node "${inst.output}" has no audioOut`);
  }
  const noteGain = ctx.createGain();
  noteGain.gain.value = 1.0;
  outNode.audioOut.connect(noteGain);
  noteGain.connect(voice.outputDest);

  // Schedule starts/stops
  for (const name of order) {
    const node = inst.audioNodes[name] as AudioNode;
    scheduleNode(node, built[name], voice);
  }

  return { noteGain };
}

// ---- Live voices ---------------------------------------------------------

export interface LiveVoiceOptions {
  ctx: any;                 // real-time AudioContext (or offline, for tests)
  destination: any;         // where the voice output connects (track bus)
  freqHz: number;
  velocity?: number;        // 0..1 (default 0.8)
  when?: number;            // context time to start (default ctx.currentTime)
  samples?: SampleBank;
}

export interface LiveVoice {
  noteGain: any;
  /** Context time the voice started. */
  readonly startedAt: number;
  /** False once noteOff has been called. */
  readonly active: boolean;
  /**
   * Release the voice (gate off). Envelope releases run, sources stop after
   * the longest release, output disconnects after effect ring-out.
   * Returns the context time at which the voice is fully silent.
   */
  noteOff(when?: number): number;
}

/**
 * Start a voice with unknown duration — the live counterpart to
 * renderInstrumentVoice. Envelopes hold their sustain until noteOff().
 *
 * Note-off during the attack phase snaps ADSR envelopes to their sustain
 * level before releasing (a fast click-free fade, not a perfect
 * continuation) — acceptable for v1 live playing.
 */
export function startLiveVoice(inst: Instrument, opts: LiveVoiceOptions): LiveVoice {
  const ctx = opts.ctx;
  const startTime = opts.when ?? ctx.currentTime;
  const voice: VoiceContext = {
    ctx,
    startTime,
    endTime: startTime,      // unused in live paths
    freqHz: opts.freqHz,
    velocity: opts.velocity ?? 0.8,
    outputDest: opts.destination,
    samples: opts.samples,
    live: true,
  };
  voice.tailSec = releaseTailSec(inst);

  const built: Record<string, BuiltNode> = {};
  const order = topoSort(inst);
  for (const name of order) built[name] = instantiate(ctx, inst.audioNodes[name] as AudioNode, voice, built);
  for (const name of order) wireMods(ctx, inst.audioNodes[name] as AudioNode, built[name], voice, built);

  const outNode = built[inst.output];
  if (!outNode?.audioOut) {
    throw new Error(`Instrument ${inst.name}: output node "${inst.output}" has no audioOut`);
  }
  const noteGain = ctx.createGain();
  noteGain.gain.value = 1.0;
  outNode.audioOut.connect(noteGain);
  noteGain.connect(opts.destination);

  for (const name of order) scheduleNode(inst.audioNodes[name] as AudioNode, built[name], voice);

  // Collect everything that needs an explicit stop on release.
  const stoppables = new Set<any>();
  const liveEnvs: { node: import("../core/audio_types.ts").EnvGenNode; cs: any }[] = [];
  for (const b of Object.values(built)) {
    if (b.audioOut?.start) stoppables.add(b.audioOut);
    for (const s of b.sources ?? []) stoppables.add(s);
    if (b.liveEnv) liveEnvs.push(b.liveEnv);
  }
  const ringOut = instrumentTailSec(inst, 0.1, opts.samples);

  let active = true;
  return {
    noteGain,
    startedAt: startTime,
    get active() { return active; },
    noteOff(when?: number): number {
      if (!active) return startTime;
      active = false;
      const tOff = Math.max(when ?? ctx.currentTime, startTime);
      let maxRelease = 0.02;
      for (const { node, cs } of liveEnvs) {
        maxRelease = Math.max(maxRelease, applyLiveRelease(node, cs, tOff));
      }
      const tSourcesOff = tOff + maxRelease + 0.05;
      for (const src of stoppables) {
        try { src.stop(tSourcesOff); } catch { /* one-shots may have ended */ }
      }
      const tSilent = tSourcesOff + ringOut;
      // Real-time contexts advance with the wall clock; disconnect once the
      // ring-out is over so long sessions don't accumulate nodes. Offline
      // contexts finish rendering before the timer fires, so it's harmless.
      if (typeof setTimeout === "function") {
        const delayMs = Math.max(0, (tSilent - ctx.currentTime) * 1000) + 200;
        setTimeout(() => { try { noteGain.disconnect(); } catch { /* already gone */ } }, delayMs);
      }
      return tSilent;
    },
  };
}

/** Schedule an envelope's release phase at tOff; returns the release time. */
function applyLiveRelease(
  node: import("../core/audio_types.ts").EnvGenNode, cs: any, tOff: number,
): number {
  const exp = node.curve === "exp";
  const F = 0.001;
  const s = node.s ?? 0;
  const r = node.r ?? 0;
  if (node.envType === "ad") return 0;   // self-terminating
  const fromLevel = node.envType === "ar" ? 1 : Math.max(exp ? F : 0, s);
  cs.offset.cancelScheduledValues(tOff);
  cs.offset.setValueAtTime(Math.max(exp ? F : 0.0001, fromLevel), tOff);
  if (exp) {
    cs.offset.exponentialRampToValueAtTime(F, tOff + Math.max(0.005, r));
    cs.offset.setValueAtTime(0, tOff + Math.max(0.005, r));
  } else {
    cs.offset.linearRampToValueAtTime(0, tOff + Math.max(0.005, r));
  }
  return Math.max(0.005, r);
}

/**
 * Build a serial effect chain for a track bus (live use). Voice ports
 * ($vel/$freq) are meaningless on a shared bus and resolve to neutral
 * values. Returns {input, output} gains to splice into the bus.
 */
export function buildEffectBus(
  ctx: any,
  effects: import("../core/audio_types.ts").EffectNode[],
  when = 0,
): { input: any; output: any } {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dummyVoice: VoiceContext = {
    ctx, startTime: when, endTime: when, freqHz: 440, velocity: 1,
    outputDest: null, live: true,
  };
  let head: any = input;
  for (const fx of effects) {
    const b = instantiateEffect(ctx, fx, dummyVoice);
    head.connect(b.audioIn ?? b.audioOut);
    head = b.audioOut;
  }
  head.connect(output);
  return { input, output };
}

// ---- Topological sort ---------------------------------------------------

function topoSort(inst: Instrument): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const node = inst.audioNodes[name] as AudioNode;
    if (!node) return;
    for (const dep of nodeDeps(node)) {
      if (inst.audioNodes[dep]) visit(dep);
    }
    order.push(name);
  }
  for (const name of Object.keys(inst.audioNodes)) visit(name);
  return order;
}

function nodeDeps(node: AudioNode): string[] {
  const deps: string[] = [];
  const addParamDeps = (p: AudioParam | undefined) => {
    if (p === undefined) return;
    if (typeof p === "string" && !p.startsWith("$")) deps.push(p);
    if (typeof p === "object") {
      if (typeof p.base === "string" && !p.base.startsWith("$")) deps.push(p.base);
      if (p.mod) for (const m of p.mod) {
        if (!m.source.startsWith("$")) deps.push(m.source);
      }
    }
  };
  switch (node.type) {
    case "osc":
      addParamDeps(node.freq); addParamDeps(node.detune);
      break;
    case "filter":
      deps.push(node.input);
      addParamDeps(node.cutoff); addParamDeps(node.q);
      break;
    case "amp":
      deps.push(node.input);
      addParamDeps(node.gain);
      break;
    case "mixer":
      deps.push(...node.inputs);
      break;
    case "env_gen":
      // gate doesn't make a dep — it's a port
      break;
    case "lfo":
      addParamDeps(node.rate); addParamDeps(node.depth);
      break;
    case "math":
      addParamDeps(node.a); addParamDeps(node.b); addParamDeps(node.offset);
      break;
    case "effect":
      deps.push(node.input);
      if (node.params) for (const v of Object.values(node.params)) addParamDeps(v);
      break;
  }
  return deps;
}

// ---- Node instantiation ------------------------------------------------

function instantiate(ctx: OACType, node: AudioNode, voice: VoiceContext, built: Record<string, BuiltNode>): BuiltNode {
  switch (node.type) {
    case "osc": {
      const osc = ctx.createOscillator() as any;
      if (node.wave === "custom") {
        const harmonics = node.harmonics?.length ? node.harmonics : [1];
        const n = harmonics.length + 1;
        const real = new Float32Array(n);
        const imag = new Float32Array(n);
        for (let i = 0; i < harmonics.length; i++) imag[i + 1] = harmonics[i];
        osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
      } else {
        osc.type = node.wave === "saw" ? "sawtooth" : node.wave;
      }
      setParam(ctx, osc.frequency, node.freq, voice, built, /*default*/ 440);
      if (node.detune !== undefined) setParam(ctx, osc.detune, node.detune, voice, built, 0);
      return { audioOut: osc, params: { frequency: osc.frequency, detune: osc.detune } };
    }
    case "sampler": {
      const buf = voice.samples?.[node.sample];
      if (!buf) {
        throw new Error(
          `sample "${node.sample}" not found — pass a SampleBank containing it ` +
          `(browser: decode with your AudioContext; Node: loadSampleWav/loadSamplesFromDir from loophaus/node)`,
        );
      }
      const src = ctx.createBufferSource() as any;
      src.buffer = buf;
      if (node.pitched !== false) {
        const rootHz = 440 * Math.pow(2, ((node.rootMidi ?? 60) - 69) / 12);
        src.playbackRate.value = voice.freqHz / rootHz;
      }
      if (node.loop) {
        src.loop = true;
        if (node.loopStart !== undefined) src.loopStart = node.loopStart;
        if (node.loopEnd !== undefined) src.loopEnd = node.loopEnd;
      }
      // Scheduled here, not in scheduleNode: one-shots must play to the end
      // of the sample (crash, riser), so only looped samples get a stop.
      // Live voices stop looped samples in noteOff instead.
      src.start(voice.startTime);
      if (node.loop && !voice.live) src.stop(voice.endTime + (voice.tailSec ?? TAIL_SEC));
      const out: BuiltNode = { audioOut: src, params: { playbackRate: src.playbackRate } };
      if (node.loop) out.sources = [src];
      return out;
    }
    case "noise": {
      const sr = ctx.sampleRate;
      // Live: duration unknown — loop a 2s buffer instead of sizing to note.
      const lenSec = voice.live
        ? 2.0
        : (voice.endTime - voice.startTime) + (voice.tailSec ?? TAIL_SEC) + 0.05;
      const buf = ctx.createBuffer(1, Math.ceil(sr * Math.max(lenSec, 0.1)), sr);
      const data = buf.getChannelData(0);
      if (node.color === "pink") {
        // Paul Kellett's economy pink-noise filter (-3 dB/octave).
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + white * 0.0990460;
          b1 = 0.96300 * b1 + white * 0.2965164;
          b2 = 0.57000 * b2 + white * 1.0526913;
          data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.25;
        }
      } else {
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource() as any;
      src.buffer = buf;
      if (voice.live) src.loop = true;
      return { audioOut: src };
    }
    case "filter": {
      const f = ctx.createBiquadFilter() as any;
      f.type = node.filterType;
      setParam(ctx, f.frequency, node.cutoff, voice, built, 1000);
      if (node.q !== undefined) setParam(ctx, f.Q, node.q, voice, built, 1);
      return { audioOut: f, params: { frequency: f.frequency, Q: f.Q } };
    }
    case "amp": {
      const g = ctx.createGain() as any;
      setParam(ctx, g.gain, node.gain, voice, built, 1);
      return { audioOut: g, params: { gain: g.gain } };
    }
    case "mixer": {
      const g = ctx.createGain() as any;
      g.gain.value = 1;
      return { audioOut: g, params: { gain: g.gain } };
    }
    case "env_gen": {
      // Produce control signal via a ConstantSourceNode whose offset is automated.
      const cs = ctx.createConstantSource() as any;
      cs.offset.value = 0;
      const t0 = voice.startTime;
      const a = node.a, d = node.d ?? 0, s = node.s ?? 0;
      const exp = node.curve === "exp";
      if (voice.live) {
        // Live: schedule up to the sustain phase; release happens when
        // noteOff() arrives (see applyLiveRelease).
        const F = 0.001;
        cs.offset.setValueAtTime(exp ? F : 0, t0);
        cs.offset.linearRampToValueAtTime(1, t0 + a);
        if (node.envType === "adsr") {
          if (exp) cs.offset.exponentialRampToValueAtTime(Math.max(F, s), t0 + a + d);
          else     cs.offset.linearRampToValueAtTime(s, t0 + a + d);
        } else if (node.envType === "ad") {
          // Self-terminating — no gate needed
          if (exp) {
            cs.offset.exponentialRampToValueAtTime(F, t0 + a + d);
            cs.offset.setValueAtTime(0, t0 + a + d);
          } else {
            cs.offset.linearRampToValueAtTime(0, t0 + a + d);
          }
        }
        // "ar" holds at 1 until release
        return { audioOut: cs, controlOut: cs, liveEnv: { node, cs } };
      }
      const tGateOff = voice.endTime;
      const r = node.r ?? 0;
      // Exponential ramps can't reach 0 — decay toward a floor, then snap.
      const FLOOR = 0.001;
      const rampDown = (target: number, t: number) => {
        if (exp) {
          cs.offset.exponentialRampToValueAtTime(Math.max(FLOOR, target), t);
          if (target < FLOOR) cs.offset.setValueAtTime(0, t);
        } else {
          cs.offset.linearRampToValueAtTime(target, t);
        }
      };
      // Attack — always linear (exp can't start from zero)
      cs.offset.setValueAtTime(exp ? FLOOR : 0, t0);
      cs.offset.linearRampToValueAtTime(1, t0 + a);
      if (node.envType === "adsr") {
        rampDown(s, t0 + a + d);
        cs.offset.setValueAtTime(Math.max(exp ? FLOOR : 0, s), tGateOff);
        rampDown(0, tGateOff + r);
      } else if (node.envType === "ad") {
        rampDown(0, t0 + a + d);
      } else if (node.envType === "ar") {
        cs.offset.setValueAtTime(1, tGateOff);
        rampDown(0, tGateOff + r);
      }
      return { audioOut: cs, controlOut: cs };
    }
    case "lfo": {
      const osc = ctx.createOscillator() as any;
      osc.type = node.wave === "saw" ? "sawtooth" : node.wave;
      setParam(ctx, osc.frequency, node.rate, voice, built, 1);
      const g = ctx.createGain() as any;
      const depth = resolveStatic(node.depth, voice) ?? 1;
      g.gain.value = depth;
      osc.connect(g);
      return { audioOut: g, controlOut: g, params: { frequency: osc.frequency, gain: g.gain }, sources: [osc] };
    }
    case "math": {
      const a = resolveStatic(node.a, voice);
      const b = resolveStatic(node.b, voice);
      const aRef = typeof node.a === "string" && !node.a.startsWith("$") ? built[node.a] : undefined;
      const bRef = typeof node.b === "string" && !node.b.startsWith("$") ? built[node.b] : undefined;

      // Audio-rate path: add/sub/mul with at least one node-ref operand.
      // mul with two signals is ring modulation (signal on a gain param).
      if ((aRef || bRef) && (node.op === "add" || node.op === "sub" || node.op === "mul")) {
        const out = ctx.createGain() as any;
        if (node.op === "mul") {
          if (aRef && bRef) {
            out.gain.value = 0;
            aRef.audioOut.connect(out);
            bRef.audioOut.connect(out.gain);
          } else {
            // signal × constant
            out.gain.value = (aRef ? b : a) ?? 1;
            (aRef ?? bRef)!.audioOut.connect(out);
          }
        } else {
          out.gain.value = 1;
          const wireOperand = (ref: BuiltNode | undefined, val: number | undefined, negate: boolean) => {
            let src: any;
            if (ref) {
              src = ref.audioOut;
            } else {
              const cs = ctx.createConstantSource() as any;
              cs.offset.value = val ?? 0;
              cs.start(voice.startTime);
              src = cs;
            }
            if (negate) {
              const inv = ctx.createGain() as any;
              inv.gain.value = -1;
              src.connect(inv);
              inv.connect(out);
            } else {
              src.connect(out);
            }
          };
          wireOperand(aRef, a, false);
          wireOperand(bRef, b, node.op === "sub");
        }
        return { audioOut: out, controlOut: out };
      }

      // Static path: evaluate once per voice.
      const off = resolveStatic(node.offset, voice) ?? 0;
      let result: number;
      switch (node.op) {
        case "add": result = (a ?? 0) + (b ?? 0); break;
        case "sub": result = (a ?? 0) - (b ?? 0); break;
        case "mul": result = (a ?? 1) * (b ?? 1); break;
        case "div": result = (a ?? 1) / (b ?? 1); break;
        case "scale": result = (a ?? 0) * (b ?? 1) + off; break;
      }
      // Encode as constant via ConstantSourceNode so it can connect to params
      const cs = ctx.createConstantSource() as any;
      cs.offset.value = result;
      return { audioOut: cs, controlOut: cs };
    }
    case "effect":
      return instantiateEffect(ctx, node, voice);
  }
}

// ---- Effect instantiation -----------------------------------------------
//
// Compound effects share a shape:
//
//   audioIn ──┬── dryGain (1-mix) ──────────┬── audioOut
//             └── [processing] ── wet (mix) ┘
//
// Upstream connects to audioIn (see wireMods); downstream reads audioOut.

function instantiateEffect(ctx: OACType, node: import("../core/audio_types.ts").EffectNode, voice: VoiceContext): BuiltNode {
  const p = (name: string, dflt: number): number =>
    resolveStatic(node.params?.[name], voice) ?? dflt;

  switch (node.effectType) {
    case "distortion": {
      const amount = p("amount", 1.5);
      const mix = clamp01(p("mix", 1));
      const ws = ctx.createWaveShaper() as any;
      ws.curve = makeSoftClipCurve(amount);
      ws.oversample = "2x";
      if (mix >= 1) return { audioOut: ws };
      return wetDry(ctx, ws, ws, mix);
    }

    case "delay": {
      const time = Math.max(0.001, p("time", 0.25));
      const feedback = Math.min(0.95, Math.max(0, p("feedback", 0.35)));
      const mix = clamp01(p("mix", 0.35));
      const delay = ctx.createDelay(Math.max(1, time)) as any;
      delay.delayTime.value = time;
      const fb = ctx.createGain() as any;
      fb.gain.value = feedback;
      delay.connect(fb);
      fb.connect(delay);
      return wetDry(ctx, delay, delay, mix);
    }

    case "chorus": {
      const rate = Math.max(0.01, p("rate", 0.8));
      const depth = Math.max(0, p("depth", 0.004));
      const mix = clamp01(p("mix", 0.5));
      // Short modulated delay line. Base delay sits above max LFO swing so
      // delayTime never goes negative.
      const base = Math.max(0.012, depth * 1.5);
      const delay = ctx.createDelay(0.1) as any;
      delay.delayTime.value = base;
      const lfo = ctx.createOscillator() as any;
      lfo.type = "sine";
      lfo.frequency.value = rate;
      const lfoDepth = ctx.createGain() as any;
      lfoDepth.gain.value = depth;
      lfo.connect(lfoDepth);
      lfoDepth.connect(delay.delayTime);
      // Offline render: the context ends with the buffer, no stop() needed.
      lfo.start(voice.startTime);
      return wetDry(ctx, delay, delay, mix);
    }

    case "reverb": {
      const duration = Math.max(0.1, p("duration", 1.8));
      const decay = Math.max(0.05, p("decay", 0.4));
      const mix = clamp01(p("mix", 0.3));
      const conv = ctx.createConvolver() as any;
      conv.buffer = makeImpulse(ctx, duration, decay);
      return wetDry(ctx, conv, conv, mix);
    }

    case "compressor": {
      const comp = ctx.createDynamicsCompressor() as any;
      comp.threshold.value = p("threshold", -18);
      comp.ratio.value = p("ratio", 4);
      comp.attack.value = Math.max(0.001, p("attack", 0.01));
      comp.release.value = Math.max(0.01, p("release", 0.2));
      comp.knee.value = p("knee", 12);
      const makeup = ctx.createGain() as any;
      makeup.gain.value = p("makeup", 1);
      comp.connect(makeup);
      return { audioIn: comp, audioOut: makeup };
    }
  }
}

/**
 * Wrap a processor in parallel wet/dry routing. `wetIn` receives the input
 * signal; `wetOut` produces the processed signal.
 */
function wetDry(ctx: OACType, wetIn: any, wetOut: any, mix: number): BuiltNode {
  const input = ctx.createGain() as any;
  const output = ctx.createGain() as any;
  const dry = ctx.createGain() as any;
  dry.gain.value = 1 - mix;
  const wet = ctx.createGain() as any;
  wet.gain.value = mix;
  input.connect(dry);
  dry.connect(output);
  input.connect(wetIn);
  wetOut.connect(wet);
  wet.connect(output);
  return { audioIn: input, audioOut: output };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Exponentially decaying stereo noise impulse for convolution reverb. */
function makeImpulse(ctx: OACType, durSec: number, decayShape: number): any {
  const sr = ctx.sampleRate;
  const length = Math.ceil(sr * durSec);
  const buf = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / sr;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / (durSec * decayShape));
    }
  }
  return buf;
}

// ---- Resolve a Param to a static number when possible -------------------

function resolveStatic(p: AudioParam | undefined, voice: VoiceContext): number | undefined {
  if (p === undefined) return undefined;
  if (typeof p === "number") return p;
  if (typeof p === "string") {
    if (p === "$freq") return voice.freqHz;
    if (p === "$vel") return voice.velocity;
    if (p === "$gate") return 1;
    return undefined;  // node ref — not a static value
  }
  if (typeof p.base === "number") return p.base;
  if (typeof p.base === "string" && p.base.startsWith("$")) {
    if (p.base === "$freq") return voice.freqHz;
    if (p.base === "$vel") return voice.velocity;
  }
  return undefined;
}

// ---- Set an AudioParam from a Param spec --------------------------------

function setParam(
  ctx: OACType, target: any, p: AudioParam | undefined, voice: VoiceContext,
  built: Record<string, BuiltNode>, defaultValue: number,
) {
  if (p === undefined) { target.value = defaultValue; return; }
  if (typeof p === "number") { target.value = p; return; }
  if (typeof p === "string") {
    // Port reference
    if (p === "$freq") { target.value = voice.freqHz; return; }
    if (p === "$vel")  { target.value = voice.velocity; return; }
    // Else: audio-rate signal from another node — wired later in wireMods.
    target.value = defaultValue;
    return;
  }
  // Modulation matrix
  const baseVal = typeof p.base === "number" ? p.base :
                  (p.base === "$freq" ? voice.freqHz :
                   p.base === "$vel"  ? voice.velocity : defaultValue);
  target.value = baseVal;
  // Modulations are wired in wireMods()
}

// ---- Wire connections (audio inputs + modulation routing) ---------------

function wireMods(ctx: OACType, node: AudioNode, b: BuiltNode, voice: VoiceContext, built: Record<string, BuiltNode>) {
  // Audio inputs
  const connectAudio = (sourceName: string, target: any) => {
    const src = built[sourceName];
    if (src?.audioOut) src.audioOut.connect(target);
  };

  switch (node.type) {
    case "filter": connectAudio(node.input, b.audioOut); break;
    case "amp":    connectAudio(node.input, b.audioOut); break;
    case "mixer": {
      for (let i = 0; i < node.inputs.length; i++) {
        const inName = node.inputs[i];
        const src = built[inName];
        if (!src?.audioOut) continue;
        if (node.gains && node.gains[i] !== undefined && node.gains[i] !== 1) {
          // Apply per-input gain
          const g = ctx.createGain() as any;
          g.gain.value = node.gains[i];
          src.audioOut.connect(g);
          g.connect(b.audioOut);
        } else {
          src.audioOut.connect(b.audioOut);
        }
      }
      break;
    }
    case "effect": connectAudio(node.input, b.audioIn ?? b.audioOut); break;
  }

  // Modulation routing — wire any Param that's a node-ref or {base, mod[]} 
  const wireParamMods = (paramTarget: any, p: AudioParam | undefined) => {
    if (p === undefined || typeof p === "number" || !paramTarget) return;
    if (typeof p === "string") {
      // Port references already set as static values in setParam.
      // Audio-rate node refs: connect that node's output to this AudioParam.
      if (!p.startsWith("$")) {
        const src = built[p];
        if (src?.audioOut) src.audioOut.connect(paramTarget);
      }
      return;
    }
    // Modulation matrix: port sources apply statically; node sources
    // connect at audio rate through a gain (the amount).
    if (p.mod) {
      for (const m of p.mod) {
        if (m.source.startsWith("$")) {
          // Per-voice static contribution: velocity → brightness, freq →
          // keytracking. $gate contributes its on-value (1).
          const portVal =
            m.source === "$vel"  ? voice.velocity :
            m.source === "$freq" ? voice.freqHz :
            m.source === "$gate" ? 1 : 0;
          paramTarget.value = paramTarget.value + m.amount * portVal;
          continue;
        }
        const src = built[m.source];
        if (!src?.audioOut) continue;
        const g = ctx.createGain() as any;
        g.gain.value = m.amount;
        src.audioOut.connect(g);
        g.connect(paramTarget);
      }
    }
  };

  switch (node.type) {
    case "osc":
      wireParamMods(b.params?.frequency, node.freq);
      wireParamMods(b.params?.detune, node.detune);
      break;
    case "filter":
      wireParamMods(b.params?.frequency, node.cutoff);
      wireParamMods(b.params?.Q, node.q);
      break;
    case "amp":
      wireParamMods(b.params?.gain, node.gain);
      break;
    case "lfo":
      wireParamMods(b.params?.frequency, node.rate);
      break;
  }
}

// ---- Schedule starts/stops ----------------------------------------------

function scheduleNode(node: AudioNode, b: BuiltNode, voice: VoiceContext) {
  const startable = ["osc", "noise", "lfo", "env_gen", "math"];
  if (!startable.includes(node.type)) return;
  const stopAt = voice.endTime + (voice.tailSec ?? TAIL_SEC);
  for (const src of [b.audioOut, ...(b.sources ?? [])]) {
    if (!src?.start) continue;
    try {
      src.start(voice.startTime);
      // Live voices don't know their end yet — stops happen in noteOff().
      if (!voice.live) src.stop(stopAt);
    } catch (_e) {
      // already started
    }
  }
}

// ---- Helpers ------------------------------------------------------------

function makeSoftClipCurve(amount: number): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}
