/**
 * "Apsis" — 64 bars at 80 BPM, ~3:12.
 *
 * A piece about patience. A three-note motif recurring across two key
 * centers (F# minor → A minor → F# minor), patient enough that when
 * it returns home in the final section it means something.
 *
 * Structure (16 bars each, four 4-bar chord cycles per section):
 *   APOGEE   1-16  F# minor.  Pad + bass only. No melody, no drums.
 *   DRIFT   17-32  F# minor.  Felt synth enters with the motif.
 *   TRANSIT 33-48  A MINOR.   Modulation up a minor third. Drums enter
 *                              at half-time. The motif sounds new.
 *   PERIGEE 49-64  F# minor.  Return. Motif arrives home, full arrangement.
 *
 * Same progression shape across both keys: i bVI bIII bVII (4 bars per chord).
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import { defineWobbleBass, defineWarmPad, defineFeltSynth } from "../instruments/library.ts";

export function buildApsis() {
  const b = new GraphBuilder();
  b.transport(b.tempo(80), b.meter(4, 4), { swing: 0 });

  const fSharpMinor = b.key(pcFromName("F#"), "natural_minor");
  const aDorian     = b.key(pcFromName("A"),  "dorian");          // Dorian — raised 6th gives the major IV that's the "lift"

  const bassSynth = defineWobbleBass(b);
  const padSynth  = defineWarmPad(b);
  const feltSynth = defineFeltSynth(b);

  const drumTrack = b.track("drums", 10, { program: 1, isPercussion: true });
  const bassTrack = b.track("bass",  2,  { instrument: bassSynth });
  const padTrack  = b.track("pad",   4,  { instrument: padSynth  });
  const leadTrack = b.track("lead",  5,  { instrument: feltSynth });

  // ============= HARMONIC SKELETON =============
  // beatsPerStep = 4 means 1 chord per bar; "i*4" then means 4 bars of i.
  // Each section is 16 bars total = 4 chords of 4 bars each.
  const apogee  = b.progression({ inKey: fSharpMinor, pattern: "i*4 VI*4 III*4 VII*4", startBeats: 0,   beatsPerStep: 4 });
  const drift   = b.progression({ inKey: fSharpMinor, pattern: "i*4 VI*4 III*4 VII*4", startBeats: 64,  beatsPerStep: 4 });
  const transit = b.progression({ inKey: aDorian,     pattern: "i*4 IV*4 III*4 VII*4", startBeats: 128, beatsPerStep: 4 });
  const perigee = b.progression({ inKey: fSharpMinor, pattern: "i*4 VI*4 III*4 VII*4", startBeats: 192, beatsPerStep: 4 });

  const allSpans = [...apogee, ...drift, ...transit, ...perigee];

  // ============= PAD (whole piece) =============
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
  const padInsts = b.placeRange({ pattern: padPat, underSpans: allSpans, track: padTrack, velocity: 60 });
  b.smoothVoiceLeading(padInsts);
  for (const i of padInsts) b.registerRange(i, 57, 79);

  // Pad gain — quiet start, slow build, sustain, gentle fade
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 0, endBeats: 64, from: 0.18, to: 0.55, curve: "linear" }),
    targetEntity: padTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 240, endBeats: 256, from: 0.55, to: 0.1, curve: "linear" }),
    targetEntity: padTrack, targetParameter: "gain",
  });

  // Pad filter — slow open through the journey out, close on return home
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 0, endBeats: 192, from: 280, to: 3500, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 240, endBeats: 256, from: 3500, to: 900, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });

  // ============= BASS =============
  // Two breath-points per 4-bar chord: attack on the chord change, gentler
  // attack at the midpoint. Very low register, deep.
  const bassBreath = b.melodicPattern({
    unitBeats: 16,
    ownRhythm: [
      { at: 0,    dur: 0.5, velMul: 1.0 },
      { at: 0.5,  dur: 0.5, velMul: 0.65 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 0 },
    ],
    defaultRegister: 2,
  });

  // Bass enters at bar 5 (apogee[4]) — leave the first chord empty for breath
  for (const s of [apogee[4], apogee[8], apogee[12]]) {
    b.placeUnder({ pattern: bassBreath, underHarmonicSpan: s, track: bassTrack, register: 2, velocity: 70 });
  }
  // Drift / Transit / Perigee: bass under every chord change
  for (let i = 0; i < drift.length;   i += 4) b.placeUnder({ pattern: bassBreath, underHarmonicSpan: drift[i],   track: bassTrack, register: 2, velocity: 80 });
  for (let i = 0; i < transit.length; i += 4) b.placeUnder({ pattern: bassBreath, underHarmonicSpan: transit[i], track: bassTrack, register: 2, velocity: 90 });
  for (let i = 0; i < perigee.length; i += 4) {
    const vel = i < 12 ? 90 : 75;
    b.placeUnder({ pattern: bassBreath, underHarmonicSpan: perigee[i], track: bassTrack, register: 2, velocity: vel });
  }

  // Bass gain fade-in
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 16, endBeats: 64, from: 0.15, to: 0.85, curve: "linear" }),
    targetEntity: bassTrack, targetParameter: "gain",
  });

  // ============= THE MOTIF =============
  // Three notes. The motif spans 4 chords (16 bars). One note per chord,
  // held for 2 bars, with 2 bars of breath. Same shape, different keys.
  //
  //   chord 1: scale_degree 0  (tonic)    → F# in F#m, A in Am
  //   chord 2: scale_degree 4  (5th)      → C# in F#m, E in Am
  //   chord 3: scale_degree 2  (b3)       → A in F#m,  C in Am
  //   chord 4: scale_degree 0  (tonic)    → F# in F#m, A in Am

  const noteTonic = b.melodicPattern({
    unitBeats: 16,
    ownRhythm: [{ at: 0, dur: 0.5, velMul: 1.0 }],
    notes: [{ kind: "scale_degree", value: 0 }],
    defaultRegister: 5,
  });
  const noteFifth = b.melodicPattern({
    unitBeats: 16,
    ownRhythm: [{ at: 0, dur: 0.5, velMul: 1.0 }],
    notes: [{ kind: "scale_degree", value: 4 }],
    defaultRegister: 5,
  });
  const noteThird = b.melodicPattern({
    unitBeats: 16,
    ownRhythm: [{ at: 0, dur: 0.5, velMul: 1.0 }],
    notes: [{ kind: "scale_degree", value: 2 }],
    defaultRegister: 5,
  });

  // APOGEE: no motif. (The piece breathes for 16 bars first.)

  // DRIFT: motif enters quietly. Place the four notes on the first bar of each chord cycle.
  b.placeUnder({ pattern: noteTonic, underHarmonicSpan: drift[0],  track: leadTrack, register: 5, velocity: 75 });
  b.placeUnder({ pattern: noteFifth, underHarmonicSpan: drift[4],  track: leadTrack, register: 5, velocity: 78 });
  b.placeUnder({ pattern: noteThird, underHarmonicSpan: drift[8],  track: leadTrack, register: 5, velocity: 80 });
  b.placeUnder({ pattern: noteTonic, underHarmonicSpan: drift[12], track: leadTrack, register: 5, velocity: 75 });

  // TRANSIT: motif transposed — same scale degrees in A minor sound as A, E, C, A.
  b.placeUnder({ pattern: noteTonic, underHarmonicSpan: transit[0],  track: leadTrack, register: 5, velocity: 85 });
  b.placeUnder({ pattern: noteFifth, underHarmonicSpan: transit[4],  track: leadTrack, register: 5, velocity: 88 });
  b.placeUnder({ pattern: noteThird, underHarmonicSpan: transit[8],  track: leadTrack, register: 5, velocity: 90 });
  b.placeUnder({ pattern: noteTonic, underHarmonicSpan: transit[12], track: leadTrack, register: 5, velocity: 85 });

  // PERIGEE: motif comes HOME. Same notes as Drift but now context is loaded
  // with the journey out and back. Louder, fuller.
  b.placeUnder({ pattern: noteTonic, underHarmonicSpan: perigee[0],  track: leadTrack, register: 5, velocity: 95 });
  b.placeUnder({ pattern: noteFifth, underHarmonicSpan: perigee[4],  track: leadTrack, register: 5, velocity: 98 });
  b.placeUnder({ pattern: noteThird, underHarmonicSpan: perigee[8],  track: leadTrack, register: 5, velocity: 100 });
  // Final tonic — held longer than the others, the resolution.
  // Doubled at the octave above: the voice splits in two at the arrival.
  // SWELL ENVELOPES on both: the final note breathes into existence, blooms,
  // then fades — instead of triggering at fixed velocity and decaying flatly.
  const finalRoot = b.placeNote({
    underHarmonicSpan: perigee[12], track: leadTrack, register: 5,
    degree: 0, durBeats: 14, velocity: 95,
  });
  b.noteEnvelope({ instance: finalRoot, shape: "swell" });

  const finalOctave = b.placeNote({
    underHarmonicSpan: perigee[12], track: leadTrack, register: 6,
    degree: 0, durBeats: 14, velocity: 80,
  });
  b.noteEnvelope({ instance: finalOctave, shape: "swell" });

  // Lead gain — a slight swell across drift and into transit
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 64, endBeats: 128, from: 0.5, to: 0.85, curve: "linear" }),
    targetEntity: leadTrack, targetParameter: "gain",
  });

  // ============= DRUMS =============
  // Drums ONLY in transit and perigee. Half-time, very restrained.
  // Kick on beat 1, soft closed hi-hat on quarter-note offbeats. No snare —
  // a backbeat would break the spell.

  const halfTimeKick = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0, dur: 0.2, velMul: 1.1 }],
    notes: [{ kind: "fixed_pc", value: 0 }],   // kick (MIDI 36 via pc 0 reg 2)
    defaultRegister: 2,
  });
  const softHat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0.25, dur: 0.15, velMul: 0.7 },
      { at: 0.5,  dur: 0.15, velMul: 0.7 },
      { at: 0.75, dur: 0.15, velMul: 0.7 },
    ],
    notes: [
      { kind: "fixed_pc", value: 6 }, { kind: "fixed_pc", value: 6 }, { kind: "fixed_pc", value: 6 },
    ],
    defaultRegister: 2,
  });

  // Transit: kick every 2 bars (half-time), hat from bar 5 of transit
  for (let i = 0; i < transit.length; i += 2) {
    b.placeUnder({ pattern: halfTimeKick, underHarmonicSpan: transit[i], track: drumTrack, register: 2, velocity: 85 });
  }
  for (let i = 4; i < transit.length; i++) {
    b.placeUnder({ pattern: softHat, underHarmonicSpan: transit[i], track: drumTrack, register: 2, velocity: 55 });
  }

  // Perigee: kick every bar (full time, but still soft), hat throughout
  for (let i = 0; i < perigee.length; i++) {
    if (i < 12) {
      b.placeUnder({ pattern: halfTimeKick, underHarmonicSpan: perigee[i], track: drumTrack, register: 2, velocity: 95 });
    }
    b.placeUnder({ pattern: softHat, underHarmonicSpan: perigee[i], track: drumTrack, register: 2, velocity: 55 });
  }
  // Drum gain — fade in at start of transit, fade out across final 4 bars
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 128, endBeats: 144, from: 0.2, to: 0.85, curve: "linear" }),
    targetEntity: drumTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 240, endBeats: 256, from: 0.85, to: 0.0, curve: "linear" }),
    targetEntity: drumTrack, targetParameter: "gain",
  });

  return { graph: b.graph };
}
