/**
 * Minimal demo of the new noteEnvelope primitive.
 *
 * Plays three notes:
 *   1. A normal held note (no envelope) — flat amplitude, instrument's ADSR
 *   2. A swelling held note (noteEnvelope: "swell") — rises and falls
 *   3. A fade-in note (noteEnvelope: "fade_in") — starts at 0, grows
 *
 * Each note is 8 beats. The differences should be clearly audible.
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import { defineFeltSynth } from "../instruments/library.ts";

export function buildSwellTest() {
  const b = new GraphBuilder();
  b.transport(b.tempo(60), b.meter(4, 4));   // very slow so the shape is audible

  const key = b.key(pcFromName("C"), "major");
  const inst = defineFeltSynth(b);
  const leadTrack = b.track("lead", 5, { instrument: inst });

  // Three 8-beat spans
  const spans = b.progression({
    inKey: key, pattern: "I*3", startBeats: 0, beatsPerStep: 8,
  });

  // Note 1: flat held note (control)
  b.placeNote({
    underHarmonicSpan: spans[0], track: leadTrack, register: 5,
    degree: 0, durBeats: 7.5, velocity: 80,
  });

  // Note 2: swelling held note
  const swellId = b.placeNote({
    underHarmonicSpan: spans[1], track: leadTrack, register: 5,
    degree: 0, durBeats: 7.5, velocity: 80,
  });
  b.noteEnvelope({ instance: swellId, shape: "swell" });

  // Note 3: fade-in held note
  const fadeId = b.placeNote({
    underHarmonicSpan: spans[2], track: leadTrack, register: 5,
    degree: 0, durBeats: 7.5, velocity: 80,
  });
  b.noteEnvelope({ instance: fadeId, shape: "fade_in" });

  return { graph: b.graph };
}
