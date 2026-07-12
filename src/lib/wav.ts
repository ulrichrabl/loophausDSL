/**
 * 16-bit stereo PCM WAV writer for rendered AudioBuffers.
 */
import * as fs from "fs";

export function renderWavBuffer(buf: AudioBuffer, path: string): void {
  const sr = buf.sampleRate;
  const left = buf.getChannelData(0);
  const right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : left;
  const samples = left.length;
  const blockAlign = 4; // stereo, 16-bit
  const byteRate = sr * blockAlign;
  const dataSize = samples * blockAlign;
  const out = Buffer.alloc(44 + dataSize);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataSize, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);   // PCM
  out.writeUInt16LE(2, 22);   // stereo
  out.writeUInt32LE(sr, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    out.writeInt16LE(Math.floor(l * 32767), 44 + i * 4);
    out.writeInt16LE(Math.floor(r * 32767), 44 + i * 4 + 2);
  }
  fs.writeFileSync(path, out);
}
