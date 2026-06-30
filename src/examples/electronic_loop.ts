/**
 * Example 2: Electronic loop.
 *
 * 4 bars at 120 BPM, key of C major.
 * Progression: vi - IV - I - V (Am - F - C - G), one bar each.
 *
 * Layers:
 *   - Kick on every quarter (rhythmic_pattern, no pitch)
 *   - Bass: pattern R-R-5-R (eighths) following the harmony
 *   - Pad: triad sustained per bar
 *   - Filter envelope sweeping pad cutoff (envelope binding)
 *
 * Tests:
 *   - Pure rhythmic pattern (drums)
 *   - Bass parametrically following roots
 *   - Continuous control via envelope
 *   - Multi-layer simultaneous playback
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";

export function buildElectronicLoop() {
  const b = new GraphBuilder();

  const tempo = b.tempo(120);
  const meter = b.meter(4, 4);
  b.transport(tempo, meter);

  const key = b.key(pcFromName("C"), "major");

  const drumTrack = b.track("drums", 10, { isPercussion: true });
  const bassTrack = b.track("bass", 2, { program: 39 });   // synth bass
  const padTrack  = b.track("pad",  3, { program: 89 });   // warm pad

  // Harmony: vi IV I V, 1 bar = 4 beats each
  const h1 = b.harmonicSpan({ inKey: key, degree: "vi", startBeats: 0,  endBeats: 4  });
  const h2 = b.harmonicSpan({ inKey: key, degree: "IV", startBeats: 4,  endBeats: 8  });
  const h3 = b.harmonicSpan({ inKey: key, degree: "I",  startBeats: 8,  endBeats: 12 });
  const h4 = b.harmonicSpan({ inKey: key, degree: "V",  startBeats: 12, endBeats: 16 });

  // Bass pattern: R R 5 R as eighth notes (4 onsets in a 2-beat unit)
  // Then it tiles across the 4-beat span = 8 eighth notes per bar.
  const bassPat = b.melodicPattern({
    unitBeats: 2,
    ownRhythm: [
      { at: 0,    dur: 0.25 },
      { at: 0.25, dur: 0.25 },
      { at: 0.5,  dur: 0.25 },
      { at: 0.75, dur: 0.25 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },  // root
      { kind: "chord_tone", value: 0 },  // root
      { kind: "chord_tone", value: 2 },  // fifth
      { kind: "chord_tone", value: 0 },  // root
    ],
    defaultRegister: 2,
  });

  for (const h of [h1, h2, h3, h4]) {
    b.placeUnder({ pattern: bassPat, underHarmonicSpan: h, track: bassTrack, register: 2 });
  }

  // Kick drum: GM bass drum is MIDI note 36 on channel 10 (drums).
  // We use a melodic pattern with fixed_pc=0 at register 2 → MIDI 36.
  // Quarter-note pulse per bar.
  const kickPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,    dur: 0.25 },
      { at: 0.25, dur: 0.25 },
      { at: 0.5,  dur: 0.25 },
      { at: 0.75, dur: 0.25 },
    ],
    notes: [
      { kind: "fixed_pc", value: 0 },
      { kind: "fixed_pc", value: 0 },
      { kind: "fixed_pc", value: 0 },
      { kind: "fixed_pc", value: 0 },
    ],
    defaultRegister: 2,
  });
  for (const h of [h1, h2, h3, h4]) {
    b.placeUnder({ pattern: kickPat, underHarmonicSpan: h, track: drumTrack, register: 2, velocity: 105 });
  }

  // Pad: triad sustained for full bar
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

  const padInsts = [
    b.placeUnder({ pattern: padPat, underHarmonicSpan: h1, track: padTrack, velocity: 70 }),
    b.placeUnder({ pattern: padPat, underHarmonicSpan: h2, track: padTrack, velocity: 70 }),
    b.placeUnder({ pattern: padPat, underHarmonicSpan: h3, track: padTrack, velocity: 70 }),
    b.placeUnder({ pattern: padPat, underHarmonicSpan: h4, track: padTrack, velocity: 70 }),
  ];

  b.smoothVoiceLeading(padInsts);

  // Filter sweep envelope (not audible in MIDI but data is real)
  const sweep = b.envelope({
    parameter: "filter.cutoff",
    startBeats: 0,
    endBeats: 16,
    from: 200,
    to: 8000,
    curve: "exp",
  });
  b.bindEnvelope({ envelope: sweep, targetEntity: padTrack, targetParameter: "filter.cutoff" });

  return b.graph;
}
