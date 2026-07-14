import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OfflineAudioContext } from "node-web-audio-api";
import type { Instrument, AudioNode, SampleBank } from "../../src/core/audio_types.ts";
import { explainInstrument } from "../../src/core/explain_instrument.ts";
import { GraphBuilder } from "../../src/core/graph.ts";
import { defineSampler } from "../../src/instruments/library.ts";
import { asInstrument } from "../../src/instruments/registry.ts";
import { instrumentTailSec } from "../../src/midi/audio_renderer.ts";
import { bufferRms, renderInstrumentNote } from "../../src/midi/render_instrument.ts";
import { loadSample, loadSamplesFromDir } from "../../src/midi/samples_node.ts";

const SR = 22050;

/** Synthesize a mono test sample: 440 Hz sine, `durSec` long, no fade. */
function makeSineSample(durSec: number, freq = 440): AudioBuffer {
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: SR });
  const buf = ctx.createBuffer(1, Math.ceil(SR * durSec), SR);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = 0.8 * Math.sin(2 * Math.PI * freq * i / SR);
  return buf as AudioBuffer;
}

function windowRms(buffer: AudioBuffer, fromSec: number, toSec: number): number {
  const data = buffer.getChannelData(0);
  const from = Math.max(0, Math.floor(fromSec * buffer.sampleRate));
  const to = Math.min(data.length, Math.floor(toSec * buffer.sampleRate));
  let sumSq = 0;
  for (let i = from; i < to; i++) sumSq += data[i] * data[i];
  return to > from ? Math.sqrt(sumSq / (to - from)) : 0;
}

/** Estimate dominant frequency by zero-crossing count. */
function zeroCrossFreq(buffer: AudioBuffer, fromSec: number, toSec: number): number {
  const data = buffer.getChannelData(0);
  const from = Math.floor(fromSec * buffer.sampleRate);
  const to = Math.min(data.length, Math.floor(toSec * buffer.sampleRate));
  let crossings = 0;
  for (let i = from + 1; i < to; i++) {
    if ((data[i - 1] < 0 && data[i] >= 0) || (data[i - 1] >= 0 && data[i] < 0)) crossings++;
  }
  return (crossings / 2) / ((to - from) / buffer.sampleRate);
}

/** Bare sampler instrument without envelope, for signal-level checks. */
function bareSampler(overrides: Partial<Extract<AudioNode, { type: "sampler" }>> = {}): Instrument {
  return {
    kind: "instrument", id: "inst_s", name: "s", polyphony: 1,
    audioNodes: {
      smp: { kind: "audio_node", type: "sampler", sample: "beep", rootMidi: 69, ...overrides },
      amp: { kind: "audio_node", type: "amp", input: "smp", gain: 1 },
    },
    output: "amp",
  };
}

const bank: SampleBank = { beep: makeSineSample(0.5) };

