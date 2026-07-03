import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { compileLoop } from "../../src/dloop/compile.ts";
import { parseLoop } from "../../src/dloop/parse.ts";
import { buildBridgeDemo } from "../../src/examples/bridge_demo.ts";
import { buildElectronicLoop } from "../../src/examples/electronic_loop.ts";
import { buildHalflight } from "../../src/examples/halflight.ts";
import { buildMinorVamp } from "../../src/examples/minor_vamp.ts";
import { buildModulationDemo } from "../../src/examples/modulation_demo.ts";
import { buildChromaticModulationDemo } from "../../src/examples/chromatic_modulation_demo.ts";
import { buildPolymorph } from "../../src/examples/polymorph.ts";
import { solve } from "../../src/core/solver.ts";
import { summarizeSolve } from "../helpers/summarize.ts";

const loopDir = path.join(process.cwd(), "examples/loop");

function goldenMatch(loopFile: string, builder: () => { graph: import("../../src/core/types.ts").Graph }) {
  const src = fs.readFileSync(path.join(loopDir, loopFile), "utf8");
  const gLoop = compileLoop(src);
  const fromLoop = summarizeSolve(gLoop, solve(gLoop));
  const gTs = builder().graph;
  const expected = summarizeSolve(gTs, solve(gTs));
  expect(fromLoop).toEqual(expected);
}

describe(".loop DSL", () => {
  it("parses electronic_loop.loop", () => {
    const src = fs.readFileSync(path.join(loopDir, "electronic_loop.loop"), "utf8");
    const ast = parseLoop(src);
    expect(ast.tracks).toHaveLength(3);
    expect(ast.progressions[0].degrees).toEqual(["vi", "IV", "I", "V"]);
  });

  it("parses multi-key bridge_demo.loop", () => {
    const src = fs.readFileSync(path.join(loopDir, "bridge_demo.loop"), "utf8");
    const ast = parseLoop(src);
    expect(ast.keys).toHaveLength(2);
    expect(ast.sidechains).toHaveLength(1);
    expect(ast.placeRanges.length).toBeGreaterThan(0);
  });

  it("electronic_loop.loop matches TS builder golden", () => {
    goldenMatch("electronic_loop.loop", buildElectronicLoop);
  });

  it("minor_vamp.loop matches TS builder golden", () => {
    const src = fs.readFileSync(path.join(loopDir, "minor_vamp.loop"), "utf8");
    const gLoop = compileLoop(src);
    const fromLoop = summarizeSolve(gLoop, solve(gLoop));
    const gTs = buildMinorVamp().graph;
    const expected = summarizeSolve(gTs, solve(gTs));
    expect(fromLoop.eventCount).toBe(expected.eventCount);
    expect(fromLoop.voiceLeadingMotion).toBe(expected.voiceLeadingMotion);
    expect(fromLoop.degrees).toEqual(expected.degrees);
    expect(fromLoop.eventsByTrackName).toEqual(expected.eventsByTrackName);
  });

  it("bridge_demo.loop matches TS builder golden", () => {
    goldenMatch("bridge_demo.loop", buildBridgeDemo);
  });

  it("halflight.loop matches TS builder golden", () => {
    goldenMatch("halflight.loop", buildHalflight);
  });

  it("modulation_demo.loop matches TS builder golden", () => {
    goldenMatch("modulation_demo.loop", buildModulationDemo);
  });

  it("chromatic_modulation_demo.loop matches TS builder golden", () => {
    goldenMatch("chromatic_modulation_demo.loop", buildChromaticModulationDemo);
  });

  it("effects_demo.loop compiles with effect-chain instruments in the same graph", () => {
    const src = fs.readFileSync(path.join(loopDir, "effects_demo.loop"), "utf8");
    const g = compileLoop(src);
    const result = solve(g);
    expect(result.events.length).toBeGreaterThan(50);
    // The instrument nodes must live in the compiled graph itself, so the
    // renderer can look them up from track references.
    const instruments = [...g.nodes.values()].filter(n => n.kind === "instrument");
    expect(instruments.map(i => (i as { name: string }).name).sort()).toEqual(
      ["echo_pluck", "pressed_bass", "shimmer_pad"],
    );
  });

  it("polymorph.loop matches core event structure of TS builder", () => {
    const src = fs.readFileSync(path.join(loopDir, "polymorph.loop"), "utf8");
    const gLoop = compileLoop(src);
    const fromLoop = summarizeSolve(gLoop, solve(gLoop));
    const gTs = buildPolymorph().graph;
    const expected = summarizeSolve(gTs, solve(gTs));
    expect(fromLoop.degrees).toEqual(expected.degrees);
    expect(fromLoop.eventCount).toBeGreaterThan(expected.eventCount * 0.45);
    expect(fromLoop.eventCount).toBeLessThan(expected.eventCount * 1.1);
  });
});
