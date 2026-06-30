/**
 * Build and resolve instrument graphs without a full score piece.
 */
import { GraphBuilder } from "../core/graph.ts";
import type { Graph, Id, InstrumentNode } from "../core/types.ts";
import type { Instrument } from "../core/audio_types.ts";
import {
  defineWobbleBass,
  defineSupersawLead,
  defineWarmPad,
  defineFeltSynth,
  defineBrokenSignalLead,
  defineClavinetStab,
} from "../instruments/library.ts";

export type InstrumentName =
  | "wobble_bass"
  | "supersaw_lead"
  | "warm_pad"
  | "felt_synth"
  | "broken_signal_lead"
  | "clavinet_stab";

type InstrumentBuilder = (b: GraphBuilder) => Id;

export const instrumentNames: InstrumentName[] = [
  "wobble_bass",
  "supersaw_lead",
  "warm_pad",
  "felt_synth",
  "broken_signal_lead",
  "clavinet_stab",
];

const BUILDERS: Record<InstrumentName, InstrumentBuilder> = {
  wobble_bass: defineWobbleBass,
  supersaw_lead: defineSupersawLead,
  warm_pad: defineWarmPad,
  felt_synth: defineFeltSynth,
  broken_signal_lead: defineBrokenSignalLead,
  clavinet_stab: defineClavinetStab,
};

export interface BuiltInstrument {
  graph: Graph;
  id: Id;
  instrument: Instrument;
}

export function asInstrument(node: InstrumentNode): Instrument {
  return {
    kind: "instrument",
    id: node.id,
    name: node.name,
    polyphony: node.polyphony,
    audioNodes: node.audioNodes,
    output: node.output,
    gateSource: node.gateSource,
  };
}

export function buildInstrument(name: InstrumentName): BuiltInstrument {
  const builder = BUILDERS[name];
  if (!builder) throw new Error(`Unknown instrument: ${name}`);
  const b = new GraphBuilder();
  const id = builder(b);
  const node = b.graph.nodes.get(id);
  if (!node || node.kind !== "instrument") {
    throw new Error(`Instrument builder did not register an instrument node: ${name}`);
  }
  return { graph: b.graph, id, instrument: asInstrument(node) };
}

export function findInstrument(g: Graph, id: Id): Instrument | null {
  const node = g.nodes.get(id);
  if (!node || node.kind !== "instrument") return null;
  return asInstrument(node);
}
