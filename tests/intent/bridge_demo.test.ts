import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBridgeDemo } from "../../src/examples/bridge_demo.ts";
import {
  harmonicSpansInRange,
  keyModeForSpan,
} from "../helpers/summarize.ts";
import { assertAllPitchedTracksHaveInstrument } from "../helpers/instruments.ts";

const intent = JSON.parse(
  readFileSync(join(process.cwd(), "examples/intent/bridge_demo.intent.json"), "utf8"),
);

describe("bridge_demo intent", () => {
  const { graph, sections } = buildBridgeDemo();

  it("matches declared sections", () => {
    expect(Object.keys(sections ?? {})).toEqual(intent.sections);
  });

  it("bridge uses dorian harmony", () => {
    const bridge = intent.bridge;
    const spans = harmonicSpansInRange(graph, bridge.startBeats, bridge.endBeats);
    expect(spans.length).toBe(4);
    expect(spans.every((s) => keyModeForSpan(graph, s) === bridge.mode)).toBe(true);
  });

  it("all pitched tracks use instrument graphs", () => {
    assertAllPitchedTracksHaveInstrument(graph);
  });
});
