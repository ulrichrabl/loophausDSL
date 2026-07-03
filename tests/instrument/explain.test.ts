import { describe, expect, it } from "vitest";
import { explainInstrument, modulationRoutes } from "../../src/core/explain_instrument.ts";
import { buildInstrument } from "../../src/instruments/registry.ts";

describe("explainInstrument", () => {
  it("describes wobble_bass nodes and filter envelope routing", () => {
    const { instrument } = buildInstrument("wobble_bass");
    const text = explainInstrument(instrument);
    expect(text).toContain("# Instrument: wobble_bass");
    expect(text).toContain("**filter**");
    expect(text).toContain("filterEnv");

    const routes = modulationRoutes(instrument);
    expect(routes.some((r) => r.target === "filter.cutoff" && r.source === "filterEnv")).toBe(true);
    expect(routes.some((r) => r.target === "amp.gain" && r.source === "ampEnv")).toBe(true);
  });

  it("lists all library instruments without throwing", () => {
    for (const name of ["supersaw_lead", "warm_pad", "clavinet_stab"] as const) {
      const { instrument } = buildInstrument(name);
      const text = explainInstrument(instrument);
      expect(text).toContain(`# Instrument: ${name}`);
      expect(text).toContain("## Nodes");
      expect(text).toContain("## Modulations");
    }
  });
});
