/**
 * Render solved events to a Standard MIDI File.
 * Uses midi-writer-js. One track per Loophaus track context.
 */
import MidiWriter from "midi-writer-js";
import type { Graph } from "../core/types.ts";
import type { SolveResult } from "../core/solver.ts";
import { lookup } from "../core/graph.ts";

export function renderMidi(g: Graph, result: SolveResult, outputPath: string) {
  // Group events by track
  const byTrack = new Map<string, typeof result.events>();
  for (const ev of result.events) {
    if (!byTrack.has(ev.track)) byTrack.set(ev.track, []);
    byTrack.get(ev.track)!.push(ev);
  }

  const transport = lookup<any>(g, g.transport);
  const tempo = lookup<any>(g, transport.tempo);
  const meter = lookup<any>(g, transport.meter);

  const writerTracks: any[] = [];
  for (const [trackId, evs] of byTrack) {
    const trackCtx = lookup<any>(g, trackId);
    const track = new MidiWriter.Track();
    track.setTempo(tempo.bpm);
    track.setTimeSignature(meter.beatsPerBar, meter.beatUnit);
    track.addEvent(new MidiWriter.ProgramChangeEvent({
      instrument: trackCtx.program ?? 1,
      channel: (trackCtx.midiChannel ?? 1) as 1,
    } as any));

    // Sort events
    evs.sort((a, b) => a.positionBeats - b.positionBeats);

    // midi-writer-js uses ticks; default resolution is 128 ticks per quarter
    const TICKS_PER_BEAT = 128;
    for (const ev of evs) {
      if (ev.pitch === undefined) continue; // skip pitchless drum stubs for now in MIDI rendering
      const startTick = Math.round(ev.positionBeats * TICKS_PER_BEAT);
      const durTick = Math.max(1, Math.round(ev.durationBeats * TICKS_PER_BEAT));
      track.addEvent(new MidiWriter.NoteEvent({
        pitch: [midiToPitchName(ev.pitch)],
        startTick,
        duration: `T${durTick}`,
        velocity: ev.velocity ?? 90,
        channel: (trackCtx.midiChannel ?? 1) as 1,
      }));
    }
    writerTracks.push(track);
  }

  const writer = new MidiWriter.Writer(writerTracks);
  const buffer = Buffer.from(writer.buildFile());

  // Write to disk
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  fs.writeFileSync(outputPath, buffer);
}

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToPitchName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${PITCH_NAMES[pc]}${oct}`;
}
