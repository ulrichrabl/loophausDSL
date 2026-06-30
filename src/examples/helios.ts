/**
 * "Helios" — E minor, 122 BPM, ~3:00.
 *
 * Riff-built piece. The aim: write something with a melodic IDEA worth
 * remembering, then develop it, transform it, leave it, return to it changed.
 * Not template EDM (kick + bass + stab + lead, repeat).
 *
 * THE RIFF (4 bars, played by bass + lead in unison — Aerodynamic-style):
 *   bar 1: B (long) → A G F# E (16ths) → E (held)
 *   bar 2: G (long) → F# E D (16ths)   → D (held)
 *   bar 3: D HIGH (octave up) → C B A → G (held)         [the lift]
 *   bar 4: A (long) → G F# E (16ths)   → E (final tonic)
 *
 * Each bar has the same SHAPE — long note, 16th descent, landing held —
 * so the listener recognizes "this is the riff" each time. The pitches
 * shift to give the riff an overall descending contour with an octave
 * lift in bar 3 (the high point).
 *
 * FORM (asymmetric, surprises baked in):
 *   1-12   setup        bell + pad, no drums, no riff. Last 4 bars: bell HINTS riff
 *  13-28   riff drop    BIG. Bass+lead unison. Drums in. (4 cycles)
 *  29-36   variations   drums build across each cycle. Stab adds.
 *  37-44   filtered     filter closes, drums simplify. ANTICIPATION through ABSENCE
 *  45-56   release      filter swoops open, riff at full energy (3 cycles)
 *  57-72   contrast     E HARMONIC MINOR — riff GONE. Bass pedal. Shred lead.
 *  73-84   transformed  riff back, octave-doubled lead (3 cycles)
 *  85-92   outro        riff bookends only (bar 1 + bar 4), fading
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import {
  defineWobbleBass, defineSupersawLead, defineBrokenSignalLead,
  defineWarmPad, defineClavinetStab, defineFeltSynth,
} from "../instruments/library.ts";

export function buildHelios() {
  const b = new GraphBuilder();
  b.transport(b.tempo(122), b.meter(4, 4), { swing: 0 });

  const eMinor   = b.key(pcFromName("E"), "natural_minor");
  const eHarmMin = b.key(pcFromName("E"), "harmonic_minor");

  // Instruments
  const bassSynth  = defineWobbleBass(b);
  const stabSynth  = defineClavinetStab(b);
  const padSynth   = defineWarmPad(b);
  const riffSynth  = defineSupersawLead(b);
  const shredSynth = defineBrokenSignalLead(b);
  const bellSynth  = defineFeltSynth(b);

  // Tracks. Lead names route to lead bus (reverb).
  const drumTrack  = b.track("drums", 10, { program: 26, isPercussion: true });
  const bassTrack  = b.track("bass",  2, { instrument: bassSynth });
  const stabTrack  = b.track("stab",  3, { instrument: stabSynth });
  const padTrack   = b.track("pad",   4, { instrument: padSynth });
  const leadTrack  = b.track("lead",  5, { instrument: riffSynth });
  const shredTrack = b.track("lead2", 6, { instrument: shredSynth });
  const bellTrack  = b.track("lead3", 7, { instrument: bellSynth });

  // ============= THE RIFF =============
  // Four 4-beat patterns, one per bar of the riff.
  // Same rhythm shape, different pitches per bar.
  // Long note (1.5 beats) → 3 sixteenths → landing held to end.
  const RIFF_RHYTHM = [
    { at: 0.0,    dur: 0.375, velMul: 1.15 },   // long opening note
    { at: 0.375,  dur: 0.0625 },                // 16th 1
    { at: 0.4375, dur: 0.0625 },                // 16th 2
    { at: 0.5,    dur: 0.0625 },                // 16th 3
    { at: 0.5625, dur: 0.4375, velMul: 1.05 },  // landing note held
  ];

  const riffBar1 = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: RIFF_RHYTHM,
    notes: [
      { kind: "scale_degree", value: 4 },         // B
      { kind: "interval_from_prev", value: -2 },  // A
      { kind: "interval_from_prev", value: -2 },  // G
      { kind: "interval_from_prev", value: -1 },  // F#
      { kind: "interval_from_prev", value: -2 },  // E (landing)
    ],
    defaultRegister: 5,
  });

  const riffBar2 = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: RIFF_RHYTHM,
    notes: [
      { kind: "scale_degree", value: 2 },         // G
      { kind: "interval_from_prev", value: -1 },  // F#
      { kind: "interval_from_prev", value: -2 },  // E
      { kind: "interval_from_prev", value: -2 },  // D
      { kind: "interval_from_prev", value: 0 },   // D (held landing)
    ],
    defaultRegister: 5,
  });

  // Bar 3 jumps UP an octave — the lift point of the riff
  const riffBar3 = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: RIFF_RHYTHM,
    notes: [
      { kind: "scale_degree", value: 6 },         // D (high, register 6)
      { kind: "interval_from_prev", value: -2 },  // C
      { kind: "interval_from_prev", value: -1 },  // B
      { kind: "interval_from_prev", value: -2 },  // A
      { kind: "interval_from_prev", value: -2 },  // G (landing)
    ],
    defaultRegister: 6,
  });

  const riffBar4 = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: RIFF_RHYTHM,
    notes: [
      { kind: "scale_degree", value: 3 },         // A
      { kind: "interval_from_prev", value: -2 },  // G
      { kind: "interval_from_prev", value: -1 },  // F#
      { kind: "interval_from_prev", value: -2 },  // E
      { kind: "interval_from_prev", value: 0 },   // E (final tonic, held)
    ],
    defaultRegister: 5,
  });

  // ============= SECTION SPANS =============
  // One i (E minor) span per bar — the riff carries the harmony melodically.
  // (Section 6 uses harmonic minor.)
  const setup        = b.progression({ inKey: eMinor,   pattern: "i*12", startBeats: 0,   beatsPerStep: 4 });
  const riffDrop     = b.progression({ inKey: eMinor,   pattern: "i*16", startBeats: 48,  beatsPerStep: 4 });
  const variations   = b.progression({ inKey: eMinor,   pattern: "i*8",  startBeats: 112, beatsPerStep: 4 });
  const filtered     = b.progression({ inKey: eMinor,   pattern: "i*8",  startBeats: 144, beatsPerStep: 4 });
  const release      = b.progression({ inKey: eMinor,   pattern: "i*12", startBeats: 176, beatsPerStep: 4 });
  const contrast     = b.progression({ inKey: eHarmMin, pattern: "i*16", startBeats: 224, beatsPerStep: 4 });
  const transformed  = b.progression({ inKey: eMinor,   pattern: "i*12", startBeats: 288, beatsPerStep: 4 });
  const outro        = b.progression({ inKey: eMinor,   pattern: "i*8",  startBeats: 336, beatsPerStep: 4 });

  const allSpans = [...setup, ...riffDrop, ...variations, ...filtered, ...release, ...contrast, ...transformed, ...outro];

  // Helper to play one riff cycle (4 bars) on a track starting at a given span index
  const playRiff = (spans: any[], startIdx: number, track: any, velocity: number, registerOffset = 0) => {
    b.placeUnder({ pattern: riffBar1, underHarmonicSpan: spans[startIdx],     track, register: 5 + registerOffset, velocity });
    b.placeUnder({ pattern: riffBar2, underHarmonicSpan: spans[startIdx + 1], track, register: 5 + registerOffset, velocity });
    b.placeUnder({ pattern: riffBar3, underHarmonicSpan: spans[startIdx + 2], track, register: 6 + registerOffset, velocity });
    b.placeUnder({ pattern: riffBar4, underHarmonicSpan: spans[startIdx + 3], track, register: 5 + registerOffset, velocity });
  };

  // ============= SECTION 1: SETUP =============
  // Pad swells, bell plays sparse high notes, last 4 bars HINT at the riff.

  // Pad: held E throughout, slow filter open, gain swells
  const padNote = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0, dur: 1 }],
    notes: [{ kind: "scale_degree", value: 0 }],  // E pedal
    defaultRegister: 4,
  });
  b.placeRange({ pattern: padNote, underSpans: setup, track: padTrack, velocity: 60 });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 0, endBeats: 48, from: 0.05, to: 0.45, curve: "linear" }),
    targetEntity: padTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 0, endBeats: 48, from: 250, to: 3500, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });

  // Bell — bars 1-8: just B5 (the riff's opening note) once per bar, sparse
  const bellHint = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0.0, dur: 0.5 }],
    notes: [{ kind: "scale_degree", value: 4 }],  // B
    defaultRegister: 5,
  });
  for (let i = 0; i < 8; i++) {
    b.placeUnder({ pattern: bellHint, underHarmonicSpan: setup[i], track: bellTrack, register: 5, velocity: 55 });
  }

  // Bell — bars 9-12: HINT the riff. Plays bar 1 of riff softly (twice across these 4 bars)
  const bellRiffHint = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: RIFF_RHYTHM,
    notes: [
      { kind: "scale_degree", value: 4 },         // B
      { kind: "interval_from_prev", value: -2 },  // A
      { kind: "interval_from_prev", value: -2 },  // G
      { kind: "interval_from_prev", value: -1 },  // F#
      { kind: "interval_from_prev", value: -2 },  // E
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: bellRiffHint, underHarmonicSpan: setup[8],  track: bellTrack, register: 5, velocity: 60 });
  b.placeUnder({ pattern: bellRiffHint, underHarmonicSpan: setup[10], track: bellTrack, register: 5, velocity: 70 });

  // Pad continues through later sections
  b.placeRange({ pattern: padNote, underSpans: riffDrop,    track: padTrack, velocity: 55 });
  b.placeRange({ pattern: padNote, underSpans: variations,  track: padTrack, velocity: 55 });
  b.placeRange({ pattern: padNote, underSpans: filtered,    track: padTrack, velocity: 45 });
  b.placeRange({ pattern: padNote, underSpans: release,     track: padTrack, velocity: 60 });
  b.placeRange({ pattern: padNote, underSpans: transformed, track: padTrack, velocity: 60 });
  b.placeRange({ pattern: padNote, underSpans: outro,       track: padTrack, velocity: 50 });

  // Pad filter — closes during "filtered" section (anticipation through absence)
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 144, endBeats: 168, from: 3500, to: 600, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });
  // Filter sweeps back open at "release" section
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 168, endBeats: 184, from: 600, to: 4500, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });
  // Filter ramps DOWN through outro for the fade
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 336, endBeats: 368, from: 4500, to: 400, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });
  // Pad gain fades through outro
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 336, endBeats: 368, from: 0.50, to: 0.05, curve: "linear" }),
    targetEntity: padTrack, targetParameter: "gain",
  });

  // ============= SECTION 2: RIFF DROP =============
  // The big moment. Bass + lead in unison, drums in, crash.
  // 4 riff cycles.
  for (let cycle = 0; cycle < 4; cycle++) {
    playRiff(riffDrop, cycle * 4, leadTrack, 100);       // lead at register 5/6
    playRiff(riffDrop, cycle * 4, bassTrack, 110, -3);   // bass 3 octaves below (register 2/3)
  }

  // Drums — variation across each 4-bar cycle for freshness, not robotic
  // Bar 1: sparse — kick on 1+3 only, soft hat on offbeats
  // Bar 2: + ghost snare on 4-and
  // Bar 3: full backbeat — snare on 2,4, hat 8ths
  // Bar 4: open hat builds, snare drop on last beat for fill
  const kickHalfTime = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("X . x .", 4),
    notes: [{ kind: "fixed_pc" as const, value: 0 }, { kind: "fixed_pc" as const, value: 0 }],
    defaultRegister: 2,
  });
  const kickFull = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("X x x x", 4),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }),
    defaultRegister: 2,
  });
  const hatSoft = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini(". x . x", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  const hatBusy = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("x x x x x x x x", 4),
    notes: Array(8).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  const snareBackbeat = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini(". x . x", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 2 }),
    defaultRegister: 2,
  });
  const ghostSnare = b.melodicPattern({
    unitBeats: 4, ownRhythm: [{ at: 0.875, dur: 0.0625, velMul: 0.4 }],
    notes: [{ kind: "fixed_pc", value: 2 }],
    defaultRegister: 2,
  });
  const openHatFill = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini(". . . . . . . x", 4),
    notes: [{ kind: "fixed_pc", value: 10 }],
    defaultRegister: 2,
  });
  const crashHit = b.melodicPattern({
    unitBeats: 4, ownRhythm: [{ at: 0, dur: 1 }],
    notes: [{ kind: "fixed_pc", value: 1 }],
    defaultRegister: 3,
  });

  // Helper to place drum patterns across a riff cycle (4 bars), with VARIATION
  const placeDrumCycle = (spans: any[], startIdx: number, intensity: "light" | "full" | "minimal") => {
    if (intensity === "minimal") {
      // Filtered section — drums simplified, just kick on 1+3 of every bar
      for (let i = 0; i < 4; i++) {
        b.placeUnder({ pattern: kickHalfTime, underHarmonicSpan: spans[startIdx + i], track: drumTrack, register: 2, velocity: 105 });
      }
      return;
    }
    if (intensity === "light") {
      // Riff drop / variations — drums build across the 4 bars
      // Bar 1: sparse
      b.placeUnder({ pattern: kickHalfTime, underHarmonicSpan: spans[startIdx], track: drumTrack, register: 2, velocity: 110 });
      b.placeUnder({ pattern: hatSoft,      underHarmonicSpan: spans[startIdx], track: drumTrack, register: 2, velocity: 50 });
      // Bar 2: + ghost snare
      b.placeUnder({ pattern: kickFull,      underHarmonicSpan: spans[startIdx + 1], track: drumTrack, register: 2, velocity: 110 });
      b.placeUnder({ pattern: hatSoft,       underHarmonicSpan: spans[startIdx + 1], track: drumTrack, register: 2, velocity: 60 });
      b.placeUnder({ pattern: ghostSnare,    underHarmonicSpan: spans[startIdx + 1], track: drumTrack, register: 2, velocity: 70 });
      // Bar 3: full backbeat
      b.placeUnder({ pattern: kickFull,       underHarmonicSpan: spans[startIdx + 2], track: drumTrack, register: 2, velocity: 115 });
      b.placeUnder({ pattern: hatBusy,        underHarmonicSpan: spans[startIdx + 2], track: drumTrack, register: 2, velocity: 65 });
      b.placeUnder({ pattern: snareBackbeat,  underHarmonicSpan: spans[startIdx + 2], track: drumTrack, register: 2, velocity: 100 });
      // Bar 4: + open hat fill
      b.placeUnder({ pattern: kickFull,       underHarmonicSpan: spans[startIdx + 3], track: drumTrack, register: 2, velocity: 115 });
      b.placeUnder({ pattern: hatBusy,        underHarmonicSpan: spans[startIdx + 3], track: drumTrack, register: 2, velocity: 70 });
      b.placeUnder({ pattern: snareBackbeat,  underHarmonicSpan: spans[startIdx + 3], track: drumTrack, register: 2, velocity: 105 });
      b.placeUnder({ pattern: openHatFill,    underHarmonicSpan: spans[startIdx + 3], track: drumTrack, register: 2, velocity: 80 });
      return;
    }
    // "full" — maximum energy for release section
    for (let i = 0; i < 4; i++) {
      b.placeUnder({ pattern: kickFull,       underHarmonicSpan: spans[startIdx + i], track: drumTrack, register: 2, velocity: 120 });
      b.placeUnder({ pattern: hatBusy,        underHarmonicSpan: spans[startIdx + i], track: drumTrack, register: 2, velocity: 75 });
      b.placeUnder({ pattern: snareBackbeat,  underHarmonicSpan: spans[startIdx + i], track: drumTrack, register: 2, velocity: 110 });
    }
    // Open hat on bar 4 only
    b.placeUnder({ pattern: openHatFill, underHarmonicSpan: spans[startIdx + 3], track: drumTrack, register: 2, velocity: 90 });
  };

  // Crash on first beat of riff drop
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: riffDrop[0], track: drumTrack, register: 3, velocity: 120 });

  for (let cycle = 0; cycle < 4; cycle++) {
    placeDrumCycle(riffDrop, cycle * 4, "light");
  }

  // ============= SECTION 3: RIFF VARIATIONS =============
  // 2 more riff cycles, with stab added
  for (let cycle = 0; cycle < 2; cycle++) {
    playRiff(variations, cycle * 4, leadTrack, 102);
    playRiff(variations, cycle * 4, bassTrack, 112, -3);
    placeDrumCycle(variations, cycle * 4, "light");
  }
  // Stab adds offbeat color — every 2 bars
  const stabHit = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0.375, dur: 0.1 }, { at: 0.375, dur: 0.1 }, { at: 0.375, dur: 0.1 },
      { at: 0.875, dur: 0.1 }, { at: 0.875, dur: 0.1 }, { at: 0.875, dur: 0.1 },
    ],
    notes: [
      { kind: "scale_degree", value: 0 },     // E
      { kind: "scale_degree", value: 2 },     // G
      { kind: "scale_degree", value: 4 },     // B
      { kind: "scale_degree", value: 0 },
      { kind: "scale_degree", value: 2 },
      { kind: "scale_degree", value: 4 },
    ],
    defaultRegister: 4,
  });
  // Stab on bars 31, 33, 35 (the "and" of the riff structure)
  b.placeUnder({ pattern: stabHit, underHarmonicSpan: variations[2], track: stabTrack, register: 4, velocity: 85 });
  b.placeUnder({ pattern: stabHit, underHarmonicSpan: variations[6], track: stabTrack, register: 4, velocity: 90 });

  // ============= SECTION 4: FILTERED DOWN =============
  // Anticipation through ABSENCE. Drums simplified to just kick. Filter closes.
  // Bass + lead continue but heavily filtered (the lead/bass filter envelope already
  // handles this since they go through the track bus filter via instrument).
  // Actually the lead/bass don't have track filters — only pad does. So we need
  // another mechanism. We can use track GAIN envelopes to dim the lead+bass.
  for (let cycle = 0; cycle < 2; cycle++) {
    playRiff(filtered, cycle * 4, leadTrack, 80);
    playRiff(filtered, cycle * 4, bassTrack, 90, -3);
    placeDrumCycle(filtered, cycle * 4, "minimal");
  }
  // Lead and bass dim during filtered section
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 144, endBeats: 168, from: 1.0, to: 0.4, curve: "linear" }),
    targetEntity: leadTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 144, endBeats: 168, from: 1.0, to: 0.5, curve: "linear" }),
    targetEntity: bassTrack, targetParameter: "gain",
  });
  // Then ramp back up at release
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 168, endBeats: 184, from: 0.4, to: 1.0, curve: "linear" }),
    targetEntity: leadTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 168, endBeats: 184, from: 0.5, to: 1.0, curve: "linear" }),
    targetEntity: bassTrack, targetParameter: "gain",
  });

  // ============= SECTION 5: RIFF RELEASE =============
  // Filter opens, full energy back. 3 cycles.
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: release[0], track: drumTrack, register: 3, velocity: 125 });
  for (let cycle = 0; cycle < 3; cycle++) {
    playRiff(release, cycle * 4, leadTrack, 105);
    playRiff(release, cycle * 4, bassTrack, 115, -3);
    placeDrumCycle(release, cycle * 4, "full");
  }
  // Stab on bars during release for extra punch
  b.placeUnder({ pattern: stabHit, underHarmonicSpan: release[2],  track: stabTrack, register: 4, velocity: 95 });
  b.placeUnder({ pattern: stabHit, underHarmonicSpan: release[6],  track: stabTrack, register: 4, velocity: 95 });
  b.placeUnder({ pattern: stabHit, underHarmonicSpan: release[10], track: stabTrack, register: 4, velocity: 95 });

  // ============= SECTION 6: CONTRAST =============
  // E harmonic minor (D# leading tone). Riff GONE. Shred lead takes over.
  // Bass plays driving pedal E. Drums simplified — kick on 1+3, snare on 2+4, no hats.
  // The texture CHANGES — this should feel like a different room.
  const bassPedal = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X X X X", 4),
    notes: Array(4).fill({ kind: "scale_degree" as const, value: 0 }),  // E E E E
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassPedal, underSpans: contrast, track: bassTrack, register: 2, velocity: 110 });

  // Simplified contrast drums — kick + snare, no hats, no open hat
  const contrastKick = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("X . x .", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 0 }),
    defaultRegister: 2,
  });
  const contrastSnare = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini(". x . x", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 2 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: contrastKick,  underSpans: contrast, track: drumTrack, register: 2, velocity: 110 });
  b.placeRange({ pattern: contrastSnare, underSpans: contrast, track: drumTrack, register: 2, velocity: 100 });
  // Crash on entry to contrast (transitional moment)
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: contrast[0], track: drumTrack, register: 3, velocity: 115 });

  // Shred lead — 4 distinct phrases of 4 bars each (16 bars total)
  // Phrase 1: ascending arpeggio with the leading tone
  const shredPhrase1 = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X x x x X x x x X x x x X x x x", 4),
    notes: [
      { kind: "scale_degree", value: 0 },          // E
      { kind: "interval_from_prev", value: 3 },    // G
      { kind: "interval_from_prev", value: 4 },    // B
      { kind: "interval_from_prev", value: 5 },    // E (octave)
      { kind: "interval_from_prev", value: -5 },   // back
      { kind: "interval_from_prev", value: 4 },
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 5 },
      { kind: "interval_from_prev", value: -7 },
      { kind: "interval_from_prev", value: 7 },    // leap
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -3 },
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 4 },
      { kind: "interval_from_prev", value: 3 },
    ],
    defaultRegister: 4,
  });

  // Phrase 2: sustained high climax notes — uses noteEnvelope swells (the new primitive!)
  // Held B5, then a flourish, then held E6 with swell
  const shredHeld = b.placeNote({
    underHarmonicSpan: contrast[4], track: shredTrack, register: 5,
    degree: 4,                    // B5
    durBeats: 3.5, velocity: 105,
  });
  b.noteEnvelope({ instance: shredHeld, shape: "swell" });

  const shredFlurry = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x x x x x x x x x x x x x x x x", 4),
    notes: [
      { kind: "scale_degree", value: 5 },           // C
      { kind: "interval_from_prev", value: -1 },    // B
      { kind: "interval_from_prev", value: -2 },    // A
      { kind: "interval_from_prev", value: 1 },     // back up
      { kind: "interval_from_prev", value: 2 },
      { kind: "interval_from_prev", value: 1 },
      { kind: "interval_from_prev", value: 2 },
      { kind: "interval_from_prev", value: 3 },     // climbs
      { kind: "interval_from_prev", value: 2 },
      { kind: "interval_from_prev", value: -1 },
      { kind: "interval_from_prev", value: 1 },     // D# (leading tone! harmonic minor)
      { kind: "interval_from_prev", value: 1 },     // E
      { kind: "interval_from_prev", value: 2 },
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 2 },
      { kind: "interval_from_prev", value: -2 },
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: shredFlurry, underHarmonicSpan: contrast[5], track: shredTrack, register: 5, velocity: 110 });

  // Phrase 3 (bars 9-12 of contrast): octave-leap pattern with D# tension
  const shredOctaves = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X x x x X x x x X x x x X x x x", 4),
    notes: [
      { kind: "scale_degree", value: 0 },         // E low
      { kind: "interval_from_prev", value: 12 },  // E (octave up)
      { kind: "interval_from_prev", value: -10 }, // back to mid
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 9 },   // up
      { kind: "interval_from_prev", value: -12 }, // down octave
      { kind: "interval_from_prev", value: 4 },
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 4 },   // up to D#
      { kind: "interval_from_prev", value: 1 },   // E (resolution of leading tone)
      { kind: "interval_from_prev", value: -1 },  // D# (delaying resolution)
      { kind: "interval_from_prev", value: 1 },   // E
      { kind: "interval_from_prev", value: 7 },   // leap up
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -3 },
      { kind: "interval_from_prev", value: -4 },
    ],
    defaultRegister: 4,
  });
  b.placeUnder({ pattern: shredOctaves, underHarmonicSpan: contrast[8],  track: shredTrack, register: 4, velocity: 115 });
  b.placeUnder({ pattern: shredFlurry,  underHarmonicSpan: contrast[10], track: shredTrack, register: 5, velocity: 115 });

  // Phrase 4 (bars 13-16): grand climactic sustained E6 with swell, then descending resolution
  const climaxNote = b.placeNote({
    underHarmonicSpan: contrast[12], track: shredTrack, register: 6,
    degree: 0,                     // E6 — the highest tonic
    durBeats: 7,                        // 2 bars held
    velocity: 118,
  });
  b.noteEnvelope({ instance: climaxNote, shape: "swell" });

  // Resolution descent across last 2 bars of contrast
  const shredResolve = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X x x x X x x x", 4),
    notes: [
      { kind: "scale_degree", value: 4 },           // B
      { kind: "interval_from_prev", value: -2 },    // A
      { kind: "interval_from_prev", value: -2 },    // G
      { kind: "interval_from_prev", value: -3 },    // E
      { kind: "interval_from_prev", value: 4 },     // back up to G
      { kind: "interval_from_prev", value: -2 },    // F#
      { kind: "interval_from_prev", value: -2 },    // E
      { kind: "interval_from_prev", value: 0 },     // E sustained
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: shredResolve, underHarmonicSpan: contrast[14], track: shredTrack, register: 5, velocity: 110 });

  // Shred track gain envelope — fades in at start of contrast, fades out at end
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 224, endBeats: 240, from: 0.3, to: 1.0, curve: "linear" }),
    targetEntity: shredTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 280, endBeats: 288, from: 1.0, to: 0.0, curve: "linear" }),
    targetEntity: shredTrack, targetParameter: "gain",
  });

  // ============= SECTION 7: RIFF TRANSFORMED =============
  // Riff returns, octave-doubled on lead (one voice plus one an octave above).
  // Drums full energy.
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: transformed[0], track: drumTrack, register: 3, velocity: 125 });
  for (let cycle = 0; cycle < 3; cycle++) {
    playRiff(transformed, cycle * 4, leadTrack, 105);             // normal register
    playRiff(transformed, cycle * 4, leadTrack, 80, 1);            // doubled an octave higher
    playRiff(transformed, cycle * 4, bassTrack, 115, -3);          // bass low
    placeDrumCycle(transformed, cycle * 4, "full");
  }

  // ============= SECTION 8: OUTRO =============
  // Just the bookend bars of the riff (bar 1 + bar 4), fading.
  // Cycle 1 (bars 85-88): all 4 bars of riff one more time, quieter
  playRiff(outro, 0, leadTrack, 80);
  playRiff(outro, 0, bassTrack, 90, -3);
  // Cycle 2 (bars 89-92): only bars 1 and 4 — bookends. Bars 2 and 3 are silence.
  b.placeUnder({ pattern: riffBar1, underHarmonicSpan: outro[4], track: leadTrack, register: 5, velocity: 60 });
  b.placeUnder({ pattern: riffBar4, underHarmonicSpan: outro[7], track: leadTrack, register: 5, velocity: 50 });
  b.placeUnder({ pattern: riffBar1, underHarmonicSpan: outro[4], track: bassTrack, register: 2, velocity: 70 });
  b.placeUnder({ pattern: riffBar4, underHarmonicSpan: outro[7], track: bassTrack, register: 2, velocity: 60 });

  // Outro drums — half-time, fading
  for (let i = 0; i < 8; i++) {
    b.placeUnder({ pattern: kickHalfTime, underHarmonicSpan: outro[i], track: drumTrack, register: 2, velocity: 95 });
  }
  // Outro lead gain fades
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 336, endBeats: 368, from: 1.0, to: 0.0, curve: "linear" }),
    targetEntity: leadTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 336, endBeats: 368, from: 1.0, to: 0.0, curve: "linear" }),
    targetEntity: bassTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 336, endBeats: 368, from: 1.0, to: 0.0, curve: "linear" }),
    targetEntity: drumTrack, targetParameter: "gain",
  });

  // ============= SIDECHAIN =============
  b.sidechain({
    trigger: drumTrack,
    ducks: [bassTrack, padTrack, leadTrack, stabTrack, shredTrack],
    amount: 0.35, releaseMs: 160,
  });

  return { graph: b.graph };
}
