import { describe, expect, it } from "vitest";
import {
  commonTonePcsBetweenKeys,
  dominantSeventhPcs,
  keyLabel,
  pivotPcsForModulation,
  relativeMajorOf,
  triadIntersection,
  isChromaticMediant,
  suggestPivotDegree,
  pcFromName,
} from "../../src/core/theory.ts";
import type { KeyContext } from "../../src/core/types.ts";

function key(tonic: string, mode: KeyContext["mode"]): KeyContext {
  return { kind: "context", type: "key", id: "k", tonic: pcFromName(tonic), mode };
}

describe("modulation theory", () => {
  it("finds common tones between C minor and G minor", () => {
    const cm = key("C", "natural_minor");
    const gm = key("G", "natural_minor");
    const common = commonTonePcsBetweenKeys(cm, gm);
    expect(common).toContain(0); // C
    expect(common).toContain(7); // G
  });

  it("computes dominant seventh of G minor", () => {
    const gm = key("G", "natural_minor");
    const dom = dominantSeventhPcs(gm);
    expect(dom).toEqual([2, 6, 9, 0]); // D F# A C
  });

  it("relative major of C minor is Eb", () => {
    expect(relativeMajorOf(key("C", "natural_minor"))).toBe(3);
  });

  it("suggests V pivot for C minor → G minor dominant modulation", () => {
    const deg = suggestPivotDegree(key("C", "natural_minor"), key("G", "natural_minor"), "dominant");
    expect(deg).toBe("V");
  });

  it("pivotPcsForModulation dominant uses destination V7", () => {
    const pcs = pivotPcsForModulation(
      key("C", "natural_minor"),
      key("G", "natural_minor"),
      "dominant",
    );
    expect(pcs).toEqual(dominantSeventhPcs(key("G", "natural_minor")));
  });

  it("suggests pivot for chromatic mediant", () => {
    const deg = suggestPivotDegree(key("C", "major"), key("E", "major"), "chromatic_mediant");
    expect(deg).toBeDefined();
    expect(triadIntersection(key("C", "major"), key("E", "major")).length).toBeGreaterThan(0);
  });
});
