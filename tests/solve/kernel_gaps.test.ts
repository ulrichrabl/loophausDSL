import { describe, expect, it } from "vitest";
import { GraphBuilder } from "../../src/core/graph.ts";
import { buildChromaticModulationDemo } from "../../src/examples/chromatic_modulation_demo.ts";
import { compileLoop } from "../../src/dloop/compile.ts";
import { pcFromName, isChromaticMediant, triadIntersection } from "../../src/core/theory.ts";
import { solve } from "../../src/core/solver.ts";
import type { KeyContext } from "../../src/core/types.ts";
import fs from "node:fs";
import path from "node:path";

function key(tonic: string, mode: KeyContext["mode"]): KeyContext {
  return { kind: "context", type: "key", id: "k", tonic: pcFromName(tonic), mode };
}

describe("extended modulation + DSL gaps", () => {
  it("chromatic mediant C major → E major", () => {
    const kC = key("C", "major");
    const kE = key("E", "major");
    expect(isChromaticMediant(kC, kE)).toBe(true);
    expect(triadIntersection(kC, kE)).toContain(4); // E shared
  });

  it("chromatic_modulation_demo declares chromatic mediant", () => {
    const { graph } = buildChromaticModulationDemo();
    const r = solve(graph);
    expect(r.modulations[0].method).toBe("chromatic_mediant");
    expect(r.modulations[0].from).toBe("C major");
    expect(r.modulations[0].to).toBe("E major");
  });

  it("place_at and track_gain compile", () => {
    const src = `
@tempo 120
@meter 4/4
@key C major
track lead instrument warm_pad channel 1
progression main beats 4:
  I
pattern blip unit 1 register 5:
  rhythm sustain
  notes scale 0
place_at blip at 2.5 track lead register 5 velocity 90
track_gain lead fade_in 0 4
`;
    const g = compileLoop(src);
    const r = solve(g);
    expect(r.events.some((e) => Math.abs(e.positionBeats - 2.5) < 0.01)).toBe(true);
  });

  it("scoped sidechain parses and compiles", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "examples/loop/scoped_sidechain.loop"),
      "utf8",
    );
    const g = compileLoop(src);
    const sc = [...g.nodes.values()].find((n) => n.kind === "relationship" && (n as any).type === "sidechain") as any;
    expect(sc.startBeats).toBe(0);
    expect(sc.endBeats).toBe(16);
  });
});
