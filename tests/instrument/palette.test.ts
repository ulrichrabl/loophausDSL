import { describe, expect, it } from "vitest";
import type { Instrument, AudioNode } from "../../src/core/audio_types.ts";
import { explainInstrument } from "../../src/core/explain_instrument.ts";
import { buildInstrument } from "../../src/instruments/registry.ts";
import { instrumentUsesPort } from "../../src/midi/audio_renderer.ts";
import { bufferRms, renderInstrumentNote } from "../../src/midi/render_instrument.ts";

const SR = 22050;

function makeInst(nodes: Record<string, AudioNode>, output: string): Instrument {
  return { kind: "instrument", id: "inst_t", name: "t", polyphony: 1, audioNodes: nodes, output };
}

function windowRms(buffer: AudioBuffer, fromSec: number, toSec: number): number {
  const data = buffer.getChannelData(0);
  const from = Math.max(0, Math.floor(fromSec * buffer.sampleRate));
  const to = Math.min(data.length, Math.floor(toSec * buffer.sampleRate));
  let sumSq = 0;
  for (let i = from; i < to; i++) sumSq += data[i] * data[i];
  return to > from ? Math.sqrt(sumSq / (to - from)) : 0;
}

/**
 * High-frequency content proxy: RMS of the first difference relative to
 * signal RMS. Rises with brightness/sideband energy.
 */
function hfRatio(buffer: AudioBuffer, fromSec = 0, toSec = 0.4): number {
  const data = buffer.getChannelData(0);
  const from = Math.floor(fromSec * buffer.sampleRate);
  const to = Math.min(data.length, Math.floor(toSec * buffer.sampleRate));
  let sumSq = 0, diffSq = 0;
  for (let i = from + 1; i < to; i++) {
    sumSq += data[i] * data[i];
    diffSq += (data[i] - data[i - 1]) ** 2;
  }
  return sumSq > 0 ? Math.sqrt(diffSq / sumSq) : 0;
}

const AMP_ENV: Record<string, AudioNode> = {
  env: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.005, d: 0.3 },
};

describe("custom (PeriodicWave) oscillator", () => {
  it("renders a harmonic spectrum and is brighter than a sine", async () => {
    const custom = makeInst({
      ...AMP_ENV,
      osc: { kind: "audio_node", type: "osc", wave: "custom", freq: "$freq",
             harmonics: [1, 0.7, 0.5, 0.4, 0.3, 0.25] },
      amp: { kind: "audio_node", type: "amp", input: "osc",
             gain: { base: 0, mod: [{ source: "env", amount: 0.5 }] } },
    }, "amp");
    const sine = makeInst({
      ...AMP_ENV,
      osc: { kind: "audio_node", type: "osc", wave: "sine", freq: "$freq" },
      amp: { kind: "audio_node", type: "amp", input: "osc",
             gain: { base: 0, mod: [{ source: "env", amount: 0.5 }] } },
    }, "amp");
    const bufC = await renderInstrumentNote(custom, { midi: 57, durationSec: 0.4, sampleRate: SR });
    const bufS = await renderInstrumentNote(sine, { midi: 57, durationSec: 0.4, sampleRate: SR });
    expect(bufferRms(bufC)).toBeGreaterThan(0.01);
    expect(hfRatio(bufC)).toBeGreaterThan(hfRatio(bufS) * 1.5);
  });
});

describe("exponential envelope curves", () => {
  it("exp decay drops level faster than linear early in the note", async () => {
    const build = (curve: "linear" | "exp") => makeInst({
      env: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.005, d: 0.5, curve },
      osc: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq" },
      amp: { kind: "audio_node", type: "amp", input: "osc",
             gain: { base: 0, mod: [{ source: "env", amount: 0.5 }] } },
    }, "amp");
    const lin = await renderInstrumentNote(build("linear"), { midi: 50, durationSec: 0.6, sampleRate: SR });
    const exp = await renderInstrumentNote(build("exp"), { midi: 50, durationSec: 0.6, sampleRate: SR });
    // Mid-decay (halfway) the exponential curve is far below the linear one
    const linMid = windowRms(lin, 0.2, 0.3);
    const expMid = windowRms(exp, 0.2, 0.3);
    expect(expMid).toBeLessThan(linMid * 0.5);
    expect(bufferRms(exp)).toBeGreaterThan(0.005);
  });
});

describe("port modulation ($vel, $freq)", () => {
  it("velocity opens the filter — loud notes are brighter", async () => {
    const inst = makeInst({
      ...AMP_ENV,
      osc: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq" },
      filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
                input: "osc",
                cutoff: { base: 200, mod: [{ source: "$vel", amount: 4000 }] },
                q: 1 },
      amp: { kind: "audio_node", type: "amp", input: "filter",
             gain: { base: 0, mod: [{ source: "env", amount: 0.5 }] } },
    }, "amp");
    const soft = await renderInstrumentNote(inst, { midi: 45, durationSec: 0.3, sampleRate: SR, velocity: 0.1 });
    const hard = await renderInstrumentNote(inst, { midi: 45, durationSec: 0.3, sampleRate: SR, velocity: 1.0 });
    // Timbre check only: velocity→loudness is applied at the track layer.
    expect(hfRatio(hard)).toBeGreaterThan(hfRatio(soft) * 1.3);
  });

  it("$freq keytracks the cutoff", async () => {
    const inst = makeInst({
      ...AMP_ENV,
      osc: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq" },
      filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
                input: "osc",
                cutoff: { base: 0, mod: [{ source: "$freq", amount: 3 }] },
                q: 1 },
      amp: { kind: "audio_node", type: "amp", input: "filter",
             gain: { base: 0, mod: [{ source: "env", amount: 0.5 }] } },
    }, "amp");
    const buf = await renderInstrumentNote(inst, { midi: 57, durationSec: 0.3, sampleRate: SR });
    expect(bufferRms(buf)).toBeGreaterThan(0.01);
  });

  it("instrumentUsesPort detects $vel routes", () => {
    expect(instrumentUsesPort(buildInstrument("acid_bass").instrument, "$vel")).toBe(true);
    expect(instrumentUsesPort(buildInstrument("wobble_bass").instrument, "$vel")).toBe(false);
  });
});

