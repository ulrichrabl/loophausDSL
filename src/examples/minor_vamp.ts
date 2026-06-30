/**
 * Example 1: Minor vamp study.
 *
 * 8 bars, C minor, progression i-VI-III-VII (2 bars each).
 * A motif (1-3-5-3, quarter notes) plays under each chord.
 * Bars 7-8: motif inverted.
 * Bass plays roots in low register.
 *
 * This tests:
 *   - Harmonic spans driving melodic pitch selection
 *   - The same motif producing different actual notes under different chords
 *   - Pattern transformation (invert)
 *   - Multi-track output
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";

export function buildMinorVamp() {
  const b = new GraphBuilder();

  // Transport
  const tempo = b.tempo(95);
  const meter = b.meter(4, 4);
  b.transport(tempo, meter);

  // Key: C natural minor
  const key = b.key(pcFromName("C"), "natural_minor");

  // Tracks
  const keysTrack = b.track("keys", 1, { program: 5 });     // electric piano
  const bassTrack = b.track("bass", 2, { program: 33 });    // finger bass
  const leadTrack = b.track("lead", 3, { program: 81 });    // square lead

  // Progression: i (Cm), VI (Ab), III (Eb), VII (Bb) — 2 bars each
  const h1 = b.harmonicSpan({ inKey: key, degree: "i",   startBeats: 0,  endBeats: 8  });
  const h2 = b.harmonicSpan({ inKey: key, degree: "VI",  startBeats: 8,  endBeats: 16 });
  const h3 = b.harmonicSpan({ inKey: key, degree: "III", startBeats: 16, endBeats: 24 });
  const h4 = b.harmonicSpan({ inKey: key, degree: "VII", startBeats: 24, endBeats: 32 });

  // Motif: chord_tone 0, 1, 2, 1. Rhythm is now: dotted-quarter, eighth, quarter, half
  // — gives the motif a more vocal contour than four equal quarters.
  const motif = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.375 },   // dotted quarter
      { at: 0.375, dur: 0.125 },   // eighth
      { at: 0.5,   dur: 0.25 },    // quarter
      { at: 0.75,  dur: 0.25 },    // quarter (rest of bar)
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 1 },
    ],
    defaultRegister: 5,
  });

  // Inverted motif: same rhythm, transform applied to contour
  const motifInv = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.375 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,   dur: 0.25 },
      { at: 0.75,  dur: 0.25 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 1 },
    ],
    defaultRegister: 5,
    transform: "invert",
  });

  // Place the motif under each span; last two use the inverted version
  b.placeUnder({ pattern: motif,    underHarmonicSpan: h1, track: leadTrack });
  b.placeUnder({ pattern: motif,    underHarmonicSpan: h2, track: leadTrack });
  b.placeUnder({ pattern: motif,    underHarmonicSpan: h3, track: leadTrack });
  b.placeUnder({ pattern: motifInv, underHarmonicSpan: h4, track: leadTrack });

  // Bass: root-fifth pulse, quarter notes
  const bassPulse = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,    dur: 0.25 },
      { at: 0.25, dur: 0.25 },
      { at: 0.5,  dur: 0.25 },
      { at: 0.75, dur: 0.25 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },  // root
      { kind: "chord_tone", value: 2 },  // fifth
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 2,
  });

  b.placeUnder({ pattern: bassPulse, underHarmonicSpan: h1, track: bassTrack, register: 2 });
  b.placeUnder({ pattern: bassPulse, underHarmonicSpan: h2, track: bassTrack, register: 2 });
  b.placeUnder({ pattern: bassPulse, underHarmonicSpan: h3, track: bassTrack, register: 2 });
  b.placeUnder({ pattern: bassPulse, underHarmonicSpan: h4, track: bassTrack, register: 2 });

  // Keys: triad voicing for each chord, half-notes
  const triad = b.melodicPattern({
    unitBeats: 8,
    // 3 simultaneous notes per chord — use 3 onsets all at position 0 ("a chord")
    ownRhythm: [
      { at: 0, dur: 1 },
      { at: 0, dur: 1 },
      { at: 0, dur: 1 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 4,
  });

  const keysInsts = [
    b.placeUnder({ pattern: triad, underHarmonicSpan: h1, track: keysTrack, register: 4 }),
    b.placeUnder({ pattern: triad, underHarmonicSpan: h2, track: keysTrack, register: 4 }),
    b.placeUnder({ pattern: triad, underHarmonicSpan: h3, track: keysTrack, register: 4 }),
    b.placeUnder({ pattern: triad, underHarmonicSpan: h4, track: keysTrack, register: 4 }),
  ];

  // Apply smooth voice leading across the four chord voicings — the constraint!
  b.smoothVoiceLeading(keysInsts);
  // And cap each voicing into a register band so it can't drift off the keyboard.
  for (const inst of keysInsts) {
    b.registerRange(inst, 55, 79); // G3 to G5
  }

  return { graph: b.graph };
}
