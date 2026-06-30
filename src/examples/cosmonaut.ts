/**
 * "Cosmonaut" — 64 bars, 124 BPM, D tonic throughout with three mode shifts.
 *
 * Inspirations:
 *   - Grateful Dead "Dark Star": cosmic modal drift, sustained tones, space
 *   - Justice: aggressive harmonic surprises via mode shifts (D minor → D major → D Phrygian Dom)
 *   - Keith Moon: a drum solo climax where the kit takes over (bars 41-52)
 *
 * Sections (8 bars each unless noted):
 *   1-8   DRIFT  - D minor pad alone, slow filter open, no rhythm yet
 *   9-24  PULSE  - 4-on-floor + Dm-Bb-C-Dm vamp, lead enters bar 17
 *   25-32 LIFT   - mode shift to D MAJOR (Justice anthem) I-IV-V-I
 *   33-40 TWIST  - mode shift to D PHRYGIAN DOMINANT (the Eb surprise)
 *   41-52 MOON   - 12 bars drum solo: tom rolls, crash storms, polyrhythmic chaos
 *   53-60 RETURN - back to D minor verse, full intensity
 *   61-64 OUTRO  - held tonic, fading
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import { defineWobbleBass, defineSupersawLead, defineWarmPad, defineClavinetStab, defineBrokenSignalLead } from "../instruments/library.ts";

export function buildCosmonaut() {
  const b = new GraphBuilder();
  b.transport(b.tempo(124), b.meter(4, 4), { swing: 0.05 });   // 124 BPM sci-fi club, almost no swing

  // Three key contexts, same tonic, different modes
  const keyMinor   = b.key(pcFromName("D"), "natural_minor");      // Drift, verse, return
  const keyMajor   = b.key(pcFromName("D"), "major");              // Lift (Justice anthem)
  const keyPhrDom  = b.key(pcFromName("D"), "phrygian_dominant");  // Twist (Eb surprise)

  // Instruments (audio-graph compositions)
  const bassSynth = defineWobbleBass(b);
  const leadSynth = defineBrokenSignalLead(b);              // distorted, sci-fi
  const padSynth  = defineWarmPad(b);
  const stabSynth = defineClavinetStab(b);
  void defineSupersawLead;  // keep the import valid even though unused

  // Tracks
  const drumTrack = b.track("drums", 10, { program: 26, isPercussion: true });
  const bassTrack = b.track("bass",  2,  { instrument: bassSynth });
  const stabTrack = b.track("stab",  3,  { instrument: stabSynth });
  const padTrack  = b.track("pad",   4,  { instrument: padSynth  });
  const leadTrack = b.track("lead",  5,  { instrument: leadSynth });

  // ============= HARMONIC SKELETON =============
  // Each section has its own progression in its own key context.
  // We concatenate the spans to form the full piece's timeline.

  const drift  = b.progression({ inKey: keyMinor,  pattern: "i*8",                     startBeats: 0   });   // 8 bars Dm
  const verse  = b.progression({ inKey: keyMinor,  pattern: "i VI VII i i VI VII i i VI VII i i VI VII i",  startBeats: 32  }); // 16 bars Dm vamp
  const lift   = b.progression({ inKey: keyMajor,  pattern: "I IV V I I IV V I",       startBeats: 96  });   // 8 bars D major
  const twist  = b.progression({ inKey: keyPhrDom, pattern: "i II VI II i VI II V",    startBeats: 128 });   // 8 bars D Phrygian dom (II = bII = Eb!)
  const moon   = b.progression({ inKey: keyMinor,  pattern: "i*12",                    startBeats: 160 });   // 12 bars Dm pedal under drum solo
  const ret    = b.progression({ inKey: keyMinor,  pattern: "i VI VII i i VI VII i",   startBeats: 208 });   // 8 bars Dm return
  const outro  = b.progression({ inKey: keyMinor,  pattern: "i*4",                     startBeats: 240 });   // 4 bars Dm hold

  const driftS  = b.section("drift",  drift);
  const verseS  = b.section("verse",  verse);
  const liftS   = b.section("lift",   lift);
  const twistS  = b.section("twist",  twist);
  const moonS   = b.section("moon",   moon);
  const returnS = b.section("return", ret);
  const outroS  = b.section("outro",  outro);

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
  const allSpans = [...drift, ...verse, ...lift, ...twist, ...moon, ...ret, ...outro];
  const padInsts = b.placeRange({ pattern: padPat, underSpans: allSpans, track: padTrack, velocity: 55 });
  b.smoothVoiceLeading(padInsts);
  for (const i of padInsts) b.registerRange(i, 57, 79);

  // Pad fade-in (drift) and fade-out (outro)
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 0,   endBeats: 32,  from: 0.05, to: 0.55, curve: "linear" }),
    targetEntity: padTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 240, endBeats: 256, from: 0.55, to: 0.05, curve: "linear" }),
    targetEntity: padTrack, targetParameter: "gain",
  });
  // Filter open from drift to climax, close in outro
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 0,   endBeats: 208, from: 250, to: 4500, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 240, endBeats: 256, from: 4500, to: 400, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });

  // ============= DRUMS =============
  // GM drum map (channel 10): notes are pitches that select the drum.
  //   36 kick, 38 snare, 39 clap, 42 closed hat, 46 open hat, 49 crash,
  //   41 low floor tom, 43 low tom, 45 mid tom, 47 high mid tom, 48 hi tom 2, 50 hi tom 1
  //
  // Mapping via (pc, register):
  //   pc 0  reg 2 -> 36 (kick)
  //   pc 2  reg 2 -> 38 (snare)
  //   pc 3  reg 2 -> 39 (clap)
  //   pc 5  reg 2 -> 41 (low floor tom)
  //   pc 6  reg 2 -> 42 (closed hat)
  //   pc 7  reg 2 -> 43 (low tom)
  //   pc 9  reg 2 -> 45 (mid tom)
  //   pc 10 reg 2 -> 46 (open hat)
  //   pc 11 reg 2 -> 47 (high mid tom)
  //   pc 0  reg 3 -> 48 (hi tom 2)
  //   pc 1  reg 3 -> 49 (crash)
  //   pc 2  reg 3 -> 50 (hi tom 1)

  const drumPat = (mini: string, pc: number, register: number) => b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini(mini, 4),
    notes: Array(32).fill({ kind: "fixed_pc" as const, value: pc }),
    defaultRegister: register,
  });

  // --- Pulse, lift, twist, return: driving 4-on-floor ---
  const kick4 = drumPat("X x x x", 0, 2);
  const closedHatGroove = drumPat("x X x X x X x X", 6, 2);
  const snareBackbeat = drumPat(". x . x", 2, 2);
  const openHatOff   = drumPat(". . . . . . . x", 10, 2);

  const drivingSections = [...verse, ...lift, ...twist, ...ret];
  b.placeRange({ pattern: kick4,         underSpans: drivingSections, track: drumTrack, register: 2, velocity: 115 });
  b.placeRange({ pattern: closedHatGroove, underSpans: drivingSections, track: drumTrack, register: 2, velocity: 70  });
  b.placeRange({ pattern: snareBackbeat, underSpans: drivingSections, track: drumTrack, register: 2, velocity: 105 });
  b.placeRange({ pattern: openHatOff,    underSpans: [...lift, ...twist], track: drumTrack, register: 2, velocity: 85 });

  // Crash on each section transition
  const crashHit = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0, dur: 1 }],
    notes: [{ kind: "fixed_pc", value: 1 }],
    defaultRegister: 3,
  });
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: verse[0],  track: drumTrack, register: 3, velocity: 110 });  // verse start
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: lift[0],   track: drumTrack, register: 3, velocity: 120 });  // lift start
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: twist[0],  track: drumTrack, register: 3, velocity: 115 });  // twist start
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: moon[0],   track: drumTrack, register: 3, velocity: 125 });  // moon start
  b.placeUnder({ pattern: crashHit, underHarmonicSpan: ret[0],    track: drumTrack, register: 3, velocity: 120 });  // return start

  // ============= MOON CLIMAX — 12 bars of chaos =============
  // Different pattern per bar. This is where the framework's per-bar
  // placement pays off — 12 wildly different drum patterns in sequence.

  // Bar 41: kick chaos + crash storm
  b.placeUnder({ pattern: drumPat("X . X x . x X .", 0, 2),  underHarmonicSpan: moon[0], track: drumTrack, register: 2, velocity: 115 });
  b.placeUnder({ pattern: drumPat("X . . X . X . .", 1, 3),  underHarmonicSpan: moon[0], track: drumTrack, register: 3, velocity: 110 }); // crashes
  b.placeUnder({ pattern: drumPat("x x x x x x x x x x x x x x x x", 2, 2),  underHarmonicSpan: moon[0], track: drumTrack, register: 2, velocity: 90 }); // snare 16ths

  // Bar 42: descending tom roll
  b.placeUnder({ pattern: drumPat("X x x x", 0, 2),                          underHarmonicSpan: moon[1], track: drumTrack, register: 2, velocity: 105 }); // anchoring kick
  b.placeUnder({ pattern: drumPat("X x x x . . . . . . . . . . . .", 2, 3), underHarmonicSpan: moon[1], track: drumTrack, register: 3, velocity: 110 }); // hi tom
  b.placeUnder({ pattern: drumPat(". . . . X x x x . . . . . . . .", 0, 3), underHarmonicSpan: moon[1], track: drumTrack, register: 3, velocity: 110 }); // hi tom 2
  b.placeUnder({ pattern: drumPat(". . . . . . . . X x x x . . . .", 11, 2),underHarmonicSpan: moon[1], track: drumTrack, register: 2, velocity: 105 }); // high mid tom
  b.placeUnder({ pattern: drumPat(". . . . . . . . . . . . X x x x", 9, 2), underHarmonicSpan: moon[1], track: drumTrack, register: 2, velocity: 100 }); // mid tom

  // Bar 43: snare triplet feel + crashes
  b.placeUnder({ pattern: drumPat("X . . X . . X . . X . .", 0, 2),  underHarmonicSpan: moon[2], track: drumTrack, register: 2, velocity: 110 });
  b.placeUnder({ pattern: drumPat(". X . . X . . X . . X .", 2, 2),  underHarmonicSpan: moon[2], track: drumTrack, register: 2, velocity: 100 });
  b.placeUnder({ pattern: drumPat(". . X . . X . . X . . X", 1, 3),  underHarmonicSpan: moon[2], track: drumTrack, register: 3, velocity: 95 });

  // Bar 44: fill — snare 16ths building, open hats stuttering
  b.placeUnder({ pattern: drumPat("X x . x . x . x", 0, 2), underHarmonicSpan: moon[3], track: drumTrack, register: 2, velocity: 110 });
  b.placeUnder({ pattern: drumPat("x x x x x x x x x x x x x x x x", 2, 2),  underHarmonicSpan: moon[3], track: drumTrack, register: 2, velocity: 95 });
  b.placeUnder({ pattern: drumPat(". X . X . X . X . X . X . X . X", 10, 2),underHarmonicSpan: moon[3], track: drumTrack, register: 2, velocity: 80 });

  // Bar 45: BOOM — crash storm, double kick
  b.placeUnder({ pattern: drumPat("X X X X X X X X", 0, 2),  underHarmonicSpan: moon[4], track: drumTrack, register: 2, velocity: 115 }); // 8th kicks
  b.placeUnder({ pattern: drumPat("X . X . X . X .", 1, 3),  underHarmonicSpan: moon[4], track: drumTrack, register: 3, velocity: 115 }); // crashes on every beat
  b.placeUnder({ pattern: drumPat(". X . X . X . X", 2, 2),  underHarmonicSpan: moon[4], track: drumTrack, register: 2, velocity: 110 }); // snare on offs

  // Bar 46: tom flurry across the kit
  b.placeUnder({ pattern: drumPat("X . . . . . . .", 0, 2),                                       underHarmonicSpan: moon[5], track: drumTrack, register: 2, velocity: 110 });
  b.placeUnder({ pattern: drumPat("X x X x . . . . . . . . . . . .", 2, 3),                       underHarmonicSpan: moon[5], track: drumTrack, register: 3, velocity: 110 });
  b.placeUnder({ pattern: drumPat(". . . . X x X x . . . . . . . .", 11, 2),                      underHarmonicSpan: moon[5], track: drumTrack, register: 2, velocity: 105 });
  b.placeUnder({ pattern: drumPat(". . . . . . . . X x X x . . . .", 9, 2),                       underHarmonicSpan: moon[5], track: drumTrack, register: 2, velocity: 100 });
  b.placeUnder({ pattern: drumPat(". . . . . . . . . . . . X x X x", 7, 2),                       underHarmonicSpan: moon[5], track: drumTrack, register: 2, velocity: 100 });

  // Bar 47: galloping kick + ghost snares
  b.placeUnder({ pattern: drumPat("X x x X x x X x x X x x", 0, 2),  underHarmonicSpan: moon[6], track: drumTrack, register: 2, velocity: 115 });
  b.placeUnder({ pattern: drumPat(". X . . X . . X . . X .", 2, 2),  underHarmonicSpan: moon[6], track: drumTrack, register: 2, velocity: 105 });

  // Bar 48: half-bar setup, then huge fill
  b.placeUnder({ pattern: drumPat("X . . . . . . .", 0, 2),                                       underHarmonicSpan: moon[7], track: drumTrack, register: 2, velocity: 110 });
  b.placeUnder({ pattern: drumPat(". . . . X x X x X x X x X x X x", 2, 2),                       underHarmonicSpan: moon[7], track: drumTrack, register: 2, velocity: 100 });
  b.placeUnder({ pattern: drumPat(". . . . . . . . . . . . . . . X", 1, 3),                       underHarmonicSpan: moon[7], track: drumTrack, register: 3, velocity: 125 }); // final crash into

  // Bar 49: heaviest hit — full crash, kick, snare on every beat
  b.placeUnder({ pattern: drumPat("X X X X", 0, 2),  underHarmonicSpan: moon[8], track: drumTrack, register: 2, velocity: 120 });
  b.placeUnder({ pattern: drumPat("X X X X", 2, 2),  underHarmonicSpan: moon[8], track: drumTrack, register: 2, velocity: 115 });
  b.placeUnder({ pattern: drumPat("X X X X", 1, 3),  underHarmonicSpan: moon[8], track: drumTrack, register: 3, velocity: 120 });

  // Bar 50: tom roll descending with snare
  b.placeUnder({ pattern: drumPat("X . X . X . X . X . X . X . X .", 0, 3),                       underHarmonicSpan: moon[9], track: drumTrack, register: 3, velocity: 105 });
  b.placeUnder({ pattern: drumPat(". X . X . X . X . X . X . X . X", 9, 2),                       underHarmonicSpan: moon[9], track: drumTrack, register: 2, velocity: 100 });

  // Bar 51: snare gallop building energy
  b.placeUnder({ pattern: drumPat("X x x X x x X x x X x x", 2, 2),  underHarmonicSpan: moon[10], track: drumTrack, register: 2, velocity: 110 });
  b.placeUnder({ pattern: drumPat("X . . X . . X . . X . .", 0, 2),  underHarmonicSpan: moon[10], track: drumTrack, register: 2, velocity: 110 });

  // Bar 52: setup for return — accelerating snare roll
  b.placeUnder({ pattern: drumPat("X x x X x X x X x x x x x x x x", 2, 2), underHarmonicSpan: moon[11], track: drumTrack, register: 2, velocity: 95 });
  b.placeUnder({ pattern: drumPat("X . . . . . . . . . . . . . . X", 0, 2), underHarmonicSpan: moon[11], track: drumTrack, register: 2, velocity: 115 });

  // ============= BASS =============
  // Bass enters quietly at the end of drift, full from verse onward
  const bassQuiet = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X . . . . . . .", 4),
    notes: [{ kind: "chord_tone", value: 0 }],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassQuiet, underSpans: drift.slice(4), track: bassTrack, register: 2, velocity: 90 });

  // Verse + return: octave-pulse bass
  const bassPulse = b.melodicPattern({
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
  b.placeRange({ pattern: bassPulse, underSpans: [...verse, ...ret], track: bassTrack, register: 2, velocity: 105 });

  // Lift section (D major): driving octave-bass
  b.placeRange({ pattern: bassPulse, underSpans: lift,  track: bassTrack, register: 2, velocity: 115 });

  // Twist section (D Phrygian dom): syncopated bass — the Eb gets emphasized
  const bassSync = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X x . X x . X .", 4),
    notes: [
      { kind: "chord_tone",         value: 0 },
      { kind: "interval_from_prev", value: 7  },  // up to 5th
      { kind: "interval_from_prev", value: -7 },  // back to root
      { kind: "interval_from_prev", value: 12 },  // octave
      { kind: "interval_from_prev", value: -12 },
    ],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassSync, underSpans: twist, track: bassTrack, register: 2, velocity: 110 });

  // Moon climax: bass holds a pedal D — let drums own the moment
  const bassPedal = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X . . . X . . .", 4),
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 0 },
    ],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassPedal, underSpans: moon, track: bassTrack, register: 2, velocity: 95 });

  // Outro: just one held tonic
  b.placeNote({
    underHarmonicSpan: outro[0], track: bassTrack, register: 2,
    chordTone: 0, durBeats: 14, velocity: 80,
  });

  // ============= STAB =============
  // Justice-style stabs only in LIFT and TWIST — the harmonic surprise sections
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
  const stabInsts = b.placeRange({
    pattern: stabHit, underSpans: [...lift, ...twist], track: stabTrack, velocity: 90,
  });
  b.smoothVoiceLeading(stabInsts);
  for (const i of stabInsts) b.registerRange(i, 57, 76);

  // ============= LEAD =============
  // Carpenter / 70s sci-fi vibe: wide leaps, repeated stabs (distress beacon),
  // chromatic approach tones, asymmetric rhythms, lots of space.

  // VERSE: a single-note distress beacon — repeated D high in register,
  // occasionally answered by the b6 (Bb). Like a transmission pulsing.
  const beaconPulse = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.125, velMul: 1.3 },     // accent
      { at: 0.125, dur: 0.125 },
      // long rest
      { at: 0.75,  dur: 0.25, velMul: 0.9 },
    ],
    notes: [
      { kind: "scale_degree", value: 0 },   // D
      { kind: "scale_degree", value: 0 },   // D (echo)
      { kind: "scale_degree", value: 5 },   // Bb (b6 — answer)
    ],
    defaultRegister: 6,                       // way up — radio signal high
  });

  // Wider leap variant — distress, with a leap down a 7th to the F (b3)
  const beaconLeap = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,    dur: 0.25, velMul: 1.3 },
      { at: 0.5,  dur: 0.125 },
      { at: 0.75, dur: 0.25 },
    ],
    notes: [
      { kind: "scale_degree", value: 0 },   // D
      { kind: "scale_degree", value: 2 },   // F (-7 from D — wide drop)
      { kind: "scale_degree", value: 0 },   // D again
    ],
    defaultRegister: 6,
  });

  // Verse — beacon every 4 bars, leap variant on bar 7 (last of phrase)
  if (verse[2]) b.placeUnder({ pattern: beaconPulse, underHarmonicSpan: verse[2], track: leadTrack, register: 6, velocity: 100 });
  if (verse[6]) b.placeUnder({ pattern: beaconLeap,  underHarmonicSpan: verse[6], track: leadTrack, register: 6, velocity: 105 });
  if (verse[10]) b.placeUnder({ pattern: beaconPulse, underHarmonicSpan: verse[10], track: leadTrack, register: 6, velocity: 105 });
  if (verse[14]) b.placeUnder({ pattern: beaconLeap,  underHarmonicSpan: verse[14], track: leadTrack, register: 6, velocity: 110 });

  // LIFT (D major): the beacon answers with a major-third leap — F# is the bright surprise.
  // Same rhythm so the listener recognizes the motif, transformed by the mode shift.
  const liftBeacon = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,    dur: 0.25, velMul: 1.3 },
      { at: 0.5,  dur: 0.125 },
      { at: 0.625, dur: 0.125 },
      { at: 0.75, dur: 0.25 },
    ],
    notes: [
      { kind: "scale_degree", value: 0 },   // D
      { kind: "scale_degree", value: 4 },   // A (leap up a 5th)
      { kind: "scale_degree", value: 2 },   // F# (the major 3rd — the surprise)
      { kind: "scale_degree", value: 0 },   // D
    ],
    defaultRegister: 6,
  });
  for (const i of [0, 2, 4, 6]) {
    if (lift[i]) b.placeUnder({ pattern: liftBeacon, underHarmonicSpan: lift[i], track: leadTrack, register: 6, velocity: 112 });
  }

  // TWIST (D Phrygian Dom): the b2 (Eb) lead. Three semitones — Eb, D, Eb, D —
  // like a Morse code transmission with the b2-1-b2-1 oscillation.
  // Then resolves up to the major 3rd (F#) — the Phrygian dominant signature move.
  const twistTransmission = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.125, velMul: 1.3 },
      { at: 0.125, dur: 0.125 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.625, dur: 0.375, velMul: 1.2 },  // longer climactic note
    ],
    notes: [
      { kind: "scale_degree", value: 1 },   // Eb (b2)
      { kind: "scale_degree", value: 0 },   // D
      { kind: "scale_degree", value: 1 },   // Eb
      { kind: "scale_degree", value: 0 },   // D
      { kind: "scale_degree", value: 2 },   // F# (the major 3 — resolution UP)
    ],
    defaultRegister: 6,
  });
  for (const i of [0, 2, 4, 6]) {
    if (twist[i]) b.placeUnder({ pattern: twistTransmission, underHarmonicSpan: twist[i], track: leadTrack, register: 6, velocity: 115 });
  }

  // MOON: NO LEAD — drums own. Lead silent.

  // RETURN — the beacon resumes, more insistent. Add a CHROMATIC approach:
  // C# (the leading tone — not in natural minor!) approaching D, for dread.
  const returnBeacon = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,    dur: 0.125, velMul: 1.3 },
      { at: 0.125, dur: 0.125 },
      { at: 0.5,  dur: 0.125, velMul: 1.1 },
      { at: 0.625, dur: 0.125 },
      { at: 0.75,  dur: 0.25 },
    ],
    notes: [
      { kind: "scale_degree", value: 0 },   // D
      { kind: "scale_degree", value: 0 },   // D
      { kind: "fixed_pc",     value: 1 },   // C# (chromatic, leading tone — outside the scale)
      { kind: "scale_degree", value: 0 },   // D (resolution)
      { kind: "scale_degree", value: 0 },   // D held
    ],
    defaultRegister: 6,
  });
  for (const i of [0, 2, 4, 6]) {
    if (ret[i]) b.placeUnder({ pattern: returnBeacon, underHarmonicSpan: ret[i], track: leadTrack, register: 6, velocity: 110 });
  }

  // Outro: held tonic D, dying
  b.placeNote({
    underHarmonicSpan: outro[0], track: leadTrack, register: 6,
    degree: 0, durBeats: 14, velocity: 85,
  });

  return { graph: b.graph, sections: { driftS, verseS, liftS, twistS, moonS, returnS, outroS } };
}
