import { describe, expect, it } from "vitest";
import { buildExample } from "../../src/examples/registry.ts";
import { solve } from "../../src/core/solver.ts";
import { summarizeSolve } from "../helpers/summarize.ts";
import { assertAllPitchedTracksHaveInstrument } from "../helpers/instruments.ts";

describe("bridge_demo A+B integration", () => {
  it("uses instrument graphs on all pitched tracks", () => {
    const g = buildExample("bridge_demo");
    assertAllPitchedTracksHaveInstrument(g);
  });

  it("solver golden summary", () => {
    const g = buildExample("bridge_demo");
    const summary = summarizeSolve(g, solve(g));
    expect(summary).toEqual({
      eventCount: 210,
      voiceLeadingMotion: 112,
      degrees: ["i", "VI", "VII", "i", "i", "IV", "VII", "i"],
      eventsByTrackName: {
        pad: 24,
        drums: 112,
        bass: 32,
        lead: 18,
        stab: 24,
      },
    });
    expect(summary.degrees.slice(4, 8)).toEqual(["i", "IV", "VII", "i"]);
  });
});