describe("pink noise", () => {
  it("has less high-frequency emphasis than white noise", async () => {
    const build = (color: "white" | "pink") => makeInst({
      ...AMP_ENV,
      noise: { kind: "audio_node", type: "noise", color },
      amp: { kind: "audio_node", type: "amp", input: "noise",
             gain: { base: 0, mod: [{ source: "env", amount: 0.4 }] } },
    }, "amp");
    const white = await renderInstrumentNote(build("white"), { midi: 60, durationSec: 0.3, sampleRate: SR });
    const pink = await renderInstrumentNote(build("pink"), { midi: 60, durationSec: 0.3, sampleRate: SR });
    expect(bufferRms(pink)).toBeGreaterThan(0.005);
    expect(hfRatio(pink)).toBeLessThan(hfRatio(white) * 0.6);
  });
});

describe("audio-rate math", () => {
  it("mul of two oscillators ring-modulates (audible output)", async () => {
    const inst = makeInst({
      ...AMP_ENV,
      a: { kind: "audio_node", type: "osc", wave: "sine", freq: "$freq" },
      bFreq: { kind: "audio_node", type: "math", op: "mul", a: "$freq", b: 1.71 },
      bOsc: { kind: "audio_node", type: "osc", wave: "sine",
              freq: { base: 0, mod: [{ source: "bFreq", amount: 1 }] } },
      ring: { kind: "audio_node", type: "math", op: "mul", a: "a", b: "bOsc" },
      amp: { kind: "audio_node", type: "amp", input: "ring",
             gain: { base: 0, mod: [{ source: "env", amount: 0.5 }] } },
    }, "amp");
    const buf = await renderInstrumentNote(inst, { midi: 57, durationSec: 0.3, sampleRate: SR });
    expect(bufferRms(buf)).toBeGreaterThan(0.01);
  });

  it("static math (div for sub-octave) still works", async () => {
    const { instrument } = buildInstrument("wobble_bass");
    const buf = await renderInstrumentNote(instrument, { midi: 48, durationSec: 0.3, sampleRate: SR });
    expect(bufferRms(buf)).toBeGreaterThan(0.005);
  });
});

describe("FM synthesis", () => {
  it("a 2-op FM pair produces sidebands (vs zero deviation)", async () => {
    const build = (indexAmount: number) => makeInst({
      ...AMP_ENV,
      modOsc: { kind: "audio_node", type: "osc", wave: "sine", freq: "$freq" },
      fmDepth: { kind: "audio_node", type: "amp", input: "modOsc",
                 gain: { base: 0, mod: [{ source: "$freq", amount: indexAmount }] } },
      carrier: { kind: "audio_node", type: "osc", wave: "sine",
                 freq: { base: 0, mod: [{ source: "$freq", amount: 1 }, { source: "fmDepth", amount: 1 }] } },
      amp: { kind: "audio_node", type: "amp", input: "carrier",
             gain: { base: 0, mod: [{ source: "env", amount: 0.5 }] } },
    }, "amp");
    const fm = await renderInstrumentNote(build(5), { midi: 60, durationSec: 0.3, sampleRate: SR });
    const dry = await renderInstrumentNote(build(0), { midi: 60, durationSec: 0.3, sampleRate: SR });
    expect(bufferRms(fm)).toBeGreaterThan(0.01);
    expect(hfRatio(fm)).toBeGreaterThan(hfRatio(dry) * 2);
  });

  it("fm_epiano attack is brighter than its zero-index variant", async () => {
    const { instrument } = buildInstrument("fm_epiano");
    const zero = structuredClone(instrument);
    (zero.audioNodes.fmDepth as { gain: { mod: { amount: number }[] } }).gain.mod[0].amount = 0;
    const bufFm = await renderInstrumentNote(instrument, { midi: 60, durationSec: 0.4, sampleRate: SR });
    const bufZero = await renderInstrumentNote(zero, { midi: 60, durationSec: 0.4, sampleRate: SR });
    expect(bufferRms(bufFm)).toBeGreaterThan(0.01);
    // Sidebands live in the attack — the modulator envelope decays fast
    // (that's the E-piano "bright hit, mellow body" shape), so measure early.
    expect(hfRatio(bufFm, 0, 0.06)).toBeGreaterThan(hfRatio(bufZero, 0, 0.06) * 1.3);
  });

  it("fm_bell rings with a long exponential tail", async () => {
    const { instrument } = buildInstrument("fm_bell");
    const buf = await renderInstrumentNote(instrument, { midi: 72, durationSec: 0.2, sampleRate: SR });
    expect(windowRms(buf, 1.0, 1.8)).toBeGreaterThan(0.002);
  });
});

describe("explain output for new features", () => {
  it("describes custom waves and exp curves", () => {
    const { instrument } = buildInstrument("drawbar_organ");
    expect(explainInstrument(instrument)).toContain("osc custom (8 harmonics)");
    const { instrument: acid } = buildInstrument("acid_bass");
    const text = explainInstrument(acid);
    expect(text).toContain("(exp)");
    expect(text).toContain("$vel × 2800");
  });
});
