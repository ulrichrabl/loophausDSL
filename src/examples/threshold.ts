/**
 * "Threshold" — A minor club anthem, 128 BPM, ~3:15.
 * 104 bars, full club arrangement with Van Halen synth solo.
 *
 *    1-8     intro       pad alone, slow filter open
 *    9-24    drop 1      kick + bass + hat (16 bars)
 *   25-32    pre-drop    + snare + stab + claps
 *   33-40    build       drum fill, filter ramp
 *   41-56    big drop    everything in + hook melody (16 bars)
 *   57-64    breakdown   drums drop, pad holds, snare roll
 *   65-80    SOLO        Van Halen synth solo (16 bars)
 *   81-96    final drop  hook returns + solo tail (16 bars)
 *   97-104   outro       filter close, fade
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import {
  defineWobbleBass, defineSupersawLead, defineBrokenSignalLead,
  defineWarmPad, defineClavinetStab,
} from "../instruments/library.ts";

export function buildThreshold() {
  const b = new GraphBuilder();
  b.transport(b.tempo(128), b.meter(4, 4), { swing: 0 });

  const key = b.key(pcFromName("A"), "natural_minor");

  const bassSynth = defineWobbleBass(b);
  const stabSynth = defineClavinetStab(b);
  const padSynth  = defineWarmPad(b);
  const hookSynth = defineSupersawLead(b);
  const soloSynth = defineBrokenSignalLead(b);

  const drumTrack = b.track("drums", 10, { program: 26, isPercussion: true });
  const bassTrack = b.track("bass",  2,  { instrument: bassSynth });
  const stabTrack = b.track("stab",  3,  { instrument: stabSynth });
  const padTrack  = b.track("pad",   4,  { instrument: padSynth  });
  const hookTrack = b.track("lead",  5,  { instrument: hookSynth });
  const soloTrack = b.track("lead2", 6,  { instrument: soloSynth });

  // ============= PROGRESSIONS (1 chord per bar) =============
  const intro     = b.progression({ inKey: key, pattern: "i*8",                                                                    startBeats: 0,   beatsPerStep: 4 });
  const drop1     = b.progression({ inKey: key, pattern: "i VI III VII i VI III VII i VI III VII i VI III VII",                    startBeats: 32,  beatsPerStep: 4 });
  const preDrop   = b.progression({ inKey: key, pattern: "i VI III VII i VI III VII",                                              startBeats: 96,  beatsPerStep: 4 });
  const build     = b.progression({ inKey: key, pattern: "i VI III VII i VI III VII",                                              startBeats: 128, beatsPerStep: 4 });
  const bigDrop   = b.progression({ inKey: key, pattern: "i VI III VII i VI III VII i VI III VII i VI III VII",                    startBeats: 160, beatsPerStep: 4 });
  const breakdown = b.progression({ inKey: key, pattern: "i VI III VII i VI III VII",                                              startBeats: 224, beatsPerStep: 4 });
  const solo      = b.progression({ inKey: key, pattern: "i VI III VII i VI III VII i VI III VII i VI III VII",                    startBeats: 256, beatsPerStep: 4 });
  const finalDrop = b.progression({ inKey: key, pattern: "i VI III VII i VI III VII i VI III VII i VI III VII",                    startBeats: 320, beatsPerStep: 4 });
  const outro     = b.progression({ inKey: key, pattern: "i*8",                                                                    startBeats: 384, beatsPerStep: 4 });

  const allSpans = [...intro, ...drop1, ...preDrop, ...build, ...bigDrop, ...breakdown, ...solo, ...finalDrop, ...outro];

  // ============= PAD =============
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
  const padInsts = b.placeRange({ pattern: padPat, underSpans: allSpans, track: padTrack, velocity: 55 });
  b.smoothVoiceLeading(padInsts);
  for (const i of padInsts) b.registerRange(i, 57, 79);
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 0,   endBeats: 160,  from: 250, to: 4500, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 384, endBeats: 416, from: 4500, to: 600, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 0, endBeats: 32, from: 0.1, to: 0.5, curve: "linear" }),
    targetEntity: padTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 384, endBeats: 416, from: 0.5, to: 0.05, curve: "linear" }),
    targetEntity: padTrack, targetParameter: "gain",
  });

  // ============= DRUMS =============
  const kickPat = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("X x x x", 4),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }), defaultRegister: 2,
  });
  const hatPat = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("x X x X x X x X", 4),
    notes: Array(8).fill({ kind: "fixed_pc" as const, value: 6 }), defaultRegister: 2,
  });
  const snareBackbeat = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini(". x . x", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 2 }), defaultRegister: 2,
  });
  const clapPat = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini(". x . x", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 3 }), defaultRegister: 2,
  });
  const openHatOff = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini(". . . . . . . x", 4),
    notes: [{ kind: "fixed_pc", value: 10 }], defaultRegister: 2,
  });
  const crashHit = b.melodicPattern({
    unitBeats: 4, ownRhythm: [{ at: 0, dur: 1 }],
    notes: [{ kind: "fixed_pc", value: 1 }], defaultRegister: 3,
  });
  const snareFill = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("x*16", 4),
    notes: Array(16).fill({ kind: "fixed_pc" as const, value: 2 }), defaultRegister: 2,
  });

  // Drop 1: kick + hat
  b.placeRange({ pattern: kickPat, underSpans: drop1, track: drumTrack, register: 2, velocity: 115 });
  b.placeRange({ pattern: hatPat,  underSpans: drop1, track: drumTrack, register: 2, velocity: 65 });
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: drop1[0], track: drumTrack, register: 3, velocity: 110 });

  // Pre-drop: full kit minus snare-fills
  b.placeRange({ pattern: kickPat,        underSpans: preDrop, track: drumTrack, register: 2, velocity: 115 });
  b.placeRange({ pattern: hatPat,         underSpans: preDrop, track: drumTrack, register: 2, velocity: 70 });
  b.placeRange({ pattern: snareBackbeat,  underSpans: preDrop, track: drumTrack, register: 2, velocity: 100 });
  b.placeRange({ pattern: clapPat,        underSpans: preDrop, track: drumTrack, register: 2, velocity: 90 });
  b.placeRange({ pattern: openHatOff,     underSpans: preDrop, track: drumTrack, register: 2, velocity: 80 });

  // Build: standard pattern for 2 bars, then snare-roll fills
  b.placeRange({ pattern: kickPat,       underSpans: build, track: drumTrack, register: 2, velocity: 115 });
  b.placeRange({ pattern: hatPat,        underSpans: build, track: drumTrack, register: 2, velocity: 70 });
  b.placeRange({ pattern: snareBackbeat, underSpans: build.slice(0, 2), track: drumTrack, register: 2, velocity: 100 });
  b.placeUnder({ pattern: snareFill, underHarmonicSpan: build[2], track: drumTrack, register: 2, velocity: 95 });
  b.placeUnder({ pattern: snareFill, underHarmonicSpan: build[3], track: drumTrack, register: 2, velocity: 110 });

  // Big drop: full energy + crash on entry
  b.placeRange({ pattern: kickPat,        underSpans: bigDrop, track: drumTrack, register: 2, velocity: 120 });
  b.placeRange({ pattern: hatPat,         underSpans: bigDrop, track: drumTrack, register: 2, velocity: 75 });
  b.placeRange({ pattern: snareBackbeat,  underSpans: bigDrop, track: drumTrack, register: 2, velocity: 105 });
  b.placeRange({ pattern: clapPat,        underSpans: bigDrop, track: drumTrack, register: 2, velocity: 95 });
  b.placeRange({ pattern: openHatOff,     underSpans: bigDrop, track: drumTrack, register: 2, velocity: 85 });
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: bigDrop[0], track: drumTrack, register: 3, velocity: 125 });

  // Breakdown: kick on beat 1 of each chord change, snare roll last 2 bars
  const kickOnce = b.melodicPattern({
    unitBeats: 4, ownRhythm: [{ at: 0, dur: 0.2 }],
    notes: [{ kind: "fixed_pc", value: 0 }], defaultRegister: 2,
  });
  for (const span of breakdown) b.placeUnder({ pattern: kickOnce, underHarmonicSpan: span, track: drumTrack, register: 2, velocity: 90 });
  b.placeUnder({ pattern: snareFill, underHarmonicSpan: breakdown[2], track: drumTrack, register: 2, velocity: 90 });
  b.placeUnder({ pattern: snareFill, underHarmonicSpan: breakdown[3], track: drumTrack, register: 2, velocity: 115 });

  // Solo: full drums
  b.placeRange({ pattern: kickPat,        underSpans: solo, track: drumTrack, register: 2, velocity: 120 });
  b.placeRange({ pattern: hatPat,         underSpans: solo, track: drumTrack, register: 2, velocity: 75 });
  b.placeRange({ pattern: snareBackbeat,  underSpans: solo, track: drumTrack, register: 2, velocity: 105 });
  b.placeRange({ pattern: clapPat,        underSpans: solo, track: drumTrack, register: 2, velocity: 95 });
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: solo[0], track: drumTrack, register: 3, velocity: 125 });

  // Final drop: full drums
  b.placeRange({ pattern: kickPat,        underSpans: finalDrop, track: drumTrack, register: 2, velocity: 120 });
  b.placeRange({ pattern: hatPat,         underSpans: finalDrop, track: drumTrack, register: 2, velocity: 75 });
  b.placeRange({ pattern: snareBackbeat,  underSpans: finalDrop, track: drumTrack, register: 2, velocity: 105 });
  b.placeRange({ pattern: clapPat,        underSpans: finalDrop, track: drumTrack, register: 2, velocity: 95 });
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: finalDrop[0], track: drumTrack, register: 3, velocity: 125 });

  // ============= BASS =============
  const bassPulse = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("X . x . X . x .", 4),
    notes: [
      { kind: "chord_tone",         value: 0 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "chord_tone",         value: 0 },
      { kind: "interval_from_prev", value: 12 },
    ],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassPulse, underSpans: drop1,     track: bassTrack, register: 2, velocity: 105 });
  b.placeRange({ pattern: bassPulse, underSpans: preDrop,   track: bassTrack, register: 2, velocity: 108 });
  b.placeRange({ pattern: bassPulse, underSpans: build,     track: bassTrack, register: 2, velocity: 110 });
  b.placeRange({ pattern: bassPulse, underSpans: bigDrop,   track: bassTrack, register: 2, velocity: 115 });
  b.placeRange({ pattern: bassPulse, underSpans: solo,      track: bassTrack, register: 2, velocity: 115 });
  b.placeRange({ pattern: bassPulse, underSpans: finalDrop, track: bassTrack, register: 2, velocity: 115 });

  b.sidechain({ trigger: drumTrack, ducks: [bassTrack, stabTrack, padTrack, hookTrack, soloTrack], amount: 0.4, releaseMs: 180 });

  // ============= STAB =============
  const stabHit = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0.375, dur: 0.12, velMul: 1.1 }, { at: 0.375, dur: 0.12 }, { at: 0.375, dur: 0.12 },
      { at: 0.875, dur: 0.12, velMul: 1.1 }, { at: 0.875, dur: 0.12 }, { at: 0.875, dur: 0.12 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 }, { kind: "chord_tone", value: 1 }, { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 0 }, { kind: "chord_tone", value: 1 }, { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 4,
  });
  for (const spans of [preDrop, bigDrop, finalDrop]) {
    const insts = b.placeRange({ pattern: stabHit, underSpans: spans, track: stabTrack, velocity: 90 });
    b.smoothVoiceLeading(insts);
    for (const i of insts) b.registerRange(i, 57, 76);
  }

  // ============= HOOK MELODY =============
  const hookPhrase = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.125, velMul: 1.2 },
      { at: 0.125, dur: 0.125 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.5,   dur: 0.25, velMul: 1.1 },
      { at: 0.75,  dur: 0.25 },
    ],
    notes: [
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 5,
  });
  for (let i = 0; i < bigDrop.length; i += 2) {
    b.placeUnder({ pattern: hookPhrase, underHarmonicSpan: bigDrop[i], track: hookTrack, register: 5, velocity: 105 });
  }
  for (let i = 0; i < finalDrop.length; i += 2) {
    b.placeUnder({ pattern: hookPhrase, underHarmonicSpan: finalDrop[i], track: hookTrack, register: 5, velocity: 110 });
  }

  // ============= THE SOLO — 8 bars =============
  // Bar 1 (Am): fast 16th-note ascending pentatonic run with the blues b5
  const soloPhrase1 = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("x*16", 4),
    notes: [
      { kind: "chord_tone",         value: 0 },
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 2 },
      { kind: "interval_from_prev", value: 1 },     // blues b5
      { kind: "interval_from_prev", value: 1 },
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 2 },
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 2 },
      { kind: "interval_from_prev", value: 1 },
      { kind: "interval_from_prev", value: 1 },
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 2 },
      { kind: "interval_from_prev", value: -3 },
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -3 },
    ],
    defaultRegister: 4,
  });
  b.placeUnder({ pattern: soloPhrase1, underHarmonicSpan: solo[0], track: soloTrack, register: 4, velocity: 110 });

  // Bar 2 (F): sustained high A with swell
  const sus1 = b.placeNote({
    underHarmonicSpan: solo[1], track: soloTrack, register: 6,
    chordTone: 1, durBeats: 3.5, velocity: 100,
  });
  b.noteEnvelope({ instance: sus1, shape: "swell" });

  // Bar 3 (C): octave-displacement runs
  const soloPhrase3 = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("X x x x X x x x X x x x X x x x", 4),
    notes: [
      { kind: "chord_tone",         value: 0 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "interval_from_prev", value: -10 },
      { kind: "interval_from_prev", value: 2 },
      { kind: "interval_from_prev", value: 9 },
      { kind: "interval_from_prev", value: -12 },
      { kind: "interval_from_prev", value: 4 },
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 5 },
      { kind: "interval_from_prev", value: -12 },
      { kind: "interval_from_prev", value: 4 },
      { kind: "interval_from_prev", value: 3 },
      { kind: "interval_from_prev", value: 5 },
      { kind: "interval_from_prev", value: -5 },
      { kind: "interval_from_prev", value: -3 },
      { kind: "interval_from_prev", value: -4 },
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: soloPhrase3, underHarmonicSpan: solo[2], track: soloTrack, register: 5, velocity: 115 });

  // Bar 4 (G): rapid trill (the Van Halen sustain-and-bend feel)
  const trillPattern = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("x*16", 4),
    notes: Array(8).fill(null).flatMap(() => [
      { kind: "chord_tone" as const, value: 1 },
      { kind: "scale_degree" as const, value: 5 },
    ]),
    defaultRegister: 6,
  });
  b.placeUnder({ pattern: trillPattern, underHarmonicSpan: solo[3], track: soloTrack, register: 6, velocity: 108 });

  // Bar 5 (Am): wide octave leaps
  const soloPhrase5 = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("X x X x X x X x X x X x X x X x", 4),
    notes: [
      { kind: "chord_tone",         value: 0 },
      { kind: "interval_from_prev", value: 24 },     // TWO OCTAVES UP
      { kind: "interval_from_prev", value: -19 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "interval_from_prev", value: -7 },
      { kind: "interval_from_prev", value: -5 },
      { kind: "interval_from_prev", value: 9 },
      { kind: "interval_from_prev", value: -7 },
      { kind: "interval_from_prev", value: -5 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "interval_from_prev", value: -3 },
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -3 },
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -3 },
    ],
    defaultRegister: 4,
  });
  b.placeUnder({ pattern: soloPhrase5, underHarmonicSpan: solo[4], track: soloTrack, register: 4, velocity: 120 });

  // Bar 6 (F): sustained 9th — uses the new extended chord-tone
  const sus2 = b.placeNote({
    underHarmonicSpan: solo[5], track: soloTrack, register: 6,
    chordTone: 4, durBeats: 3.5, velocity: 105,
  });
  b.noteEnvelope({ instance: sus2, shape: "swell" });

  // Bar 7 (C): chromatic descent — every note an attack
  const soloPhrase7 = b.melodicPattern({
    unitBeats: 4, ownRhythm: b.rhythmMini("x*16", 4),
    notes: [
      { kind: "chord_tone",         value: 2 },
      { kind: "interval_from_prev", value: -1 },
      { kind: "interval_from_prev", value: -1 },
      { kind: "interval_from_prev", value: -1 },
      { kind: "interval_from_prev", value: -1 },
      { kind: "interval_from_prev", value: -1 },
      { kind: "interval_from_prev", value: -1 },
      { kind: "interval_from_prev", value: -1 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -1 },
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -2 },
      { kind: "interval_from_prev", value: -1 },
      { kind: "interval_from_prev", value: -2 },
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: soloPhrase7, underHarmonicSpan: solo[6], track: soloTrack, register: 5, velocity: 118 });

  // Bar 8 (G): grand sustained finale
  const grandFinale = b.placeNote({
    underHarmonicSpan: solo[7], track: soloTrack, register: 6,
    chordTone: 1, durBeats: 3.8, velocity: 115,
  });
  b.noteEnvelope({ instance: grandFinale, shape: "swell" });

  // Solo gain — entry crescendo, fade through final drop
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 256, endBeats: 288, from: 0.3, to: 1.0, curve: "linear" }),
    targetEntity: soloTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 320, endBeats: 384, from: 1.0, to: 0.15, curve: "linear" }),
    targetEntity: soloTrack, targetParameter: "gain",
  });

  return { graph: b.graph };
}