describe("sampler node", () => {
  it("plays the sample at unity rate when note == rootMidi", async () => {
    const buf = await renderInstrumentNote(bareSampler(), {
      midi: 69, durationSec: 0.5, sampleRate: SR, samples: bank,
    });
    expect(bufferRms(buf)).toBeGreaterThan(0.05);
    expect(zeroCrossFreq(buf, 0.05, 0.4)).toBeCloseTo(440, -1);
  });

  it("repitches an octave up at rootMidi + 12", async () => {
    const buf = await renderInstrumentNote(bareSampler(), {
      midi: 81, durationSec: 0.5, sampleRate: SR, samples: bank,
    });
    // Octave up = 880 Hz, and the sample plays twice as fast (ends by 0.25s)
    expect(zeroCrossFreq(buf, 0.02, 0.2)).toBeCloseTo(880, -2);
    expect(windowRms(buf, 0.3, 0.45)).toBeLessThan(0.01);
  });

  it("unpitched samples ignore the note frequency", async () => {
    const buf = await renderInstrumentNote(bareSampler({ pitched: false }), {
      midi: 93, durationSec: 0.5, sampleRate: SR, samples: bank,
    });
    expect(zeroCrossFreq(buf, 0.05, 0.4)).toBeCloseTo(440, -1);
  });

  it("one-shots play past note-off to the end of the sample", async () => {
    // Note is 0.1s, sample is 0.5s — audio should continue after the note
    const buf = await renderInstrumentNote(bareSampler(), {
      midi: 69, durationSec: 0.1, sampleRate: SR, samples: bank,
    });
    expect(windowRms(buf, 0.3, 0.45)).toBeGreaterThan(0.05);
  });

  it("looped samples sustain for the whole note, then stop", async () => {
    const buf = await renderInstrumentNote(bareSampler({ loop: true }), {
      midi: 69, durationSec: 1.2, sampleRate: SR, samples: bank, tailSec: 0.5,
    });
    // Well past the 0.5s sample length, still sounding (looped)
    expect(windowRms(buf, 0.9, 1.15)).toBeGreaterThan(0.05);
  });

  it("throws a clear error when the sample is missing from the bank", async () => {
    await expect(renderInstrumentNote(bareSampler({ sample: "nope" }), {
      midi: 69, durationSec: 0.2, sampleRate: SR, samples: bank,
    })).rejects.toThrow(/sample "nope" not found/);
  });

  it("extends the render tail for one-shots longer than the note", () => {
    const inst = bareSampler();
    expect(instrumentTailSec(inst, 0.2, bank)).toBeGreaterThanOrEqual(0.6);
    expect(instrumentTailSec(inst, 0.2)).toBeLessThan(0.6); // no bank, no extension
  });
});

describe("defineSampler factory", () => {
  it("builds a gated, enveloped sampler instrument", async () => {
    const b = new GraphBuilder();
    const id = defineSampler(b, {
      name: "beeper", sample: "beep", rootMidi: 69,
      adsr: { a: 0.01, d: 0.05, s: 0.8, r: 0.1 },
      cutoff: 4000,
    });
    const node = b.graph.nodes.get(id);
    expect(node?.kind).toBe("instrument");
    const inst = asInstrument(node as Parameters<typeof asInstrument>[0]);
    const buf = await renderInstrumentNote(inst, {
      midi: 69, durationSec: 0.3, sampleRate: SR, samples: bank,
    });
    expect(bufferRms(buf)).toBeGreaterThan(0.03);
    const text = explainInstrument(inst);
    expect(text).toContain('sampler "beep" root=69 one-shot');
  });
});

describe("Node sample loaders", () => {
  it("loads a WAV file and a directory into a SampleBank", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loophaus-samples-"));
    try {
      writeTestWav(path.join(dir, "blip.wav"), 0.25, 330);
      writeTestWav(path.join(dir, "thud.wav"), 0.1, 80);
      fs.writeFileSync(path.join(dir, "notes.txt"), "not audio");

      const single = await loadSample(path.join(dir, "blip.wav"));
      expect(single.duration).toBeCloseTo(0.25, 1);

      const loaded = await loadSamplesFromDir(dir);
      expect(Object.keys(loaded).sort()).toEqual(["blip", "thud"]);

      // Loaded samples are directly playable
      const buf = await renderInstrumentNote(bareSampler({ sample: "blip" }), {
        midi: 69, durationSec: 0.25, sampleRate: SR, samples: loaded,
      });
      expect(bufferRms(buf)).toBeGreaterThan(0.01);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Minimal 16-bit PCM mono WAV writer for loader tests. */
function writeTestWav(filePath: string, durSec: number, freq: number): void {
  const sr = 22050;
  const samples = Math.ceil(sr * durSec);
  const out = Buffer.alloc(44 + samples * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + samples * 2, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24);
  out.writeUInt32LE(sr * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    out.writeInt16LE(Math.round(0.7 * 32767 * Math.sin(2 * Math.PI * freq * i / sr)), 44 + i * 2);
  }
  fs.writeFileSync(filePath, out);
}
