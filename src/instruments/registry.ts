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
  defineEchoPluck,
  defineShimmerPad,
  definePressedBass,
  defineFmEpiano,
  defineFmBell,
  defineDrawbarOrgan,
  defineStringMachine,
  defineAcidBass,
  defineHooverLead,
  defineSoftBrass,
  defineGlassKeys,
} from "../instruments/library.ts";

export type InstrumentName =
  | "wobble_bass"
  | "supersaw_lead"
  | "warm_pad"
  | "felt_synth"
  | "broken_signal_lead"
  | "clavinet_stab"
  | "echo_pluck"
  | "shimmer_pad"
  | "pressed_bass"
  | "fm_epiano"
  | "fm_bell"
  | "drawbar_organ"
  | "string_machine"
  | "acid_bass"
  | "hoover_lead"
  | "soft_brass"
  | "glass_keys";

type InstrumentBuilder = (b: GraphBuilder) => Id;

export const instrumentNames: InstrumentName[] = [
  "wobble_bass",
  "supersaw_lead",
  "warm_pad",
  "felt_synth",
  "broken_signal_lead",
  "clavinet_stab",
  "echo_pluck",
  "shimmer_pad",
  "pressed_bass",
  "fm_epiano",
  "fm_bell",
  "drawbar_organ",
  "string_machine",
  "acid_bass",
  "hoover_lead",
  "soft_brass",
  "glass_keys",
];

const BUILDERS: Record<InstrumentName, InstrumentBuilder> = {
  wobble_bass: defineWobbleBass,
  supersaw_lead: defineSupersawLead,
  warm_pad: defineWarmPad,
  felt_synth: defineFeltSynth,
  broken_signal_lead: defineBrokenSignalLead,
  clavinet_stab: defineClavinetStab,
  echo_pluck: defineEchoPluck,
  shimmer_pad: defineShimmerPad,
  pressed_bass: definePressedBass,
  fm_epiano: defineFmEpiano,
  fm_bell: defineFmBell,
  drawbar_organ: defineDrawbarOrgan,
  string_machine: defineStringMachine,
  acid_bass: defineAcidBass,
  hoover_lead: defineHooverLead,
  soft_brass: defineSoftBrass,
  glass_keys: defineGlassKeys,
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
  const b = new GraphBuilder();
  const id = defineInstrumentIn(b, name);
  const node = b.graph.nodes.get(id) as InstrumentNode;
  return { graph: b.graph, id, instrument: asInstrument(node) };
}

/**
 * Register a library instrument inside an existing builder, so the
 * instrument node lives in the same graph as the tracks that reference it.
 */
export function defineInstrumentIn(b: GraphBuilder, name: InstrumentName): Id {
  const builder = BUILDERS[name];
  if (!builder) throw new Error(`Unknown instrument: ${name}`);
  const id = builder(b);
  const node = b.graph.nodes.get(id);
  if (!node || node.kind !== "instrument") {
    throw new Error(`Instrument builder did not register an instrument node: ${name}`);
  }
  return id;
}

export function findInstrument(g: Graph, id: Id): Instrument | null {
  const node = g.nodes.get(id);
  if (!node || node.kind !== "instrument") return null;
  return asInstrument(node);
}
