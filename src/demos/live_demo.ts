/**
 * Live engine demo — a short multitimbral performance through LivePlayer:
 * four instruments (with their effect chains) playing at once, driven by
 * noteOn/noteOff calls exactly as a MIDI keyboard or DAW would.
 *
 *   npx tsx src/demos/live_demo.ts            # real-time audio output
 *   npx tsx src/demos/live_demo.ts --offline  # render the same performance to WAV
 *
 * Real-time needs an audio device; --offline works anywhere (CI, servers).
 */
import { AudioContext, OfflineAudioContext } from "node-web-audio-api";
import { LivePlayer } from "../live/player.ts";
import { buildInstrument } from "../instruments/registry.ts";
import { outputPath } from "../lib/paths.ts";

const DUR = 8;
const SR = 44100;

function schedulePerformance(player: LivePlayer): void {
  const bar = 2.0;   // seconds per bar at 120 BPM
  // Am | F | C | G — bass roots, epiano chords, offbeat plucks, pad sustains
  const chords = [
    { bass: 33, keys: [57, 60, 64], pad: [45, 52] },
    { bass: 29, keys: [57, 60, 65], pad: [41, 48] },
    { bass: 36, keys: [55, 60, 64], pad: [43, 48] },
    { bass: 31, keys: [55, 59, 62], pad: [43, 50] },
  ];
  chords.forEach((c, i) => {
    const t0 = 0.1 + i * bar;
    player.noteOn("bass", c.bass, 1.0, t0);
    player.noteOff("bass", c.bass, t0 + bar * 0.9);
    for (const m of c.keys) {
      player.noteOn("keys", m, 0.75, t0 + 0.02);
      player.noteOff("keys", m, t0 + bar * 0.45);
    }
    for (const m of c.pad) {
      player.noteOn("pad", m, 0.6, t0);
      player.noteOff("pad", m, t0 + bar * 0.95);
    }
    // Offbeat plucks — the echo_pluck delay fills the gaps
    for (let k = 0; k < 4; k++) {
      const m = c.keys[(k + i) % c.keys.length] + 12;
      player.noteOn("pluck", m, 0.9, t0 + 0.5 * k + 0.25);
      player.noteOff("pluck", m, t0 + 0.5 * k + 0.45);
    }
  });
}

function buildPlayer(ctx: unknown): LivePlayer {
  // Note: the master limiter (DynamicsCompressor) applies automatic makeup
  // gain per the Web Audio spec, so keep the master level conservative.
  const player = new LivePlayer(ctx, { masterGain: 0.5 });
  player.addTrack("bass", buildInstrument("acid_bass").instrument, { gain: 0.9 });
  player.addTrack("keys", buildInstrument("fm_epiano").instrument, { gain: 0.75 });
  player.addTrack("pluck", buildInstrument("echo_pluck").instrument, { gain: 0.7 });
  player.addTrack("pad", buildInstrument("string_machine").instrument, {
    gain: 0.5,
    effects: [{ kind: "audio_node", type: "effect", effectType: "reverb",
                input: "", params: { duration: 2.0, mix: 0.3 } }],
  });
  return player;
}

(async () => {
  const offline = process.argv.includes("--offline");

  if (offline) {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: SR * (DUR + 2), sampleRate: SR });
    schedulePerformance(buildPlayer(ctx));
    console.log("Rendering live performance offline...");
    const buf = await ctx.startRendering();
    const { renderWavBuffer } = await import("../lib/wav.ts");
    const out = outputPath("live_demo.wav");
    renderWavBuffer(buf as AudioBuffer, out);
    console.log(`Output: ${out}`);
    return;
  }

  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: SR });
  } catch (e: unknown) {
    console.error(`No real-time audio device available (${(e as Error).message}).`);
    console.error("Try: npx tsx src/demos/live_demo.ts --offline");
    process.exit(1);
  }
  console.log(`Real-time audio @ ${ctx.sampleRate} Hz — playing ${DUR}s multitimbral performance...`);
  schedulePerformance(buildPlayer(ctx));
  await new Promise(res => setTimeout(res, (DUR + 2) * 1000));
  await ctx.close();
  console.log("Done.");
})();
