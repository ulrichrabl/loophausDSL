/**
 * "Polymorph" — 24 bars, F# as tonic throughout. Mode shifts:
 *   Section A (bars 1-8):   F# natural minor — sad
 *   Section B (bars 9-16):  F# Dorian        — brighter (raises the 6th, b6→6)
 *   Section C (bars 17-24): F# natural minor — return home, now with weight
 *
 * The same melodic motif plays in all three sections. The framework
 * reinterprets it under each mode/chord — that's the parametric power.
 *
 * Showcases:
 *   - b.progression() mini-notation for harmony
 *   - b.placeNote() for inline one-off notes
 *   - b.rhythmMini with accents (X vs x)
 *   - Swing groove on the transport
 *   - Multi-key piece (mode shifts via different KeyContexts on same tonic)
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";

export function buildPolymorph() {
  const b = new GraphBuilder();

  // 92 BPM, gentle swing for groove
  b.transport(b.tempo(92), b.meter(4, 4), { swing: 0.35 });

  // TWO key contexts, same tonic, different mode
  const keyMinor  = b.key(pcFromName("F#"), "natural_minor");  // F# G# A B C# D E
  const keyDorian = b.key(pcFromName("F#"), "dorian");         // F# G# A B C# D# E
  // Difference: D vs D# (the 6th degree). Dorian's raised 6th gives the major IV.

  // Tracks
  const drumTrack = b.track("drums", 10, { program: 26, isPercussion: true });
  const bassTrack = b.track("bass",  2,  { program: 38 });
  const stabTrack = b.track("stab",  3,  { program: 8  });
  const padTrack  = b.track("pad",   4,  { program: 91 });
  const leadTrack = b.track("lead",  5,  { program: 82 });

  // ============= PROGRESSIONS (mini-notation!) =============
  // Section A: F# minor vamp — i bVI bIII bVII (Fm Dm Am Em? no — F#m D A E)
  //   Three chords per bar nope — one chord per bar.
  //   Pattern: i bVII bVI bVII | i bVII bVI bVII   (8 bars)
  const spansA = b.progression({
    inKey: keyMinor,
    pattern: "i VII VI VII i VII VI VII",
    startBeats: 0,
  });

  // Section B: F# Dorian — the SAME tonic-bVII-bVI-bVII shape, but in Dorian.
  //   The bVI here is B major (vs Dm in minor); that's the brightness shift.
  //   Wait: in F# Dorian, degree VI is D# (major in Dorian). Let me use IV instead
  //   to feature the major IV that defines Dorian.
  //   Progression: i IV i IV i IV bVII i  (8 bars)
  //   But we want the lift, so:
  const spansB = b.progression({
    inKey: keyDorian,
    pattern: "i IV i IV i IV VII i",
    startBeats: 32,
  });

  // Section C: back to F# minor — but with the V from harmonic minor for tension
  //   Progression: i bVI bVII V/HM i bVI bVII i — we'll fake the V via using the natural v
  //   (capital V doesn't exist in natural minor; v is minor)
  //   Actually let's do: i VI bVII v i VI bVII i  (8 bars)
  const spansC = b.progression({
    inKey: keyMinor,
    pattern: "i VI VII v i VI VII i",
    startBeats: 64,
  });

  const allSpans = [...spansA, ...spansB, ...spansC];

  // ============= DRUMS =============
  // Section A: just kick + sparse hat (sparse mood)
  // Section B: full drum groove
  // Section C: drums drop out at the start, gradual return for climax

  // Kick 4-on-the-floor: bars 5-24 (entering on bar 5, not from the start)
  const kickPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X x x x", 4),  // accent on beat 1
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: kickPat, underSpans: allSpans.slice(4, 16), track: drumTrack, register: 2, velocity: 105 });
  // Bars 17-19: drums drop out (breakdown). Bars 20-24: drums return.
  b.placeRange({ pattern: kickPat, underSpans: allSpans.slice(19), track: drumTrack, register: 2, velocity: 108 });

  // Closed hat: sparse in A (just on offbeats), full in B (all 8ths)
  const hatSparse = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini(". x . x . x . x", 4),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: hatSparse, underSpans: allSpans.slice(2, 8), track: drumTrack, register: 2, velocity: 55 });

  const hatFull = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x X x X x X x X", 4),  // backbeat accent on the &
    notes: Array(8).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: hatFull, underSpans: allSpans.slice(8, 16), track: drumTrack, register: 2, velocity: 58 });
  b.placeRange({ pattern: hatFull, underSpans: allSpans.slice(19), track: drumTrack, register: 2, velocity: 62 });

  // Snare on 2 and 4 in section B and late section C
  const snarePat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini(". x . x", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 2 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: snarePat, underSpans: allSpans.slice(8, 16), track: drumTrack, register: 2, velocity: 95 });
  b.placeRange({ pattern: snarePat, underSpans: allSpans.slice(20), track: drumTrack, register: 2, velocity: 100 });

  // ============= BASS =============
  // A: drone on root, half notes (sparse, brooding)
  const bassA = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X . . . X . . .", 4),
    notes: [{ kind: "chord_tone", value: 0 }, { kind: "chord_tone", value: 0 }],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassA, underSpans: spansA, track: bassTrack, register: 2, velocity: 90 });

  // B: octave-jump groove (the lift)
  const bassB = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X . x . X . x .", 4),
    notes: [
      { kind: "chord_tone",         value: 0 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "chord_tone",         value: 0 },
      { kind: "interval_from_prev", value: 12 },
    ],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassB, underSpans: spansB, track: bassTrack, register: 2, velocity: 100 });

  // C: walking-style with rests for breath
  const bassC = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X . . x x . X .", 4),
    notes: [
      { kind: "chord_tone",         value: 0 },
      { kind: "chord_tone",         value: 2 },     // 5th
      { kind: "interval_from_prev", value: -7 },    // back down
      { kind: "chord_tone",         value: 0 },     // root
    ],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassC, underSpans: spansC, track: bassTrack, register: 2, velocity: 95 });

  // ============= PAD (whole piece — the harmonic glue) =============
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
  const padInsts = b.placeRange({ pattern: padPat, underSpans: allSpans, track: padTrack, velocity: 45 });
  b.smoothVoiceLeading(padInsts);
  for (const inst of padInsts) b.registerRange(inst, 57, 79);

  // Long filter sweep: opens through section A→B, closes in section C breakdown, opens again for climax
  const sweep1 = b.envelope({
    parameter: "filter.cutoff",
    startBeats: 0, endBeats: 64,        // bars 1-16 (A and B)
    from: 280, to: 3500, curve: "exp",
  });
  b.bindEnvelope({ envelope: sweep1, targetEntity: padTrack, targetParameter: "filter.cutoff" });

  // ============= STAB — only in section B (the bright reveal) =============
  const stabPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0.375, dur: 0.1 }, { at: 0.375, dur: 0.1 }, { at: 0.375, dur: 0.1 },
      { at: 0.875, dur: 0.1 }, { at: 0.875, dur: 0.1 }, { at: 0.875, dur: 0.1 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 }, { kind: "chord_tone", value: 1 }, { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 0 }, { kind: "chord_tone", value: 1 }, { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 4,
  });
  const stabInsts = b.placeRange({ pattern: stabPat, underSpans: spansB, track: stabTrack, velocity: 80 });
  b.smoothVoiceLeading(stabInsts);
  for (const inst of stabInsts) b.registerRange(inst, 57, 76);

  // ============= LEAD: THE THEME =============
  // The motif: scale degrees 0, 2, 4, 3, 2 → F#, A, C#, B, A
  // (root, 3rd, 5th, 4th, 3rd — up the triad, then resolve down through the 4th)
  // Rhythm: long-long-short-short-long — vocal-like
  //
  // This phrase appears in EACH section. In F# minor it's plaintive.
  // In F# Dorian (section B), the same scale degrees produce a slightly
  // brighter color because the parent scale's 6th is different (we hear it
  // through the harmonic context: the chord changes are warmer).

  const themePhrase = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.25, velMul: 1.2 },   // accent on the first note
      { at: 0.25,  dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,   dur: 0.25 },
      { at: 0.75,  dur: 0.25 },
    ],
    notes: [
      { kind: "scale_degree", value: 0 },    // F# (tonic)
      { kind: "scale_degree", value: 2 },    // A (b3 in minor, b3 in Dorian — same!)
      { kind: "scale_degree", value: 4 },    // C# (5th)
      { kind: "scale_degree", value: 3 },    // B (4th — passing tone)
      { kind: "scale_degree", value: 2 },    // A (resolution to 3rd)
    ],
    defaultRegister: 5,
  });

  // Section A: theme on bar 1 and bar 5 (sparse, lonely)
  b.placeUnder({ pattern: themePhrase, underHarmonicSpan: spansA[0], track: leadTrack, register: 5, velocity: 90 });
  b.placeUnder({ pattern: themePhrase, underHarmonicSpan: spansA[4], track: leadTrack, register: 5, velocity: 92 });

  // Section B: theme every other bar — feels more present
  b.placeUnder({ pattern: themePhrase, underHarmonicSpan: spansB[0], track: leadTrack, register: 5, velocity: 100 });
  b.placeUnder({ pattern: themePhrase, underHarmonicSpan: spansB[2], track: leadTrack, register: 5, velocity: 102 });
  b.placeUnder({ pattern: themePhrase, underHarmonicSpan: spansB[4], track: leadTrack, register: 5, velocity: 104 });
  b.placeUnder({ pattern: themePhrase, underHarmonicSpan: spansB[6], track: leadTrack, register: 5, velocity: 105 });

  // Section C: theme returns at climax (bar 21), then inverted at bar 23 (descent), held tonic at bar 24
  b.placeUnder({ pattern: themePhrase, underHarmonicSpan: spansC[4], track: leadTrack, register: 5, velocity: 110 });

  // Inverted theme on bar 7 of section C (bar 23 overall)
  const themeInverted = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.25, velMul: 1.2 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,   dur: 0.25 },
      { at: 0.75,  dur: 0.25 },
    ],
    notes: [
      { kind: "scale_degree", value: 0 },
      { kind: "scale_degree", value: 2 },
      { kind: "scale_degree", value: 4 },
      { kind: "scale_degree", value: 3 },
      { kind: "scale_degree", value: 2 },
    ],
    defaultRegister: 5,
    transform: "invert",
  });
  b.placeUnder({ pattern: themeInverted, underHarmonicSpan: spansC[6], track: leadTrack, register: 5, velocity: 108 });

  // Final: held tonic at the end (placeNote — one-liner!)
  b.placeNote({
    underHarmonicSpan: spansC[7],
    track: leadTrack,
    register: 5,
    durBeats: 3.5,
    velocity: 95,
    degree: 0,                 // tonic, held
  });

  return { graph: b.graph };
}
