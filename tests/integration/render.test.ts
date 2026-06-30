import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildExample } from "../../src/examples/registry.ts";
import { solve } from "../../src/core/solver.ts";
import { renderWebAudio } from "../../src/midi/web_audio.ts";
import { outputPath } from "../../src/lib/paths.ts";

describe("A+B render integration", () => {
  it("bridge_demo renders a non-trivial WAV via instrument graphs", async () => {
    const g = buildExample("bridge_demo");
    const r = solve(g);
    const out = outputPath("bridge_demo_integration_test.wav");
    await renderWebAudio(g, r, out);
    const size = fs.statSync(out).size;
    expect(size).toBeGreaterThan(50_000);
  }, 60_000);

  it("minor_vamp still renders pitched content after instrument migration", async () => {
    const g = buildExample("minor_vamp");
    const r = solve(g);
    const out = outputPath("minor_vamp_integration_test.wav");
    await renderWebAudio(g, r, out);
    expect(fs.statSync(out).size).toBeGreaterThan(50_000);
  }, 60_000);
});
