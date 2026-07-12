/**
 * Node-side sample loading. Decodes audio files into AudioBuffers via
 * node-web-audio-api (WAV always; other formats as supported by the
 * underlying decoder) and returns SampleBanks for the renderers.
 *
 * Browser hosts don't use this — they decode with their own AudioContext
 * (fetch → decodeAudioData) and pass the resulting bank the same way.
 */
import fs from "node:fs";
import path from "node:path";
import { OfflineAudioContext } from "node-web-audio-api";
import type { SampleBank } from "../core/audio_types.ts";

const AUDIO_EXTENSIONS = new Set([".wav", ".flac", ".mp3", ".ogg", ".aiff", ".aif"]);

/** Decode one audio file into an AudioBuffer. */
export async function loadSample(filePath: string): Promise<AudioBuffer> {
  const data = fs.readFileSync(filePath);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: 44100 });
  return (await ctx.decodeAudioData(arrayBuffer as ArrayBuffer)) as AudioBuffer;
}

/**
 * Load every audio file in a directory into a SampleBank, keyed by
 * filename without extension: samples/kick_909.wav → "kick_909".
 */
export async function loadSamplesFromDir(dir: string): Promise<SampleBank> {
  const bank: SampleBank = {};
  for (const entry of fs.readdirSync(dir)) {
    const ext = path.extname(entry).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) continue;
    const name = path.basename(entry, path.extname(entry));
    bank[name] = await loadSample(path.join(dir, entry));
  }
  return bank;
}
