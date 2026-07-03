/**
 * modulation_demo — C minor → G minor via dominant pivot.
 *
 * Demonstrates first-class key modulation (not just mode shift on same tonic):
 *   bars 1-4  : C natural minor progression
 *   bar 5     : pivot on V (G major) — dominant of the new key
 *   bars 6-8  : G natural minor progression
 *
 * The same pad voicing pattern continues across the boundary; cross-key
 * voice-leading uses the declared Modulation relationship.
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import { defineWarmPad, defineWobbleBass } from "../instruments/library.ts";

export function buildModulationDemo() {
  const b = new GraphBuilder();

  b.transport(b.tempo(92), b.meter(4, 4), { swing: 0.12 });

  const keyCm = b.key(pcFromName("C"), "natural_minor");
  const keyGm = b.key(pcFromName("G"), "natural_minor");

  const padSynth = defineWarmPad(b);
  const bassSynth = defineWobbleBass(b);

  const padTrack = b.track("pad", 4, { instrument: padSynth });
  const bassTrack = b.track("bass", 2, { instrument: bassSynth });
  const drumTrack = b.track("drums", 10, { isPercussion: true });

  const sectionA = b.progression({
    inKey: keyCm,
    pattern: "i VI III VII",
    startBeats: 0,
  });

  const { modulation, pivotSpan } = b.modulateWithPivot({
    fromKey: keyCm,
    toKey: keyGm,
    atBeats: 16,
    method: "dominant",
    pivotDegree: "V",
    pivotBeats: 4,
  });

  const sectionB = b.progression({
    inKey: keyGm,
    pattern: "i VI III VII",
    startBeats: 20,
  });

  const allSpans = [...sectionA, pivotSpan, ...sectionB];

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
    pattern: padPat,
    underSpans: allSpans,
    track: padTrack,
    velocity: 58,
  });
  b.smoothVoiceLeading(padInsts);
  for (const inst of padInsts) b.registerRange(inst, 55, 79);

  const bassPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X . . . X . . .", 4),
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 0 },
    ],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassPat, underSpans: allSpans, track: bassTrack, register: 2, velocity: 95 });

  const kickPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X x x x", 4),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: kickPat, underSpans: allSpans, track: drumTrack, register: 2, velocity: 105 });

  return {
    graph: b.graph,
    modulation,
    sections: { c_minor: sectionA, pivot: pivotSpan, g_minor: sectionB },
  };
}
