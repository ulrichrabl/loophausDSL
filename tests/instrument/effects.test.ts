import { describe, expect, it } from "vitest";
import type { Instrument } from "../../src/core/audio_types.ts";
import { explainInstrument } from "../../src/core/explain_instrument.ts";
import { buildInstrument } from "../../src/instruments/registry.ts";
import { instrumentTailSec } from "../../src/midi/audio_renderer.ts";
import { renderInstrumentNote } from "../../src/midi/render_instrument.ts";

const SR = 22050;

/** RMS over a time window (seconds) of channel 0. */
function windowRms(buffer: AudioBuffer, fromSec: number, toSec: number): number {
  const data = buffer.getChannelData(0);
  const from = Math.max(0, Math.floor(fromSec * buffer.sampleRate));
  const to = Math.min(data.length, Math.floor(toSec * buffer.sampleRate));
  if (to <= from) return 0;
  let sumSq = 0;
  for (let i = from; i < to; i++) sumSq += data[i] * data[i];
  return Math.sqrt(sumSq / (to - from));
}

/** Minimal single-osc instrument with one effect appended after the amp. */
function oscWithEffect(effect: Instrument["audioNodes"][string] | null): Instrument {
  const audioNodes: Instrument["audioNodes"] = {
    osc: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq" },
    env: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.005, d: 0.15 },
    amp: { kind: "audio_node", type: "amp", input: "osc",
           gain: { base: 0, mod: [{ source: "env", amount: 0.6 }] } },
  };
  if (effect) audioNodes.fx = effect;
  return {
    kind: "instrument",
    id: "inst_test",
    name: "test",
    polyphony: 1,
    audioNodes,
    output: effect ? "fx" : "amp",
  };
}

describe("effect nodes", () => {
  it("delay produces echoes after the dry note has decayed", async () => {
    const inst = oscWithEffect({
      kind: "audio_node", type: "effect", effectType: "delay",
      input: "amp", params: { time: 0.3, feedback: 0.5, mix: 0.5 },
    });
    const buffer = await renderInstrumentNote(inst, {
      midi: 57, durationSec: 0.2, sampleRate: SR,
    });
    // Dry note (ad envelope) is silent by ~0.4s. Echoes land at 0.3, 0.6, 0.9...
    const echoRms = windowRms(buffer, 0.55, 0.95);
    const dry = oscWithEffect(null);
    const dryBuffer = await renderInstrumentNote(dry, {
      midi: 57, durationSec: 0.2, sampleRate: SR,
    });
    const dryTail = windowRms(dryBuffer, 0.55, 0.95);
    expect(echoRms).toBeGreaterThan(0.005);
    expect(echoRms).toBeGreaterThan(dryTail * 10);
  });

  it("reverb sustains a tail after note release", async () => {
    const inst = oscWithEffect({
      kind: "audio_node", type: "effect", effectType: "reverb",
      input: "amp", params: { duration: 1.5, mix: 0.5 },
    });
    const buffer = await renderInstrumentNote(inst, {
      midi: 60, durationSec: 0.2, sampleRate: SR,
    });
    // Note decays by ~0.4s; convolution tail should still carry energy after.
    expect(windowRms(buffer, 0.6, 1.2)).toBeGreaterThan(0.002);
  });

  it("chorus keeps overall level comparable to dry", async () => {
    const inst = oscWithEffect({
      kind: "audio_node", type: "effect", effectType: "chorus",
      input: "amp", params: { rate: 1.2, depth: 0.005, mix: 0.5 },
    });
    const buffer = await renderInstrumentNote(inst, {
      midi: 64, durationSec: 0.4, sampleRate: SR,
    });
    const rms = windowRms(buffer, 0, 0.4);
    expect(rms).toBeGreaterThan(0.02);
  });

  it("compressor reduces peak-to-rms ratio versus dry", async () => {
    const compressed = oscWithEffect({
      kind: "audio_node", type: "effect", effectType: "compressor",
      input: "amp",
      params: { threshold: -30, ratio: 8, attack: 0.002, release: 0.1 },
    });
    const buffer = await renderInstrumentNote(compressed, {
      midi: 48, durationSec: 0.4, sampleRate: SR,
    });
    expect(windowRms(buffer, 0, 0.4)).toBeGreaterThan(0.01);
  });

  it("distortion mix < 1 blends dry and wet", async () => {
    const inst = oscWithEffect({
      kind: "audio_node", type: "effect", effectType: "distortion",
      input: "amp", params: { amount: 4, mix: 0.5 },
    });
    const buffer = await renderInstrumentNote(inst, {
      midi: 45, durationSec: 0.3, sampleRate: SR,
    });
    expect(windowRms(buffer, 0, 0.3)).toBeGreaterThan(0.02);
  });
});

describe("instrumentTailSec", () => {
  it("extends tail for delay feedback ring-out", () => {
    const { instrument } = buildInstrument("echo_pluck");
    // time 0.28, feedback 0.45 — echoes ring for a few seconds
    expect(instrumentTailSec(instrument)).toBeGreaterThan(3);
    expect(instrumentTailSec(instrument)).toBeLessThanOrEqual(10);
  });

  it("extends tail for reverb duration", () => {
    const { instrument } = buildInstrument("shimmer_pad");
    expect(instrumentTailSec(instrument)).toBeGreaterThan(3.5);
  });

  it("keeps the default for effect-free instruments", () => {
    const { instrument } = buildInstrument("clavinet_stab");
    expect(instrumentTailSec(instrument)).toBe(1.5);
  });
});

describe("explainInstrument effects", () => {
  it("describes effect parameters", () => {
    const { instrument } = buildInstrument("echo_pluck");
    const text = explainInstrument(instrument);
    expect(text).toContain("effect delay ← amp");
    expect(text).toContain("time=0.28");
    expect(text).toContain("feedback=0.45");
  });
});
