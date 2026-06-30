/**
 * Standard French-house instrument stack used across several examples.
 */
import type { GraphBuilder } from "../core/graph.ts";
import type { Id } from "../core/types.ts";
import {
  defineWobbleBass,
  defineSupersawLead,
  defineWarmPad,
  defineClavinetStab,
} from "./library.ts";

export interface HouseInstrumentIds {
  bass: Id;
  stab: Id;
  pad: Id;
  lead: Id;
}

/** Register the default bass / stab / pad / lead instrument graphs. */
export function defineHouseInstruments(b: GraphBuilder): HouseInstrumentIds {
  return {
    bass: defineWobbleBass(b),
    stab: defineClavinetStab(b),
    pad: defineWarmPad(b),
    lead: defineSupersawLead(b),
  };
}
