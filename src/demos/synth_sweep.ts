/**
 * Synth framework demo — render isolated instrument notes without a score piece.
 *
 *   npx tsx src/demos/synth_sweep.ts                    # list instruments
 *   npx tsx src/demos/synth_sweep.ts wobble_bass        # one note WAV
 *   npx tsx src/demos/synth_sweep.ts all --explain      # all instruments + explain()
 */
import fs from "node:fs";
import { explainInstrument } from "../core/explain_instrument.ts";
import { buildInstrument, instrumentNames, type InstrumentName } from "../instruments/registry.ts";
import { bufferRms, renderInstrumentNote } from "../midi/render_instrument.ts";
import { outputPath } from "../lib/paths.ts";

const SWEEP_NOTES = [
  { midi: 36, label: "C2", durSec: 0.8 },
  { midi: 43, label: "G2", durSec: 0.8 },
  { midi: 48, label: "C3", durSec: 1.2 },
];

function writeWavMono(path: string, buffer: AudioBuffer): void {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const samples = ch0.length;
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    const s = (ch0[i] + ch1[i]) * 0.5;
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767 * 0.85)));
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length * 2, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(buffer.sampleRate, 24);
  header.writeUInt32LE(buffer.sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length * 2, 40);
  fs.writeFileSync(path, Buffer.concat([header, Buffer.from(pcm.buffer)]));
}

async function renderInstrumentDemo(name: InstrumentName, wantExplain: boolean): Promise<void> {
  const { instrument } = buildInstrument(name);
  console.log(`\n=== ${name} ===`);
  if (wantExplain) {
    console.log(explainInstrument(instrument));
    console.log("");
  }

  for (const note of SWEEP_NOTES) {
    const buffer = await renderInstrumentNote(instrument, {
      midi: note.midi,
      durationSec: note.durSec,
    });
    const rms = bufferRms(buffer);
    const out = outputPath(`synth_${name}_${note.label}.wav`);
    writeWavMono(out, buffer);
    console.log(`  ${note.label} (midi ${note.midi}): RMS=${rms.toFixed(4)} → ${out}`);
  }
}

(async () => {
  const args = process.argv.slice(2);
  const wantExplain = args.includes("--explain");
  const target = args.find((a) => !a.startsWith("--"));

  if (!target) {
    console.log("Available instruments:");
    for (const n of instrumentNames) console.log(`  ${n}`);
    console.log("\nUsage:");
    console.log("  npx tsx src/demos/synth_sweep.ts <name> [--explain]");
    console.log("  npx tsx src/demos/synth_sweep.ts all [--explain]");
    return;
  }

  if (target === "all") {
    for (const name of instrumentNames) {
      await renderInstrumentDemo(name, wantExplain);
    }
    return;
  }

  if (!instrumentNames.includes(target as InstrumentName)) {
    console.error(`Unknown instrument: ${target}`);
    process.exit(1);
  }
  await renderInstrumentDemo(target as InstrumentName, wantExplain);
})();
