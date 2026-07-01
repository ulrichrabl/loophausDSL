import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { compileLoop } from "../../src/dloop/compile.ts";
import { parseLoop } from "../../src/dloop/parse.ts";
import { buildElectronicLoop } from "../../src/examples/electronic_loop.ts";
import { buildMinorVamp } from "../../src/examples/minor_vamp.ts";
import { solve } from "../../src/core/solver.ts";
import { summarizeSolve } from "../helpers/summarize.ts";

const loopDir = path.join(process.cwd(), "examples/loop");

describe(".loop DSL", () => {
  it("parses electronic_loop.loop", () => {
    const src = fs.readFileSync(path.join(loopDir, "electronic_loop.loop"), "utf8");
    const ast = parseLoop(src);
    expect(ast.tracks).toHaveLength(3);
    expect(ast.progressions[0].degrees).toEqual(["vi", "IV", "I", "V"]);
  });

  it("electronic_loop.loop matches TS builder golden", () => {
    const src = fs.readFileSync(path.join(loopDir, "electronic_loop.loop"), "utf8");
    const gLoop = compileLoop(src);
    const fromLoop = summarizeSolve(gLoop, solve(gLoop));
    const gTs = buildElectronicLoop().graph;
    const expected = summarizeSolve(gTs, solve(gTs));
    expect(fromLoop).toEqual(expected);
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
});
