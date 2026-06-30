/**
 * "Loophaus Discotheque" — Daft Punk vibes.
 *
 * 16 bars, 116 BPM, A natural minor.
 * Progression (1 bar each, repeats 4x): Am - F - C - G  (i - VI - III - VII)
 *
 * Structure:
 *   Bars 1-4   : Kick + closed hi-hat + bass groove
 *   Bars 5-8   : + snare on 2/4, clavinet stabs on offbeats, sweep pad
 *   Bars 9-12  : + lead hook (the "topline")
 *   Bars 13-16 : everything, lead elaborates
 *
 * Sounds:
 *   - Drum kit: TR-808 (GM kit 26 on channel 10)
 *   - Bass: Synth Bass 1 (GM 38)
 *   - Stab: Clavinet (GM 8) — the funky disco chord stab
 *   - Pad: Pad 3 / polysynth (GM 91)
 *   - Lead: Sawtooth Lead 2 (GM 82) — that classic Daft Punk topline tone
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import type { ScaleDegree } from "../core/types.ts";

export function buildDaftPunk() {
  const b = new GraphBuilder();

  // Transport
  const tempo = b.tempo(116);
  const meter = b.meter(4, 4);
  b.transport(tempo, meter);

  // A natural minor
  const key = b.key(pcFromName("A"), "natural_minor");

  // Tracks
  // Note: channel 10 is the GM drum channel; program selects the kit.
  const drumTrack = b.track("drums", 10, { program: 26, isPercussion: true });   // TR-808 kit
  const bassTrack = b.track("bass",  2,  { program: 38 });   // Synth Bass 1
  const stabTrack = b.track("stab",  3,  { program: 8  });   // Clavinet
  const padTrack  = b.track("pad",   4,  { program: 91 });   // Pad 3 polysynth
  const leadTrack = b.track("lead",  5,  { program: 82 });   // Lead 2 sawtooth

  // 16 bars of Am - F - C - G repeating
  const cycle: ScaleDegree[] = ["i", "VI", "III", "VII"];
  const spans = [];
  for (let bar = 0; bar < 16; bar++) {
    spans.push(b.harmonicSpan({
      inKey: key,
      degree: cycle[bar % 4],
      startBeats: bar * 4,
      endBeats: (bar + 1) * 4,
    }));
  }

  // ===== DRUMS =====
  // For GM drums on channel 10, the MIDI note IS the drum:
  //   36 = kick, 38 = snare, 42 = closed hi-hat, 46 = open hi-hat
  // We use fixed_pc with register so MIDI note lands on the right drum:
  //   pc=0, register=2 -> 36 (kick)
  //   pc=2, register=2 -> 38 (snare)
  //   pc=6, register=2 -> 42 (closed hi-hat)

  // Kick: 4-on-the-floor, all 16 bars
  const kickPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,    dur: 0.2 },
      { at: 0.25, dur: 0.2 },
      { at: 0.5,  dur: 0.2 },
      { at: 0.75, dur: 0.2 },
    ],
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }),
    defaultRegister: 2,
  });
  for (const h of spans) {
    b.placeUnder({ pattern: kickPat, underHarmonicSpan: h, track: drumTrack, register: 2, velocity: 115 });
  }

  // Closed hi-hat: 8th notes, all 16 bars
  const hihatPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: Array.from({ length: 8 }, (_, i) => ({ at: i * 0.125, dur: 0.1 })),
    notes: Array(8).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  // Slight velocity variation: stronger on the downbeats
  for (const h of spans) {
    b.placeUnder({ pattern: hihatPat, underHarmonicSpan: h, track: drumTrack, register: 2, velocity: 72 });
  }

  // Snare: on beats 2 and 4, only from bar 5 onwards
  const snarePat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0.25, dur: 0.2 },   // beat 2
      { at: 0.75, dur: 0.2 },   // beat 4
    ],
    notes: [
      { kind: "fixed_pc", value: 2 },
      { kind: "fixed_pc", value: 2 },
    ],
    defaultRegister: 2,
  });
  for (let bar = 4; bar < 16; bar++) {
    b.placeUnder({ pattern: snarePat, underHarmonicSpan: spans[bar], track: drumTrack, register: 2, velocity: 100 });
  }

  // ===== BASS =====
  // Classic disco octave bass: root low, root up an octave, alternating eighths.
  // Plays from bar 1.
  const bassPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: Array.from({ length: 8 }, (_, i) => ({ at: i * 0.125, dur: 0.11 })),
    notes: [
      { kind: "chord_tone",        value: 0 },     // root low
      { kind: "interval_from_prev", value: 12 },   // octave up
      { kind: "interval_from_prev", value: -12 },  // back down
      { kind: "interval_from_prev", value: 12 },
      { kind: "interval_from_prev", value: -12 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "interval_from_prev", value: -12 },
      { kind: "interval_from_prev", value: 12 },
    ],
    defaultRegister: 2,
  });
  for (const h of spans) {
    b.placeUnder({ pattern: bassPat, underHarmonicSpan: h, track: bassTrack, register: 2, velocity: 95 });
  }

  // ===== STABS (clavinet) =====
  // Chord on the "&" of beat 2 and "&" of beat 4. Classic disco/funk syncopation.
  // Plays from bar 5.
  const stabPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      // First stab: 3 simultaneous notes at the "&" of beat 2 (0.375)
      { at: 0.375, dur: 0.1 },
      { at: 0.375, dur: 0.1 },
      { at: 0.375, dur: 0.1 },
      // Second stab: 3 simultaneous notes at the "&" of beat 4 (0.875)
      { at: 0.875, dur: 0.1 },
      { at: 0.875, dur: 0.1 },
      { at: 0.875, dur: 0.1 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 4,
  });
  const stabInsts = [];
  for (let bar = 4; bar < 16; bar++) {
    stabInsts.push(b.placeUnder({
      pattern: stabPat, underHarmonicSpan: spans[bar], track: stabTrack, velocity: 95,
    }));
  }
  b.smoothVoiceLeading(stabInsts);
  for (const inst of stabInsts) b.registerRange(inst, 55, 76); // G3 to E5

  // ===== PAD =====
  // Sustained triad for the whole bar. Plays from bar 5.
  const padPat = b.melodicPattern({
    unitBeats: 4,
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
  const padInsts = [];
  for (let bar = 4; bar < 16; bar++) {
    padInsts.push(b.placeUnder({
      pattern: padPat, underHarmonicSpan: spans[bar], track: padTrack, velocity: 55,
    }));
  }
  b.smoothVoiceLeading(padInsts);
  for (const inst of padInsts) b.registerRange(inst, 60, 79); // C4 to G5

  // ===== LEAD =====
  // Main hook (bars 9-12): a syncopated 4-note phrase emphasizing chord tones.
  const leadHook = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.375 },  // dotted-eighth
      { at: 0.375, dur: 0.125 },  // sixteenth
      { at: 0.5,   dur: 0.25 },   // eighth
      { at: 0.75,  dur: 0.25 },   // eighth
    ],
    notes: [
      { kind: "chord_tone", value: 2 },  // 5th — sets the topline
      { kind: "chord_tone", value: 1 },  // 3rd
      { kind: "chord_tone", value: 0 },  // root
      { kind: "chord_tone", value: 1 },  // 3rd
    ],
    defaultRegister: 5,
  });
  for (let bar = 8; bar < 12; bar++) {
    b.placeUnder({
      pattern: leadHook, underHarmonicSpan: spans[bar], track: leadTrack, register: 5, velocity: 100,
    });
  }

  // Lead elaboration (bars 13-16): inverted version of the hook — descending becomes ascending,
  // which gives the climax a different shape.
  const leadElaborated = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.25 },
      { at: 0.25,  dur: 0.25 },
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
  for (let bar = 12; bar < 16; bar++) {
    b.placeUnder({
      pattern: leadElaborated, underHarmonicSpan: spans[bar], track: leadTrack, register: 5, velocity: 105,
    });
  }

  return { graph: b.graph };
}
