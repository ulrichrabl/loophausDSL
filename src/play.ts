/**
 * YOUR PLAYGROUND
 * ===============
 *
 * Edit this file to compose your own piece. Run with:
 *   npx tsx src/play.ts
 *
 * Output goes to /mnt/user-data/outputs/my_piece.mid
 *
 * The full API:
 *
 *   b.tempo(bpm)                        → tempo context
 *   b.meter(beatsPerBar, beatUnit)      → meter context
 *   b.transport(tempo, meter)           → required, once
 *   b.key(tonicPc, mode)                → key context.
 *                                          mode: 'major' | 'natural_minor' | 'harmonic_minor' | 'dorian' | 'mixolydian'
 *   b.track(name, midiChannel, opts)    → track. opts: { program?: number, isPercussion?: boolean }
 *                                          GM programs: 1 piano, 5 e.piano, 25 nylon gtr, 27 e.gtr clean,
 *                                          33 finger bass, 39 synth bass, 81 square lead, 89 warm pad
 *
 *   b.harmonicSpan({ inKey, degree, startBeats, endBeats })
 *     degree: 'i'/'ii'/'iii'/'iv'/'v'/'vi'/'vii' (minor/dim) or uppercase (major/aug)
 *
 *   b.melodicPattern({
 *     unitBeats,                        // pattern length
 *     ownRhythm: [{ at: 0..1, dur }],   // positions as fraction of unit
 *     notes: [{ kind, value }],         // one per onset
 *     defaultRegister: 2..6,
 *     transform?: 'none' | 'invert' | 'retrograde',
 *   })
 *     note kinds:
 *       'chord_tone'        : value = 0 (root), 1 (3rd), 2 (5th), 3 (7th if extended)
 *       'scale_degree'      : value = 0..6 (index into parent scale)
 *       'interval_from_prev': value = semitones from previous note
 *       'fixed_pc'          : value = absolute pitch class 0..11 (0=C, 1=C#, ..., 11=B)
 *
 *   b.placeUnder({ pattern, underHarmonicSpan, track, register?, velocity? })
 *
 *   b.smoothVoiceLeading([instanceIds...])   → chain voice-leading across these
 *   b.registerRange(instanceId, minMidi, maxMidi)  → clamp voicing to range
 *
 *   b.envelope({ parameter, startBeats, endBeats, from, to, curve })
 *   b.bindEnvelope({ envelope, targetEntity, targetParameter })
 *
 * The MIDI pitch class numbers:
 *   C=0, C#=1, D=2, D#/Eb=3, E=4, F=5, F#=6, G=7, G#/Ab=8, A=9, A#/Bb=10, B=11
 *
 * Register: 4 = middle C area. 2 = bass. 5 = melody. 6 = high.
 */

import { GraphBuilder } from "./core/graph.ts";
import { solve } from "./core/solver.ts";
import { renderMidi } from "./midi/render.ts";
import { midiToName, pcFromName } from "./core/theory.ts";

// ============================================================
//   YOUR PIECE STARTS HERE
// ============================================================

function buildMyPiece() {
  const b = new GraphBuilder();

  // --- transport ---
  const tempo = b.tempo(100);
  const meter = b.meter(4, 4);
  b.transport(tempo, meter);

  // --- key ---
  const key = b.key(pcFromName("D"), "dorian");   // try changing this!

  // --- tracks ---
  const melody = b.track("melody", 1, { program: 5 });
  const bass   = b.track("bass",   2, { program: 33 });
  const pad    = b.track("pad",    3, { program: 89 });

  // --- progression: i - IV - i - VII (Dorian vamp) ---
  // (try changing the degrees or adding more)
  const h1 = b.harmonicSpan({ inKey: key, degree: "i",   startBeats: 0,  endBeats: 4  });
  const h2 = b.harmonicSpan({ inKey: key, degree: "IV",  startBeats: 4,  endBeats: 8  });
  const h3 = b.harmonicSpan({ inKey: key, degree: "i",   startBeats: 8,  endBeats: 12 });
  const h4 = b.harmonicSpan({ inKey: key, degree: "VII", startBeats: 12, endBeats: 16 });
  const spans = [h1, h2, h3, h4];

  // --- a motif: chord tones in syncopated rhythm ---
  // (try changing the rhythm or the chord tone indices)
  const motif = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.5 },
      { at: 0.5,   dur: 0.25 },
      { at: 0.75,  dur: 0.25 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 1 },
    ],
    defaultRegister: 5,
  });

  for (const h of spans) {
    b.placeUnder({ pattern: motif, underHarmonicSpan: h, track: melody });
  }

  // --- bass: root pulse ---
  const bassPulse = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,    dur: 0.5 },
      { at: 0.5,  dur: 0.5 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 0 },
    ],
    defaultRegister: 2,
  });

  for (const h of spans) {
    b.placeUnder({ pattern: bassPulse, underHarmonicSpan: h, track: bass });
  }

  // --- pad: voice-led triads ---
  const triad = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0, dur: 1 }, { at: 0, dur: 1 }, { at: 0, dur: 1 }],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 4,
  });

  const padInsts = spans.map(h =>
    b.placeUnder({ pattern: triad, underHarmonicSpan: h, track: pad, velocity: 60 })
  );
  b.smoothVoiceLeading(padInsts);
  for (const inst of padInsts) {
    b.registerRange(inst, 55, 79);  // G3 to G5
  }

  return b.graph;
}

// ============================================================
//   RUNNER (don't usually need to edit below)
// ============================================================

const g = buildMyPiece();
const r = solve(g);

console.log("\n  Harmonic skeleton:");
for (const h of r.harmonicSummary) {
  console.log(`    ${h.degree.padEnd(4)} -> ${h.root.padEnd(3)} [${h.tones.join(" ")}]  (${h.function})`);
}
console.log("\n  Voicings:");
for (const [instId, midis] of r.instanceVoicings) {
  console.log(`    ${instId.padEnd(10)}: [${midis.map(midiToName).join(" ")}]`);
}
console.log(`\n  Voice-leading motion: ${r.totalVoiceLeadingMotion} semitones`);
console.log(`  Events: ${r.events.length}\n`);

renderMidi(g, r, "/mnt/user-data/outputs/my_piece.mid");
console.log("  MIDI: /mnt/user-data/outputs/my_piece.mid\n");
