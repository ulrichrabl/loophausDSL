/**
 * bridge_demo — 8-bar A+B integration piece.
 *
 * Every pitched track uses an instrument graph (no legacy voiceXxx() path).
 * Drums stay procedural. Demonstrates mode shift minor → Dorian in one pass.
 *
 *   bars 1-4 : C# minor groove (pad, bass, drums, lead enters bar 3)
 *   bars 5-8 : C# Dorian bridge (stabs enter, brighter IV chord)
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import {
  defineWobbleBass,
  defineSupersawLead,
  defineWarmPad,
  defineClavinetStab,
} from "../instruments/library.ts";

export function buildBridgeDemo() {
  const b = new GraphBuilder();

  b.transport(b.tempo(100), b.meter(4, 4), { swing: 0.15 });

  const keyMinor = b.key(pcFromName("C#"), "natural_minor");
  const keyDorian = b.key(pcFromName("C#"), "dorian");

  const bassSynth = defineWobbleBass(b);
  const leadSynth = defineSupersawLead(b);
  const padSynth = defineWarmPad(b);
  const stabSynth = defineClavinetStab(b);

  const drumTrack = b.track("drums", 10, { isPercussion: true });
  const bassTrack = b.track("bass", 2, { instrument: bassSynth });
  const padTrack = b.track("pad", 4, { instrument: padSynth });
  const leadTrack = b.track("lead", 5, { instrument: leadSynth });
  const stabTrack = b.track("stab", 3, { instrument: stabSynth });

  const verseSpans = b.progression({
    inKey: keyMinor,
    pattern: "i VI VII i",
    startBeats: 0,
  });
  const bridgeSpans = b.progression({
    inKey: keyDorian,
    pattern: "i IV VII i",
    startBeats: 16,
  });
  const verse = b.section("verse", verseSpans);
  const bridge = b.section("bridge", bridgeSpans);
  const allSpans = [...verseSpans, ...bridgeSpans];

  // Pad — whole piece
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
  const padInsts = b.placeRange({ pattern: padPat, underSpans: allSpans, track: padTrack, velocity: 58 });
  b.smoothVoiceLeading(padInsts);
  for (const inst of padInsts) b.registerRange(inst, 57, 79);

  const padFadeIn = b.envelope({
    parameter: "gain", startBeats: 0, endBeats: 8, from: 0.05, to: 0.5, curve: "linear",
  });
  b.bindEnvelope({ envelope: padFadeIn, targetEntity: padTrack, targetParameter: "gain" });

  const filterOpen = b.envelope({
    parameter: "filter.cutoff", startBeats: 0, endBeats: 24, from: 400, to: 3500, curve: "exp",
  });
  b.bindEnvelope({ envelope: filterOpen, targetEntity: padTrack, targetParameter: "filter.cutoff" });

  // Sidechain — explicit in graph
  b.sidechain({ trigger: drumTrack, ducks: [bassTrack, padTrack], amount: 0.3, releaseMs: 160 });

  // Drums
  const kickPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X x x x", 4),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: kickPat, underSpans: allSpans, track: drumTrack, register: 2, velocity: 110 });

  const hatPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x X x X x X x X", 4),
    notes: Array(8).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: hatPat, underSpans: allSpans, track: drumTrack, register: 2, velocity: 55 });

  const snarePat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini(". x . x", 4),
    notes: [{ kind: "fixed_pc", value: 2 }, { kind: "fixed_pc", value: 2 }],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: snarePat, underSpans: allSpans, track: drumTrack, register: 2, velocity: 92 });

  // Bass — verse + bridge
  const bassGroove = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X . x . X . x .", 4),
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "interval_from_prev", value: 12 },
      { kind: "chord_tone", value: 0 },
      { kind: "interval_from_prev", value: 12 },
    ],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassGroove, underSpans: allSpans, track: bassTrack, register: 2, velocity: 98 });

  // Lead — verse bars 3-4 + bridge
  const leadMotif = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0, dur: 0.5 }, { at: 0.5, dur: 0.25 }, { at: 0.75, dur: 0.25 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 1 },
    ],
    defaultRegister: 5,
  });
  b.placeRange({ pattern: leadMotif, underSpans: [...verse.spans.slice(2), ...bridge.spans],
    track: leadTrack, register: 5, velocity: 92 });

  // Stabs — bridge only (mode-shift reveal)
  const stabPat = b.melodicPattern({
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
  const stabInsts = b.placeRange({ pattern: stabPat, underSpans: bridge.spans, track: stabTrack, velocity: 88 });
  b.smoothVoiceLeading(stabInsts);

  return {
    graph: b.graph,
    sections: { verse, bridge },
  };
}
