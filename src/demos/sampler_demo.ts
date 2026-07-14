/**
 * Sampler demo — no audio assets required: synthesizes a plucked-string
 * sample in code, registers it in a SampleBank, then plays a phrase through
 * defineSampler with repitching. Swap makePluckSample() for
 * loadSamplesFromDir("./samples") to use real recordings.
 *
 *   npx tsx src/demos/sampler_demo.ts
 */
import { OfflineAudioContext } from "node-web-audio-api";
import { GraphBuilder } from "../core/graph.ts";
import type { SampleBank } from "../core/audio_types.ts";
import { explainInstrument } from "../core/explain_instrument.ts";
import { defineSampler } from "../instruments/library.ts";
import { asInstrument } from "../instruments/registry.ts";
import { pcFromName } from "../core/theory.ts";
import { solve } from "../core/solver.ts";
import { renderWebAudio } from "../midi/web_audio.ts";
import { outputPath } from "../lib/paths.ts";

/** Karplus-Strong-ish pluck at C4, rendered offline into an AudioBuffer. */
async function makePluckSample(): Promise<AudioBuffer> {
  const sr = 44100;
  const dur = 1.5;
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: Math.ceil(sr * dur), sampleRate: sr });
  const freq = 261.63; // C4 — becomes the sampler's rootMidi 60
  // Noise burst into a feedback delay tuned to 1/freq = plucked string
  const burst = ctx.createBufferSource();
  const burstBuf = ctx.createBuffer(1, Math.ceil(sr / freq), sr);
  const bd = burstBuf.getChannelData(0);
  for (let i = 0; i < bd.length; i++) bd[i] = Math.random() * 2 - 1;
  burst.buffer = burstBuf;
  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = 1 / freq;
  const fb = ctx.createGain();
  fb.gain.value = 0.985;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 4500;
  burst.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay);
  delay.connect(ctx.destination);
  burst.start(0);
  return (await ctx.startRendering()) as AudioBuffer;
}

(async () => {
  console.log("Synthesizing pluck sample (Karplus-Strong)...");
  const samples: SampleBank = { pluck_c4: await makePluckSample() };

  const b = new GraphBuilder();
  b.transport(b.tempo(100), b.meter(4, 4), {});
  const key = b.key(pcFromName("A"), "natural_minor");
  const instId = defineSampler(b, {
    name: "sampled_pluck",
    sample: "pluck_c4",
    rootMidi: 60,
    adsr: { a: 0.002, d: 0.1, s: 0.9, r: 0.2 },
  });
  console.log(explainInstrument(asInstrument(b.graph.nodes.get(instId) as any)));

  const track = b.track("pluck", 1, { instrument: instId });
  const spans = b.progression({ inKey: key, pattern: "i VI III VII", startBeats: 0 });
  const arp = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x x x x x x x x", 4),
    notes: [0, 1, 2, 1, 2, 0, 1, 2].map(v => ({ kind: "chord_tone" as const, value: v })),
    defaultRegister: 4,
  });
  b.placeRange({ pattern: arp, underSpans: spans, track, velocity: 92 });

  const result = solve(b.graph);
  console.log(`Solved ${result.events.length} events; rendering...`);
  const out = outputPath("sampler_demo.wav");
  await renderWebAudio(b.graph, result, out, { samples });
  console.log(`Output: ${out}`);
})();
