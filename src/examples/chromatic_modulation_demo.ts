/**
 * chromatic_modulation_demo — C major → E major via chromatic mediant.
 *
 * Roots a major third apart (C → E), pivot emphasizes shared triad tones.
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import { defineWarmPad, defineWobbleBass } from "../instruments/library.ts";

export function buildChromaticModulationDemo() {
  const b = new GraphBuilder();
  b.transport(b.tempo(88), b.meter(4, 4));

  const keyC = b.key(pcFromName("C"), "major");
  const keyE = b.key(pcFromName("E"), "major");

  const padSynth = defineWarmPad(b);
  const bassSynth = defineWobbleBass(b);
  const padTrack = b.track("pad", 4, { instrument: padSynth });
  const bassTrack = b.track("bass", 2, { instrument: bassSynth });

  const sectionA = b.progression({
    inKey: keyC,
    pattern: "I vi IV V",
    startBeats: 0,
  });

  const { pivotSpan } = b.modulateWithPivot({
    fromKey: keyC,
    toKey: keyE,
    atBeats: 16,
    method: "chromatic_mediant",
    pivotBeats: 4,
  });

  const sectionB = b.progression({
    inKey: keyE,
    pattern: "I vi IV V",
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
  const padInsts = b.placeRange({ pattern: padPat, underSpans: allSpans, track: padTrack, velocity: 55 });
  b.smoothVoiceLeading(padInsts);
  b.trackGain({ track: padTrack, shape: "fade_in", startBeats: 0, endBeats: 8 });

  const bassPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0, dur: 1 }],
    notes: [{ kind: "chord_tone", value: 0 }],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassPat, underSpans: allSpans, track: bassTrack, velocity: 90 });

  return { graph: b.graph, sections: { c_major: sectionA, e_major: sectionB } };
}
