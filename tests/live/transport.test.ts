import { describe, expect, it } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import type { Instrument } from "../../src/core/audio_types.ts";
import { LivePlayer } from "../../src/live/player.ts";
import { LiveTransport, type TransportNote } from "../../src/live/transport.ts";
import { createLiveSet } from "../../src/live/set.ts";
import { buildElectronicLoop } from "../../src/examples/electronic_loop.ts";

const SR = 22050;

function makeCtx(durSec: number) {
  return new OfflineAudioContext({ numberOfChannels: 1, length: Math.ceil(SR * durSec), sampleRate: SR });
}

function windowRms(buffer: AudioBuffer, fromSec: number, toSec: number): number {
  const data = buffer.getChannelData(0);
  const from = Math.max(0, Math.floor(fromSec * buffer.sampleRate));
  const to = Math.min(data.length, Math.floor(toSec * buffer.sampleRate));
  let sumSq = 0;
  for (let i = from; i < to; i++) sumSq += data[i] * data[i];
  return to > from ? Math.sqrt(sumSq / (to - from)) : 0;
}

/** Fast-envelope saw so note boundaries are audible in RMS windows. */
function plucky(): Instrument {
  return {
    kind: "instrument", id: "inst_t", name: "t", polyphony: 8,
    audioNodes: {
      osc: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq" },
      env: { kind: "audio_node", type: "env_gen", envType: "adsr", a: 0.005, d: 0.03, s: 0.8, r: 0.05 },
      amp: { kind: "audio_node", type: "amp", input: "osc",
             gain: { base: 0, mod: [{ source: "env", amount: 0.5 }] } },
    },
    output: "amp",
  };
}

describe("LiveTransport", () => {
  it("schedules notes at the right times for the given bpm", async () => {
    const ctx = makeCtx(3.0);
    const player = new LivePlayer(ctx, { noLimiter: true });
    player.addTrack("t", plucky());
    // 120 bpm → 0.5s per beat. Notes on beats 0 and 2; silence on beat 1.
    const notes: TransportNote[] = [
      { track: "t", midi: 60, velocity: 0.9, startBeat: 0, durBeats: 0.5 },
      { track: "t", midi: 64, velocity: 0.9, startBeat: 2, durBeats: 0.5 },
    ];
    const transport = new LiveTransport(player, notes, { bpm: 120, loopBeats: 4 });
    transport.play({ when: 0 });
    const buf = await ctx.startRendering();
    expect(windowRms(buf as AudioBuffer, 0.05, 0.2)).toBeGreaterThan(0.02);   // note 1 sounding
    expect(windowRms(buf as AudioBuffer, 0.6, 0.9)).toBeLessThan(0.005);      // gap
    expect(windowRms(buf as AudioBuffer, 1.05, 1.2)).toBeGreaterThan(0.02);   // note 2 at beat 2 = 1.0s
  });

  it("loops the arrangement across iterations", async () => {
    const ctx = makeCtx(4.5);
    const player = new LivePlayer(ctx, { noLimiter: true });
    player.addTrack("t", plucky());
    const notes: TransportNote[] = [
      { track: "t", midi: 60, velocity: 0.9, startBeat: 0, durBeats: 1 },
    ];
    // loop = 2 beats at 60 bpm → note at 0s, 2s, 4s...
    const transport = new LiveTransport(player, notes, { bpm: 60, loop: true, loopBeats: 2 });
    transport.play({ when: 0, iterations: 2 });
    const buf = await ctx.startRendering();
    expect(windowRms(buf as AudioBuffer, 0.1, 0.8)).toBeGreaterThan(0.02);    // iteration 0
    expect(windowRms(buf as AudioBuffer, 1.3, 1.9)).toBeLessThan(0.005);      // between loops
    expect(windowRms(buf as AudioBuffer, 2.1, 2.8)).toBeGreaterThan(0.02);    // iteration 1
  });

  it("computes loop length from the last note when not given", () => {
    const ctx = makeCtx(0.1);
    const player = new LivePlayer(ctx);
    player.addTrack("t", plucky());
    const transport = new LiveTransport(player, [
      { track: "t", midi: 60, velocity: 0.8, startBeat: 0, durBeats: 1 },
      { track: "t", midi: 62, velocity: 0.8, startBeat: 6, durBeats: 1.5 },
    ], { bpm: 100 });
    expect(transport.loopBeats).toBe(8);   // ceil(7.5)
    expect(transport.lengthSec).toBeCloseTo(8 * 0.6, 5);
  });
});

describe("createLiveSet", () => {
  it("plays a full composed graph live — synths and drums together", async () => {
    const ctx = makeCtx(4.0);
    const { graph } = buildElectronicLoop();   // drums + wobble bass + warm pad
    const { player, transport, result } = createLiveSet(ctx, graph, { masterGain: 0.6 });

    expect(player.trackNames()).toEqual(["drums", "bass", "pad"]);
    expect(result.events.length).toBeGreaterThan(0);
    expect(transport.bpm).toBe(120);
    expect(transport.loopBeats).toBe(16);      // 4 bars of 4/4

    transport.play({ when: 0 });
    const buf = await ctx.startRendering();
    // Sustained content through the first bars (pad holds, bass pulses, drums hit)
    expect(windowRms(buf as AudioBuffer, 0.1, 1.0)).toBeGreaterThan(0.02);
    expect(windowRms(buf as AudioBuffer, 2.0, 3.5)).toBeGreaterThan(0.02);
  });

  it("drum tracks trigger procedural voices (kick has low-band energy)", async () => {
    const ctx = makeCtx(1.0);
    const player = new LivePlayer(ctx, { noLimiter: true });
    player.addDrumTrack("drums");
    player.noteOn("drums", 36, 1.0, 0.1);      // kick
    player.noteOff("drums", 36);               // no-op for drums
    expect(player.activeVoices("drums")).toBe(0);
    const buf = await ctx.startRendering();
    expect(windowRms(buf as AudioBuffer, 0.1, 0.4)).toBeGreaterThan(0.05);
    expect(windowRms(buf as AudioBuffer, 0.7, 0.95)).toBeLessThan(0.005);    // self-terminated
  });

  it("stop() releases everything and halts the transport", async () => {
    const ctx = makeCtx(2.0);
    const { graph } = buildElectronicLoop();
    const { transport } = createLiveSet(ctx, graph, { loop: true });
    transport.play({ when: 0, iterations: 1 });
    expect(transport.isPlaying).toBe(false);   // offline: all scheduled upfront
    transport.stop(1.0);
    expect(() => transport.stop()).not.toThrow();
  });
});
