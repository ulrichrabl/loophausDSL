import { describe, expect, it } from "vitest";
import { buildExample, coreExamples } from "../../src/examples/registry.ts";
import { solve } from "../../src/core/solver.ts";
import { assertEventInvariants } from "../helpers/summarize.ts";

describe("solve invariants", () => {
  it.each(coreExamples)("%s produces valid events", (name) => {
    const g = buildExample(name);
    const r = solve(g);
    expect(r.events.length).toBeGreaterThan(0);
    assertEventInvariants(g, r);
  });

  it("voice-leading motion is non-negative", () => {
    for (const name of coreExamples) {
      const r = solve(buildExample(name));
      expect(r.totalVoiceLeadingMotion).toBeGreaterThanOrEqual(0);
    }
  });
});
