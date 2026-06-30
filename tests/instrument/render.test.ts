import { describe, expect, it } from "vitest";
import { buildInstrument, instrumentNames } from "../../src/instruments/registry.ts";
import { bufferRms, renderInstrumentNote } from "../../src/midi/render_instrument.ts";

describe("renderInstrumentNote", () => {
  it("wobble_bass C2 produces audible output", async () => {
    const { instrument } = buildInstrument("wobble_bass");
    const buffer = await renderInstrumentNote(instrument, {
      midi: 36,
      durationSec: 0.5,
      sampleRate: 44100,
    });
    expect(buffer.length).toBeGreaterThan(22050);
    expect(bufferRms(buffer)).toBeGreaterThan(0.001);
  });

  it.each(instrumentNames)("%s renders a middle note without error", async (name) => {
    const { instrument } = buildInstrument(name);
    const buffer = await renderInstrumentNote(instrument, {
      midi: 60,
      durationSec: 0.4,
      sampleRate: 22050,
      tailSec: 0.8,
    });
    expect(bufferRms(buffer)).toBeGreaterThan(0.0001);
  });
});
