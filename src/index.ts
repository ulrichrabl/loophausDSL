/**
 * Loophaus public API — browser-safe.
 *
 * Everything exported here is pure TypeScript with no Node.js dependencies:
 * safe to bundle into web apps (DAWs, editors). The typical flow:
 *
 *   import { compileLoop, solve, explain } from "loophaus";
 *
 *   const graph = compileLoop(loopSource);   // .loop text -> graph
 *   const result = solve(graph);             // graph -> concrete events
 *   const commentary = explain(graph, result);
 *
 * `result.events` carry positionBeats / durationBeats / pitch / velocity /
 * track — feed them to your own playback engine or scheduler.
 *
 * Node-only WAV/MIDI rendering lives in the "loophaus/node" subpath.
 */

// Core kernel — six primitives, builder, solver, commentary
export * from "./core/types.ts";
export { GraphBuilder, lookup, allOf, type Section } from "./core/graph.ts";
export { solve, type SolveResult } from "./core/solver.ts";
export { explain } from "./core/explain.ts";
export * from "./core/theory.ts";

// Instrument (audio) graphs
export type {
  AudioParam,
  AudioNode,
  OscillatorNode,
  NoiseNode,
  FilterNode,
  AmpNode,
  MixerNode,
  EnvGenNode,
  LFONode,
  MathNode,
  EffectNode,
  Instrument,
} from "./core/audio_types.ts";
export { explainInstrument } from "./core/explain_instrument.ts";
export {
  buildInstrument,
  defineInstrumentIn,
  findInstrument,
  asInstrument,
  instrumentNames,
  type InstrumentName,
  type BuiltInstrument,
} from "./instruments/registry.ts";

// Per-voice synthesis. Context-agnostic: pass any (Offline)AudioContext,
// browser or Node — only type imports touch node-web-audio-api.
export { renderInstrumentVoice, instrumentTailSec } from "./midi/audio_renderer.ts";

// .loop DSL
export { parseLoop, ParseError } from "./dloop/parse.ts";
export { compileLoop, compileLoopFile } from "./dloop/compile.ts";
export type { LoopFile } from "./dloop/types.ts";

// Example pieces (pure graph builders)
export { examples, coreExamples, type ExampleBuilder } from "./examples/registry.ts";
