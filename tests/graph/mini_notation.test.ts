import { describe, expect, it } from "vitest";
import { GraphBuilder } from "../../src/core/graph.ts";
import { pcFromName } from "../../src/core/theory.ts";

describe("GraphBuilder mini-notation", () => {
  it("rhythmMini parses accents and rests", () => {
    const b = new GraphBuilder();
    const onsets = b.rhythmMini("X x . x", 4);
    expect(onsets).toHaveLength(3);
    expect(onsets[0]).toMatchObject({ at: 0, velMul: 1.3 });
    expect(onsets[1]).toMatchObject({ at: 0.25, velMul: 1 });
    expect(onsets[2]).toMatchObject({ at: 0.75, velMul: 1 });
  });

  it("progression expands degrees and repetitions", () => {
    const b = new GraphBuilder();
    b.transport(b.tempo(120), b.meter(4, 4));
    const key = b.key(pcFromName("C"), "natural_minor");
    const spans = b.progression({
      inKey: key,
      pattern: "i*2 IV",
      startBeats: 0,
      beatsPerStep: 4,
    });
    expect(spans).toHaveLength(3);
    const degrees = spans.map((id) => {
      const node = b.graph.nodes.get(id)!;
      return node.kind === "relationship" && node.type === "harmonic_span"
        ? node.degree
        : null;
    });
    expect(degrees).toEqual(["i", "i", "IV"]);
  });
});
