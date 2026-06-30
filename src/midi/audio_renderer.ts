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
import type { Instrument, AudioNode, AudioParam, Modulation } from "../core/audio_types.ts";

interface VoiceContext {
  ctx: OACType;
  startTime: number;
  endTime: number;          // gate-off time (note duration)
  freqHz: number;
  velocity: number;         // 0..1
  outputDest: any;          // AudioNode to connect the voice's output to (track bus)
}

interface BuiltNode {
  /** The Web Audio node producing audio output (if any). */
  audioOut?: any;
  /** Some nodes produce control-rate signals; same property holds it. */
  controlOut?: any;
  /** Filter/amp nodes have AudioParams (cutoff, gain) that modulation targets. */
  params?: Record<string, any>;
}

interface VoiceHandle {
  noteGain: any;   // The music-graph-controllable gain at the voice's output
}

const TAIL_SEC = 0.5;  // padding after note-off for release decay

export function renderInstrumentVoice(inst: Instrument, voice: VoiceContext): VoiceHandle {
  const { ctx } = voice;
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
      osc.type = node.wave === "saw" ? "sawtooth" : node.wave;
      setParam(ctx, osc.frequency, node.freq, voice, built, /*default*/ 440);
      if (node.detune !== undefined) setParam(ctx, osc.detune, node.detune, voice, built, 0);
      return { audioOut: osc, params: { frequency: osc.frequency, detune: osc.detune } };
    }
    case "noise": {
      const sr = ctx.sampleRate;
      const lenSec = (voice.endTime - voice.startTime) + TAIL_SEC + 0.05;
      const buf = ctx.createBuffer(1, Math.ceil(sr * Math.max(lenSec, 0.1)), sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource() as any;
      src.buffer = buf;
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
      const tGateOff = voice.endTime;
      const a = node.a, d = node.d ?? 0, s = node.s ?? 0, r = node.r ?? 0;
      // Attack
      cs.offset.setValueAtTime(0, t0);
      cs.offset.linearRampToValueAtTime(1, t0 + a);
      if (node.envType === "adsr") {
        // Decay to sustain
        cs.offset.linearRampToValueAtTime(s, t0 + a + d);
        cs.offset.setValueAtTime(s, tGateOff);
        // Release
        cs.offset.linearRampToValueAtTime(0, tGateOff + r);
      } else if (node.envType === "ad") {
        // Attack-decay (no sustain phase, decays to 0)
        cs.offset.linearRampToValueAtTime(0, t0 + a + d);
      } else if (node.envType === "ar") {
        cs.offset.setValueAtTime(1, tGateOff);
        cs.offset.linearRampToValueAtTime(0, tGateOff + r);
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
      return { audioOut: g, controlOut: g, params: { frequency: osc.frequency, gain: g.gain } };
    }
    case "math": {
      // For simple compile-time math (e.g. freq / 2), evaluate statically.
      // Audio-rate math is not handled here — would need ScriptProcessor or WaveShaper.
      const a = resolveStatic(node.a, voice);
      const b = resolveStatic(node.b, voice);
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
    case "effect": {
      // Minimal: only "distortion" implemented for now via WaveShaper
      if (node.effectType === "distortion") {
        const ws = ctx.createWaveShaper() as any;
        const amount = resolveStatic(node.params?.amount, voice) ?? 1.5;
        ws.curve = makeSoftClipCurve(amount);
        ws.oversample = "2x";
        return { audioOut: ws };
      }
      // Pass-through fallback
      const g = ctx.createGain() as any;
      return { audioOut: g };
    }
  }
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
    case "effect": connectAudio(node.input, b.audioOut); break;
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
    // Modulation matrix: connect each source through a gain node
    if (p.mod) {
      for (const m of p.mod) {
        if (m.source.startsWith("$")) continue;  // port mods not yet implemented as audio-rate
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
  if (!b.audioOut?.start) return;
  try {
    b.audioOut.start(voice.startTime);
    b.audioOut.stop(voice.endTime + TAIL_SEC);
  } catch (_e) {
    // already started
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
