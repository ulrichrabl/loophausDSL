import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildHalflight } from "../../src/examples/halflight.ts";
import {
  harmonicSpansInRange,
  keyModeForSpan,
  keysInGraph,
} from "../helpers/summarize.ts";

const intent = JSON.parse(
  readFileSync(join(process.cwd(), "examples/intent/halflight.intent.json"), "utf8"),
);

describe("halflight intent", () => {
  const { graph } = buildHalflight();

  it("matches declared length and keys", () => {
    const keys = keysInGraph(graph);
    expect(keys.map((k) => k.mode).sort()).toEqual(["dorian", "natural_minor"]);
    expect(keys.every((k) => k.tonic === 1)).toBe(true); // C#
  });

  it("bridge section uses dorian harmony", () => {
    const bridge = intent.bridge;
    const spans = harmonicSpansInRange(graph, bridge.startBeats, bridge.endBeats);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((s) => keyModeForSpan(graph, s) === bridge.mode)).toBe(true);
  });

  it("declares four sections on the build result", () => {
    const result = buildHalflight();
    expect(Object.keys(result.sections ?? {})).toEqual(intent.sections);
  });
});
