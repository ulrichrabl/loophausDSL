/**
 * Loophaus audio-graph primitives.
 *
 * Synths are graph compositions, not hardcoded functions. An Instrument
 * is a named sub-graph of audio nodes (oscillators, filters, envelopes,
 * etc.) with three implicit ports — $freq, $vel, $gate — set per-voice
 * by the music graph.
 *
 * Every modulatable parameter accepts:
 *   - a number (constant)
 *   - a "$port" string (per-voice value: $freq, $vel, $gate)
 *   - a node-name string (audio-rate signal from another node)
 *   - { base, mod: [{ source, amount }] } (modulation matrix)
 *
 * The kernel philosophy applies: any source can modulate any parameter,
 * including parameters inside an Instrument from envelopes in the music
 * graph. One primitive shape, applied at every layer.
 */

import type { Id } from "./types.ts";

/** Parameter value for audio nodes. */
export type AudioParam =
  | number                                          // constant
  | string                                          // "$freq", "$vel", "$gate" (port) or "node_name" (audio ref)
  | { base: number | string; mod?: Modulation[] }   // modulated parameter

export interface Modulation {
  source: string;       // ref to another node or "$port"
  amount: number;       // depth, in the target parameter's units
}

/** All audio node kinds. Discriminated by `type`. */
export type AudioNode =
  | OscillatorNode
  | NoiseNode
  | FilterNode
  | AmpNode
  | MixerNode
  | EnvGenNode
  | LFONode
  | MathNode
  | EffectNode;

export interface OscillatorNode {
  kind: "audio_node";
  type: "osc";
  wave: "sine" | "saw" | "square" | "triangle";
  freq: AudioParam;
  detune?: AudioParam;       // cents
}

export interface NoiseNode {
  kind: "audio_node";
  type: "noise";
  color?: "white" | "pink";
}

export interface FilterNode {
  kind: "audio_node";
  type: "filter";
  filterType: "lowpass" | "highpass" | "bandpass" | "notch";
  input: string;             // audio input — node name
  cutoff: AudioParam;
  q?: AudioParam;
}

export interface AmpNode {
  kind: "audio_node";
  type: "amp";
  input: string;
  gain: AudioParam;
}

export interface MixerNode {
  kind: "audio_node";
  type: "mixer";
  inputs: string[];
  gains?: number[];          // per-input gain (defaults to 1)
}

export interface EnvGenNode {
  kind: "audio_node";
  type: "env_gen";
  envType: "adsr" | "ad" | "ar";
  a: number;                 // attack (seconds)
  d?: number;                // decay
  s?: number;                // sustain (0..1)
  r?: number;                // release
  gate?: string;             // gate signal — usually "$gate"
}

export interface LFONode {
  kind: "audio_node";
  type: "lfo";
  wave: "sine" | "saw" | "square" | "triangle";
  rate: AudioParam;          // Hz
  depth?: AudioParam;        // output scale (default 1)
}

export interface MathNode {
  kind: "audio_node";
  type: "math";
  op: "add" | "sub" | "mul" | "div" | "scale";  // scale: linear remap
  a: AudioParam;
  b: AudioParam;
  // For "scale": output = a * b + offset
  offset?: AudioParam;
}

export interface EffectNode {
  kind: "audio_node";
  type: "effect";
  effectType: "distortion" | "delay" | "chorus" | "compressor";
  input: string;
  params?: Record<string, AudioParam>;
}

/** A named, encapsulated instrument — a sub-graph the music layer can bind to a track. */
export interface Instrument {
  kind: "instrument";
  id: Id;
  name: string;
  polyphony: number;
  nodes: Record<string, AudioNode>;
  output: string;            // name of the node producing the final audio output
  /**
   * Per-voice triggers: which gate signal causes voice allocation. Usually
   * just "$gate" — voices spawn on note-on, release on note-off.
   */
  gateSource?: string;
}
