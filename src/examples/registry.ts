import type { Graph } from "../core/types.ts";
import { unwrapGraph, type BuildResult } from "../lib/build_result.ts";
import { buildMinorVamp } from "./minor_vamp.ts";
import { buildElectronicLoop } from "./electronic_loop.ts";
import { buildDaftPunkV2 } from "./daft_punk_v2.ts";
import { buildFreygishNights } from "./freygish_nights.ts";
import { buildPolymorph } from "./polymorph.ts";
import { buildHalflight } from "./halflight.ts";
import { buildStrata } from "./strata.ts";
import { buildCosmonaut } from "./cosmonaut.ts";
import { buildApsis } from "./apsis.ts";
import { buildBlackStone } from "./black_stone.ts";
import { buildSwellTest } from "./swell_test.ts";
import { buildThreshold } from "./threshold.ts";
import { buildHelios } from "./helios.ts";
import { buildBridgeDemo } from "./bridge_demo.ts";
import { buildModulationDemo } from "./modulation_demo.ts";
import { buildChromaticModulationDemo } from "./chromatic_modulation_demo.ts";

export type ExampleBuilder = () => Graph;

function graphExample(fn: () => Graph | BuildResult): ExampleBuilder {
  return () => unwrapGraph(fn());
}

/** All runnable examples — values are always resolved Graph instances. */
export const examples: Record<string, ExampleBuilder> = {
  minor_vamp: graphExample(buildMinorVamp),
  electronic_loop: graphExample(buildElectronicLoop),
  daft_punk: graphExample(buildDaftPunkV2),
  freygish_nights: graphExample(buildFreygishNights),
  polymorph: graphExample(buildPolymorph),
  halflight: graphExample(buildHalflight),
  strata: graphExample(buildStrata),
  cosmonaut: graphExample(buildCosmonaut),
  apsis: graphExample(buildApsis),
  black_stone: graphExample(buildBlackStone),
  swell_test: graphExample(buildSwellTest),
  threshold: graphExample(buildThreshold),
  helios: graphExample(buildHelios),
  bridge_demo: graphExample(buildBridgeDemo),
  modulation_demo: graphExample(buildModulationDemo),
  chromatic_modulation_demo: graphExample(buildChromaticModulationDemo),
};

/** Subset used for solver goldens and explain snapshots in CI. */
export const coreExamples = ["minor_vamp", "electronic_loop", "halflight"] as const;

export type CoreExampleName = (typeof coreExamples)[number];

export function buildExample(name: string): Graph {
  const builder = examples[name];
  if (!builder) throw new Error(`Unknown example: ${name}`);
  return builder();
}
