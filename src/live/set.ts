/**
 * createLiveSet — from a composed Graph to a playing arrangement in one
 * call: solves the graph, builds a LivePlayer with one bus per track
 * (instrument graphs for synth tracks, procedural voices for percussion),
 * converts solver events into transport notes, and returns a
 * LiveTransport ready to play()/stop().
 *
 *   const { transport } = createLiveSet(audioCtx, graph, { loop: true });
 *   transport.play();     // the whole piece, live, looping
 *
 * Live limitations (offline renderer only, for now): track-gain
 * envelope bindings and sidechain ducking are not applied.
 */
import type { Graph, TrackContext } from "../core/types.ts";
import type { SampleBank } from "../core/audio_types.ts";
import { solve, type SolveResult } from "../core/solver.ts";
import { lookup } from "../core/graph.ts";
import { findInstrument } from "../instruments/registry.ts";
import { LivePlayer, type LivePlayerOptions } from "./player.ts";
import { LiveTransport, type TransportNote } from "./transport.ts";

export interface LiveSetOptions extends LivePlayerOptions {
  loop?: boolean;
  lookaheadSec?: number;
  /** Override the graph's tempo. */
  bpm?: number;
  samples?: SampleBank;
}

export interface LiveSet {
  player: LivePlayer;
  transport: LiveTransport;
  result: SolveResult;
}

export function createLiveSet(ctx: any, g: Graph, opts: LiveSetOptions = {}): LiveSet {
  const transportCtx = lookup<any>(g, g.transport);
  const tempo = lookup<any>(g, transportCtx.tempo);
  const meter = lookup<any>(g, transportCtx.meter);
  const bpm: number = opts.bpm ?? tempo.bpm;

  const result = solve(g);

  const player = new LivePlayer(ctx, {
    samples: opts.samples,
    masterGain: opts.masterGain,
    noLimiter: opts.noLimiter,
  });

  // One bus per graph track. Track ids key the events; names label buses.
  const trackNameById = new Map<string, string>();
  for (const n of g.nodes.values()) {
    if (n.kind !== "context" || (n as any).type !== "track") continue;
    const track = n as TrackContext;
    if (track.isPercussion) {
      player.addDrumTrack(track.name);
      trackNameById.set(track.id, track.name);
    } else if (track.instrument) {
      const inst = findInstrument(g, track.instrument);
      if (!inst) throw new Error(`Track "${track.name}": instrument ${track.instrument} not found in graph`);
      player.addTrack(track.name, inst);
      trackNameById.set(track.id, track.name);
    } else {
      console.warn(`  Track "${track.name}": no instrument — events skipped in live set.`);
    }
  }

  const notes: TransportNote[] = [];
  for (const ev of result.events) {
    if (ev.pitch === undefined) continue;
    const trackName = trackNameById.get(ev.track);
    if (!trackName) continue;
    notes.push({
      track: trackName,
      midi: ev.pitch,
      velocity: (ev.velocity ?? 96) / 127,
      startBeat: ev.positionBeats,
      durBeats: ev.durationBeats,
    });
  }

  // Round the loop up to whole bars so looping feels musical.
  const beatsPerBar: number = meter?.beatsPerBar ?? 4;
  const lastEnd = notes.reduce((m, n) => Math.max(m, n.startBeat + n.durBeats), 0);
  const loopBeats = Math.max(beatsPerBar, Math.ceil(lastEnd / beatsPerBar) * beatsPerBar);

  const transport = new LiveTransport(player, notes, {
    bpm,
    loop: opts.loop,
    loopBeats,
    lookaheadSec: opts.lookaheadSec,
  });

  return { player, transport, result };
}
