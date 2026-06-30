/**
 * "Loophaus Discotheque v2" — same Am-F-C-G progression, much less boring.
 *
 * The framework's payoff is exactly this: per-bar variation is just placing
 * different patterns on different spans. Below, almost every 4-bar phrase
 * has its own pattern variation. The arrangement *develops* instead of looping.
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import type { ScaleDegree } from "../core/types.ts";

export function buildDaftPunkV2() {
  const b = new GraphBuilder();

  // Transport
  b.transport(b.tempo(116), b.meter(4, 4));

  // A natural minor
  const key = b.key(pcFromName("A"), "natural_minor");

  // Tracks
  const drumTrack = b.track("drums", 10, { program: 26, isPercussion: true });
  const bassTrack = b.track("bass",  2,  { program: 38 });
  const stabTrack = b.track("stab",  3,  { program: 8  });
  const padTrack  = b.track("pad",   4,  { program: 91 });
  const leadTrack = b.track("lead",  5,  { program: 82 });

  // 16 bars Am-F-C-G
  const cycle: ScaleDegree[] = ["i", "VI", "III", "VII"];
  const spans = Array.from({ length: 16 }, (_, bar) =>
    b.harmonicSpan({
      inKey: key,
      degree: cycle[bar % 4],
      startBeats: bar * 4,
      endBeats: (bar + 1) * 4,
    })
  );

  // ===== DRUMS =====
  // GM drum map: pc=0 reg=2 → 36 kick, pc=2 reg=2 → 38 snare,
  // pc=6 reg=2 → 42 closed hat, pc=10 reg=2 → 46 open hat,
  // pc=1 reg=3 → 49 crash, pc=3 reg=3 → 51 ride, pc=3 reg=2 → 39 clap

  // Kick: 4-on-the-floor, all 16 bars
  const kickPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [0, 0.25, 0.5, 0.75].map(at => ({ at, dur: 0.2 })),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }),
    defaultRegister: 2,
  });
  for (const h of spans) b.placeUnder({ pattern: kickPat, underHarmonicSpan: h, track: drumTrack, register: 2, velocity: 115 });

  // Closed hi-hat: 8ths, from bar 3
  const hihatPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: Array.from({ length: 8 }, (_, i) => ({ at: i * 0.125, dur: 0.1 })),
    notes: Array(8).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  for (let bar = 2; bar < 16; bar++)
    b.placeUnder({ pattern: hihatPat, underHarmonicSpan: spans[bar], track: drumTrack, register: 2, velocity: 65 });

  // Snare: beats 2 and 4, from bar 5
  const snarePat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0.25, dur: 0.2 }, { at: 0.75, dur: 0.2 }],
    notes: [{ kind: "fixed_pc", value: 2 }, { kind: "fixed_pc", value: 2 }],
    defaultRegister: 2,
  });
  for (let bar = 4; bar < 16; bar++)
    b.placeUnder({ pattern: snarePat, underHarmonicSpan: spans[bar], track: drumTrack, register: 2, velocity: 100 });

  // Snare FILL: 16th notes on beat 4 — placed on bars 8 and 12 (phrase ends)
  const snareFill = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0.75,   dur: 0.0625 },
      { at: 0.8125, dur: 0.0625 },
      { at: 0.875,  dur: 0.0625 },
      { at: 0.9375, dur: 0.0625 },
    ],
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 2 }),
    defaultRegister: 2,
  });
  b.placeUnder({ pattern: snareFill, underHarmonicSpan: spans[7],  track: drumTrack, register: 2, velocity: 95 });
  b.placeUnder({ pattern: snareFill, underHarmonicSpan: spans[11], track: drumTrack, register: 2, velocity: 95 });

  // Open hi-hat: on "&" of 4 each bar — adds energy. From bar 9.
  const openHat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0.875, dur: 0.125 }],
    notes: [{ kind: "fixed_pc", value: 10 }],   // pc 10 + register 2 = 46 = open hat
    defaultRegister: 2,
  });
  for (let bar = 8; bar < 16; bar++)
    b.placeUnder({ pattern: openHat, underHarmonicSpan: spans[bar], track: drumTrack, register: 2, velocity: 80 });

  // Crash cymbal: bar 9 beat 1 (THE DROP)
  const crashPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0, dur: 1 }],
    notes: [{ kind: "fixed_pc", value: 1 }],  // pc 1 + register 3 = 49 = crash 1
    defaultRegister: 3,
  });
  b.placeUnder({ pattern: crashPat, underHarmonicSpan: spans[8], track: drumTrack, register: 3, velocity: 110 });

  // Claps: bar 12 (before the climax), 8ths on offbeats
  const clapsPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [0.125, 0.375, 0.625, 0.875].map(at => ({ at, dur: 0.12 })),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 3 }), // pc 3 + register 2 = 39 = hand clap
    defaultRegister: 2,
  });
  b.placeUnder({ pattern: clapsPat, underHarmonicSpan: spans[11], track: drumTrack, register: 2, velocity: 95 });

  // ===== BASS =====
  // Bars 3-12: classic octave-jump groove
  const bassOctave = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: Array.from({ length: 8 }, (_, i) => ({ at: i * 0.125, dur: 0.11 })),
    notes: [
      { kind: "chord_tone",         value: 0 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "interval_from_prev", value: -12 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "interval_from_prev", value: -12 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "interval_from_prev", value: -12 },
      { kind: "interval_from_prev", value: 12 },
    ],
    defaultRegister: 2,
  });
  for (let bar = 2; bar < 12; bar++)
    b.placeUnder({ pattern: bassOctave, underHarmonicSpan: spans[bar], track: bassTrack, register: 2, velocity: 100 });

  // Bars 13-16: syncopated walking bass — adds movement for the climax
  // root - rest - 5th - root - octave - rest - 5th - octave
  const bassWalk = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.11 },                  // root
      // skip 0.125 — rest
      { at: 0.25,  dur: 0.11 },                  // 5th
      { at: 0.375, dur: 0.11 },                  // root
      { at: 0.5,   dur: 0.11 },                  // octave
      // skip 0.625
      { at: 0.75,  dur: 0.11 },                  // 5th
      { at: 0.875, dur: 0.11 },                  // octave
    ],
    notes: [
      { kind: "chord_tone",         value: 0 },   // root
      { kind: "chord_tone",         value: 2 },   // 5th (in band)
      { kind: "chord_tone",         value: 0 },   // root
      { kind: "interval_from_prev", value: 12 },  // octave up
      { kind: "interval_from_prev", value: -7 },  // back down to 5th area
      { kind: "interval_from_prev", value: 7 },   // up to octave
    ],
    defaultRegister: 2,
  });
  for (let bar = 12; bar < 16; bar++)
    b.placeUnder({ pattern: bassWalk, underHarmonicSpan: spans[bar], track: bassTrack, register: 2, velocity: 100 });

  // ===== STABS =====
  // Bars 5-8: sparse — stabs on "&" of 2 and "&" of 4 only
  const stabSparse = b.melodicPattern({
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

  // Bars 9-16: dense — stabs on every offbeat ("&" of 1, 2, 3, 4)
  const stabDense = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [0.125, 0.375, 0.625, 0.875].flatMap(at => [
      { at, dur: 0.1 }, { at, dur: 0.1 }, { at, dur: 0.1 },
    ]),
    notes: Array(12).fill(null).flatMap((_, i) => ({
      kind: "chord_tone" as const, value: i % 3,
    })),
    defaultRegister: 4,
  });

  const stabInsts: string[] = [];
  for (let bar = 4; bar < 8; bar++)
    stabInsts.push(b.placeUnder({ pattern: stabSparse, underHarmonicSpan: spans[bar], track: stabTrack, velocity: 90 }));
  for (let bar = 8; bar < 16; bar++)
    stabInsts.push(b.placeUnder({ pattern: stabDense, underHarmonicSpan: spans[bar], track: stabTrack, velocity: 88 }));
  b.smoothVoiceLeading(stabInsts);
  for (const inst of stabInsts) b.registerRange(inst, 55, 76);

  // ===== PAD =====
  // Bars 7-16: sustained chord, voice-led
  const padPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0, dur: 1 }, { at: 0, dur: 1 }, { at: 0, dur: 1 }],
    notes: [
      { kind: "chord_tone", value: 0 }, { kind: "chord_tone", value: 1 }, { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 4,
  });
  const padInsts: string[] = [];
  for (let bar = 6; bar < 16; bar++)
    padInsts.push(b.placeUnder({ pattern: padPat, underHarmonicSpan: spans[bar], track: padTrack, velocity: 50 }));
  b.smoothVoiceLeading(padInsts);
  for (const inst of padInsts) b.registerRange(inst, 60, 79);

  // ===== LEAD =====
  // Bars 9-10: phrase A (call) — descending chord-tone hook
  const phraseA = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.25 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,   dur: 0.5 },
    ],
    notes: [
      { kind: "chord_tone", value: 2 },  // 5th
      { kind: "chord_tone", value: 1 },  // 3rd
      { kind: "chord_tone", value: 2 },  // 5th — quick repeat
      { kind: "chord_tone", value: 0 },  // root — landing
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: spans[8],  track: leadTrack, register: 5, velocity: 105 });
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: spans[9],  track: leadTrack, register: 5, velocity: 105 });

  // Bars 11-12: phrase B (response) — ascending, more notes, more drive
  const phraseB = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.125 },
      { at: 0.125, dur: 0.125 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,   dur: 0.5 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },  // landing on 5th
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: spans[10], track: leadTrack, register: 5, velocity: 108 });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: spans[11], track: leadTrack, register: 5, velocity: 108 });

  // Bars 13-14: inverted phrase A — the same shape flipped (rises now)
  const phraseAInv = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.25 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,   dur: 0.5 },
    ],
    notes: [
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 0 },
    ],
    defaultRegister: 5,
    transform: "invert",
  });
  b.placeUnder({ pattern: phraseAInv, underHarmonicSpan: spans[12], track: leadTrack, register: 5, velocity: 110 });
  b.placeUnder({ pattern: phraseAInv, underHarmonicSpan: spans[13], track: leadTrack, register: 5, velocity: 110 });

  // Bars 15-16: climax — ascending phrase that lands high
  const phraseClimax = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.125 },
      { at: 0.125, dur: 0.125 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,   dur: 0.125 },
      { at: 0.625, dur: 0.125 },
      { at: 0.75,  dur: 0.25 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 1 },  // landing
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: phraseClimax, underHarmonicSpan: spans[14], track: leadTrack, register: 5, velocity: 115 });
  b.placeUnder({ pattern: phraseClimax, underHarmonicSpan: spans[15], track: leadTrack, register: 5, velocity: 115 });

  return b.graph;
}
