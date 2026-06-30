import { describe, expect, it } from "vitest";
import { buildExample } from "../../src/examples/registry.ts";
import { solve } from "../../src/core/solver.ts";
import { summarizeSolve } from "../helpers/summarize.ts";

describe("solver golden snapshots", () => {
  it("minor_vamp", () => {
    const g = buildExample("minor_vamp");
    const summary = summarizeSolve(g, solve(g));
    expect(summary).toEqual({
      eventCount: 76,
      voiceLeadingMotion: 23,
      degrees: ["i", "VI", "III", "VII"],
      eventsByTrackName: { keys: 12, bass: 32, lead: 32 },
    });
  });

  it("electronic_loop", () => {
    const g = buildExample("electronic_loop");
    const summary = summarizeSolve(g, solve(g));
    expect(summary).toEqual({
      eventCount: 60,
      voiceLeadingMotion: 37,
      degrees: ["vi", "IV", "I", "V"],
      eventsByTrackName: { drums: 16, bass: 32, pad: 12 },
    });
  });

  it("halflight", () => {
    const g = buildExample("halflight");
    const summary = summarizeSolve(g, solve(g));
    expect(summary.eventCount).toBe(542);
    expect(summary.voiceLeadingMotion).toBe(284);
    expect(summary.degrees).toHaveLength(32);
    expect(summary.eventsByTrackName).toEqual({
      pad: 96,
      drums: 280,
      bass: 80,
      stab: 48,
      lead: 38,
    });
    expect(summary.degrees.slice(16, 24)).toEqual([
      "i", "IV", "VII", "i", "i", "IV", "VII", "i",
    ]);
  });
});
