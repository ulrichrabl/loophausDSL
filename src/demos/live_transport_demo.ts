/**
 * Live transport demo — a whole composed piece (electronic_loop: drums,
 * wobble bass, warm pad) playing through the live engine: solver events
 * dispatched as noteOn/noteOff with lookahead scheduling, looping.
 *
 *   npx tsx src/demos/live_transport_demo.ts            # real-time, loops twice
 *   npx tsx src/demos/live_transport_demo.ts --offline  # render 2 loops to WAV
 */
import { AudioContext, OfflineAudioContext } from "node-web-audio-api";
import { createLiveSet } from "../live/set.ts";
import { buildElectronicLoop } from "../examples/electronic_loop.ts";
import { outputPath } from "../lib/paths.ts";

const SR = 44100;

(async () => {
  const offline = process.argv.includes("--offline");
  const { graph } = buildElectronicLoop();

  if (offline) {
    const probe = createLiveSet(new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: SR }), graph, {});
    const durSec = probe.transport.lengthSec * 2 + 2;
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(SR * durSec), sampleRate: SR });
    const { transport } = createLiveSet(ctx, graph, { loop: true, masterGain: 0.35 });
    transport.play({ when: 0.05, iterations: 2 });
    console.log(`Rendering 2 transport loops (${durSec.toFixed(1)}s) offline...`);
    const buf = await ctx.startRendering();
    const { renderWavBuffer } = await import("../lib/wav.ts");
    const out = outputPath("live_transport_demo.wav");
    renderWavBuffer(buf as AudioBuffer, out);
    console.log(`Output: ${out}`);
    return;
  }

  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: SR });
  } catch (e: unknown) {
    console.error(`No real-time audio device available (${(e as Error).message}).`);
    console.error("Try: npx tsx src/demos/live_transport_demo.ts --offline");
    process.exit(1);
  }
  const { transport } = createLiveSet(ctx, graph, { loop: true, masterGain: 0.35 });
  console.log(`Real-time @ ${ctx.sampleRate} Hz — looping ${transport.loopBeats} beats at ${transport.bpm} bpm. Two passes...`);
  transport.play();
  await new Promise(res => setTimeout(res, (transport.lengthSec * 2 + 1) * 1000));
  transport.stop();
  await new Promise(res => setTimeout(res, 1500));   // ring-out
  await ctx.close();
  console.log("Done.");
})();
