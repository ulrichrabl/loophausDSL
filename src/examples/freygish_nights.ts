/**
 * "Freygish Nights" — a 16-bar piece in D Phrygian Dominant.
 *
 * D Phrygian Dominant: D Eb F# G A Bb C — the "Spanish/freygish" sound.
 * Its signature is the b2 (Eb) sitting a half-step above tonic (D), creating
 * a tension you can't get in major/minor. The bII chord (Eb major) is iconic.
 *
 * Showcases new framework features:
 *   - phrygian_dominant mode
 *   - b.rhythmMini("x . x .", unit) mini-notation
 *   - b.placeRange({ pattern, underSpans, ... }) instead of for-loops
 *   - Real filter envelope binding (no longer hardcoded in renderer)
 *
 * Restraint principles:
 *   - Sparse arrangement bars 1-8 (drone bass + sparse hat). Let space exist.
 *   - The Eb chord arrives in bar 5 as a deliberate harmonic event, not buried.
 *   - Lead enters bar 9. Long phrases. Silence between them.
 *   - Andalusian descending cadence (i - bVII - bVI - V) in bars 11-12 — classic move.
 *   - Big filter sweep across the second half builds energy without adding notes.
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import type { ScaleDegree } from "../core/types.ts";

export function buildFreygishNights() {
  const b = new GraphBuilder();

  // ---- transport ----
  b.transport(b.tempo(102), b.meter(4, 4));  // slower than the disco track — gives space

  // ---- key: D Phrygian Dominant ----
  const key = b.key(pcFromName("D"), "phrygian_dominant");

  // ---- tracks ----
  const drumTrack = b.track("drums", 10, { program: 26, isPercussion: true });
  const bassTrack = b.track("bass",  2,  { program: 38 });
  const stabTrack = b.track("stab",  3,  { program: 8  });
  const padTrack  = b.track("pad",   4,  { program: 91 });
  const leadTrack = b.track("lead",  5,  { program: 82 });

  // ---- progression ----
  // Bars  1-4 : i (drone, set the mood)
  // Bars  5-6 : bII (the surprise — Phrygian dominant's signature)
  // Bars  7-8 : i (back home, but now we know there's something coming)
  // Bars  9-10: i (lead enters)
  // Bars 11   : bVII (Andalusian descent begins)
  // Bars 12   : bVI
  // Bars 13   : V (tension)
  // Bars 14   : V (held)
  // Bars 15   : bII (the bII returns — harmonic climax)
  // Bars 16   : i (resolution)
  const progression: ScaleDegree[] = [
    "i", "i", "i", "i",          // 1-4
    "II", "II", "i", "i",        // 5-8  (II = bII major in this mode)
    "i", "i",                    // 9-10
    "VII", "VI",                 // 11-12
    "V", "V",                    // 13-14 (V is diminished in Phrygian dominant; we use it minor for tension)
    "II", "i",                   // 15-16
  ];
  const spans = progression.map((deg, bar) =>
    b.harmonicSpan({
      inKey: key, degree: deg,
      startBeats: bar * 4, endBeats: (bar + 1) * 4,
    })
  );

  // ============= DRUMS =============
  // Kick: 4-on-the-floor from bar 3 (let the first 2 bars be just bass drone)
  const kickPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x x x x", 4),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: kickPat, underSpans: spans.slice(2), track: drumTrack, register: 2, velocity: 112 });

  // Closed hi-hat: sparse — only on 8th-offbeats — from bar 5
  // "x" pattern shifted to land on the "&"s: ". x . x . x . x" (in 8 sixteenths per beat? let's do 8 eighths in a bar)
  const hatPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini(". x . x . x . x", 4),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: hatPat, underSpans: spans.slice(4), track: drumTrack, register: 2, velocity: 60 });

  // Snare on 2 and 4, from bar 7
  const snarePat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini(". x . x", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 2 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: snarePat, underSpans: spans.slice(6), track: drumTrack, register: 2, velocity: 95 });

  // Clap fill on bar 14 (build tension)
  const clapFill = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini(". . . . . . x x", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 3 }),
    defaultRegister: 2,
  });
  b.placeUnder({ pattern: clapFill, underHarmonicSpan: spans[13], track: drumTrack, register: 2, velocity: 100 });

  // ============= BASS =============
  // The bass is the foundation. Drone-y in section A, more active in section B.
  // Bars 1-8: simple root pulse — root on beat 1, root on beat 3 (half notes)
  const bassDrone = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x . x .", 4),
    notes: [{ kind: "chord_tone", value: 0 }, { kind: "chord_tone", value: 0 }],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassDrone, underSpans: spans.slice(0, 8), track: bassTrack, register: 2, velocity: 95 });

  // Bars 9-16: more rhythmic — root pulses with octave jumps and a 5th
  const bassActive = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x x . x x . x x", 4),
    notes: [
      { kind: "chord_tone",         value: 0 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "interval_from_prev", value: -12 },
      { kind: "chord_tone",         value: 2 },     // 5th
      { kind: "interval_from_prev", value: -7 },    // back to root
      { kind: "interval_from_prev", value: 12 },
    ],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassActive, underSpans: spans.slice(8), track: bassTrack, register: 2, velocity: 100 });

  // ============= PAD =============
  // Enters on bar 5 (when the bII arrives) — gives the chord change weight.
  const padPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0, dur: 1 }, { at: 0, dur: 1 }, { at: 0, dur: 1 }],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 4,
  });
  const padInsts = b.placeRange({
    pattern: padPat, underSpans: spans.slice(4), track: padTrack, velocity: 55,
  });
  b.smoothVoiceLeading(padInsts);
  for (const inst of padInsts) b.registerRange(inst, 57, 79); // A3 to G5

  // ============= FILTER SWEEP =============
  // Real envelope binding — opens the pad filter slowly across bars 5-16.
  // This is what makes the second half feel "bigger" without adding notes.
  const sweep = b.envelope({
    parameter: "filter.cutoff",
    startBeats: 4 * 4,          // bar 5
    endBeats: 16 * 4,           // through bar 16
    from: 350,
    to: 4500,
    curve: "exp",
  });
  b.bindEnvelope({ envelope: sweep, targetEntity: padTrack, targetParameter: "filter.cutoff" });

  // ============= STAB =============
  // Sparse clavinet stab — only on the "&" of 2 in bars 9-16. Just one accent per bar.
  // (This is the restraint: the stab speaks because it's not constantly hitting.)
  const stabPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0.375, dur: 0.12 },
      { at: 0.375, dur: 0.12 },
      { at: 0.375, dur: 0.12 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 4,
  });
  const stabInsts = b.placeRange({
    pattern: stabPat, underSpans: spans.slice(8), track: stabTrack, velocity: 85,
  });
  b.smoothVoiceLeading(stabInsts);
  for (const inst of stabInsts) b.registerRange(inst, 55, 76);

  // ============= LEAD =============
  // The signature melody. Uses scale_degree so it locks to the parent mode
  // and lets the b2-3 tension of Phrygian Dominant speak.
  //
  // Scale degree map for D Phrygian Dominant:
  //   0=D  1=Eb  2=F#  3=G  4=A  5=Bb  6=C
  //
  // Phrase A (call): D - Eb - D ... F# (the signature b2-to-3 move)
  // Then silence (which the framework supports by simply not placing a pattern!)
  // Phrase B (response): F# - G - A - F# (gracefully descends from the 3rd)
  // Phrase C (climax): ascending run up to the high D

  // Bar 9: phrase A — emphasizes the b2 (Eb against the i = D chord = D F# A)
  // The Eb is the dissonance. The motif sets it up and resolves to F# (chord tone).
  const phraseA = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x . x . x . x .", 4),  // half-bar of eighths, half of rest
    notes: [
      { kind: "scale_degree", value: 0 },   // D
      { kind: "scale_degree", value: 1 },   // Eb (the signature!)
      { kind: "scale_degree", value: 0 },   // D
      { kind: "scale_degree", value: 2 },   // F#
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: spans[8], track: leadTrack, register: 5, velocity: 100 });

  // Bar 10: silence — let the phrase settle. (Just don't place anything.)

  // Bar 11 (bVII): phrase B — descending response over the bVII (C major)
  const phraseB = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x . x . x . . .", 4),
    notes: [
      { kind: "scale_degree", value: 4 },   // A
      { kind: "scale_degree", value: 3 },   // G
      { kind: "scale_degree", value: 2 },   // F#
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: spans[10], track: leadTrack, register: 5, velocity: 102 });

  // Bar 12 (bVI): continued descent
  const phraseBcont = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x . x . x . . .", 4),
    notes: [
      { kind: "scale_degree", value: 2 },   // F#
      { kind: "scale_degree", value: 1 },   // Eb
      { kind: "scale_degree", value: 0 },   // D — landing
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: phraseBcont, underHarmonicSpan: spans[11], track: leadTrack, register: 5, velocity: 100 });

  // Bar 13-14 (V): silence over the V — let the harmony do the talking, let tension build

  // Bar 15 (bII climax): a single high held note — the b2 in the high register
  const climaxNote = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0, dur: 0.9 }],
    notes: [{ kind: "scale_degree", value: 1 }],  // Eb high
    defaultRegister: 6,
  });
  b.placeUnder({ pattern: climaxNote, underHarmonicSpan: spans[14], track: leadTrack, register: 6, velocity: 110 });

  // Bar 16 (i resolution): descending to tonic
  const finalPhrase = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x x x x . . . .", 4),
    notes: [
      { kind: "scale_degree", value: 2 },   // F#
      { kind: "scale_degree", value: 1 },   // Eb
      { kind: "scale_degree", value: 0 },   // D
      { kind: "scale_degree", value: 0 },   // D held
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: finalPhrase, underHarmonicSpan: spans[15], track: leadTrack, register: 5, velocity: 95 });

  return { graph: b.graph };
}
