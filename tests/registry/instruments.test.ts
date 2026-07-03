import { describe, expect, it } from "vitest";
import { examples } from "../../src/examples/registry.ts";
import { assertAllPitchedTracksHaveInstrument } from "../helpers/instruments.ts";

describe("registry instrument coverage", () => {
  for (const name of Object.keys(examples)) {
    it(`${name} binds instrument graphs on all pitched tracks`, () => {
      assertAllPitchedTracksHaveInstrument(examples[name]());
    });
  }
});
