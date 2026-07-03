/**
 * Render a single instrument voice offline — no score graph required.
 */
import { OfflineAudioContext } from "node-web-audio-api";
import type { Instrument } from "../core/audio_types.ts";
import { instrumentTailSec, renderInstrumentVoice } from "./audio_renderer.ts";

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface RenderNoteOptions {
  midi: number;
  durationSec: number;
  velocity?: number;
  sampleRate?: number;
  tailSec?: number;
}

export async function renderInstrumentNote(
  inst: Instrument,
  opts: RenderNoteOptions,
): Promise<AudioBuffer> {
  const sr = opts.sampleRate ?? 44100;
  // Effect ring-out (delay feedback, reverb decay) can far exceed the 1.5s
  // default; size the buffer from the instrument's declared effects.
  const tailSec = instrumentTailSec(inst, opts.tailSec ?? 1.5);
  const durSec = opts.durationSec;
  const ctx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil(sr * (durSec + tailSec)),
    sampleRate: sr,
  });

  renderInstrumentVoice(inst, {
    ctx: ctx as Parameters<typeof renderInstrumentVoice>[1]["ctx"],
    startTime: 0,
    endTime: durSec,
    freqHz: midiToHz(opts.midi),
    velocity: opts.velocity ?? 1.0,
    outputDest: ctx.destination as Parameters<typeof renderInstrumentVoice>[1]["outputDest"],
  });

  return (await ctx.startRendering()) as AudioBuffer;
}

/** Root-mean-square energy across all channels. */
export function bufferRms(buffer: AudioBuffer): number {
  let sumSq = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      sumSq += data[i] * data[i];
      count++;
    }
  }
  return count === 0 ? 0 : Math.sqrt(sumSq / count);
}
