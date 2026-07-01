import { describe, expect, it } from "vitest";
import { buildModulationDemo } from "../../src/examples/modulation_demo.ts";
import { solve } from "../../src/core/solver.ts";
import { harmonicSpansInRange, keysInGraph } from "../helpers/summarize.ts";
import { pcFromName } from "../../src/core/theory.ts";

describe("key modulation", () => {
  it("modulation_demo declares C minor → G minor at bar 5", () => {
    const { graph } = buildModulationDemo();
    const r = solve(graph);

    expect(r.modulations).toHaveLength(1);
    expect(r.modulations[0].from).toBe("C natural minor");
    expect(r.modulations[0].to).toBe("G natural minor");
    expect(r.modulations[0].method).toBe("dominant");
    expect(r.modulations[0].atBeats).toBe(20);
  });

  it("modulation_demo uses two distinct tonics", () => {
    const { graph } = buildModulationDemo();
    const keys = keysInGraph(graph);
    const tonics = keys.map((k) => k.tonic).sort((a, b) => a - b);
    expect(tonics).toEqual([pcFromName("C"), pcFromName("G")]);
  });

  it("harmonic roots reflect both key centers", () => {
    const { graph } = buildModulationDemo();
    const r = solve(graph);

    const early = harmonicSpansInRange(graph, 0, 16);
    const late = harmonicSpansInRange(graph, 20, 36);

    expect(early[0]?.derived?.rootPc).toBe(pcFromName("C"));
    expect(late[0]?.derived?.rootPc).toBe(pcFromName("G"));
    expect(r.events.length).toBeGreaterThan(50);
  });
});
