/**
 * "Strata" — 32 bars across four named sections, demonstrating:
 *   - b.section() abstraction (no more magic-index slicing)
 *   - Velocity envelopes per layer (fade-in, fade-out)
 *   - b.sidechain() declared in the graph (cleaner than implicit)
 *   - b.placeVarying() with `every` rules for organic variation
 *   - The full kernel: sections, modes, voice-leading, swing, filter sweep
 *
 * The piece: B minor, 88 BPM, gentle swing.
 *
 * Sections:
 *   intro (8 bars):    fade in. Pad + bass drone, no drums.
 *   verse (8 bars):    full groove enters. Theme stated.
 *   bridge (8 bars):   shift to Dorian (raised 6th), drums drop, stab gives way to lead.
 *   outro (8 bars):    back to minor, drums return, theme returns, fade out.
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";

export function buildStrata() {
  const b = new GraphBuilder();

  // 88 BPM, light swing
  b.transport(b.tempo(88), b.meter(4, 4), { swing: 0.25 });

  // Two key contexts: B minor and B Dorian (shared tonic, different mode)
  const keyMinor  = b.key(pcFromName("B"), "natural_minor");
  const keyDorian = b.key(pcFromName("B"), "dorian");

  // Tracks
  const drumTrack = b.track("drums", 10, { program: 26, isPercussion: true });
  const bassTrack = b.track("bass",  2,  { program: 38 });
  const stabTrack = b.track("stab",  3,  { program: 8  });
  const padTrack  = b.track("pad",   4,  { program: 91 });
  const leadTrack = b.track("lead",  5,  { program: 82 });

  // ============= SECTIONS via b.progression() + b.section() =============
  // intro: i held with subtle motion via bVI
  const introSpans = b.progression({
    inKey: keyMinor,
    pattern: "i i i i i VI i i",
    startBeats: 0,
  });
  const intro = b.section("intro", introSpans);

  // verse: classic minor lament — i bVI bVII bIII / i bVI bVII V (the V from harmonic minor)
  const verseSpans = b.progression({
    inKey: keyMinor,
    pattern: "i VI VII III i VI VII v",
    startBeats: intro.endBeats,
  });
  const verse = b.section("verse", verseSpans);

  // bridge: Dorian! Same tonic, brighter color. i-IV vamp + bVII turn
  const bridgeSpans = b.progression({
    inKey: keyDorian,
    pattern: "i IV i IV i IV VII i",
    startBeats: verse.endBeats,
  });
  const bridge = b.section("bridge", bridgeSpans);

  // outro: minor returns, descending Andalusian
  const outroSpans = b.progression({
    inKey: keyMinor,
    pattern: "i VII VI v i VI VII i",
    startBeats: bridge.endBeats,
  });
  const outro = b.section("outro", outroSpans);

  const allSpans = [...intro.spans, ...verse.spans, ...bridge.spans, ...outro.spans];

  // ============= DRUMS =============
  // No drums in intro. Full groove in verse, drop in bridge, return in outro.

  const kickPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X x x x", 4),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: kickPat, underSpans: verse.spans, track: drumTrack, register: 2, velocity: 110 });
  b.placeRange({ pattern: kickPat, underSpans: outro.spans, track: drumTrack, register: 2, velocity: 108 });

  const snarePat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini(". x . x", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 2 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: snarePat, underSpans: verse.spans, track: drumTrack, register: 2, velocity: 95 });
  b.placeRange({ pattern: snarePat, underSpans: outro.spans, track: drumTrack, register: 2, velocity: 95 });

  const hatPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x X x X x X x X", 4),
    notes: Array(8).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: hatPat, underSpans: verse.spans, track: drumTrack, register: 2, velocity: 60 });
  // Bridge: just sparse hat to keep pulse
  const hatSparse = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini(". x . x . x . x", 4),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: hatSparse, underSpans: bridge.spans, track: drumTrack, register: 2, velocity: 45 });
  b.placeRange({ pattern: hatPat, underSpans: outro.spans, track: drumTrack, register: 2, velocity: 62 });

  // ============= BASS =============
  // Intro: long sustained roots (drone)
  const bassDrone = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0, dur: 1.0 }],
    notes: [{ kind: "chord_tone", value: 0 }],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassDrone, underSpans: intro.spans, track: bassTrack, register: 2, velocity: 80 });

  // Verse: rhythmic octave bass
  const bassVerse = b.melodicPattern({
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
  b.placeRange({ pattern: bassVerse, underSpans: verse.spans, track: bassTrack, register: 2, velocity: 100 });

  // Bridge: more melodic — root, 5th, root
  const bassBridge = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X . . x X . x .", 4),
    notes: [
      { kind: "chord_tone",         value: 0 },
      { kind: "chord_tone",         value: 2 },
      { kind: "interval_from_prev", value: -7 },
      { kind: "chord_tone",         value: 0 },
    ],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassBridge, underSpans: bridge.spans, track: bassTrack, register: 2, velocity: 90 });

  // Outro: walking line for resolution
  b.placeRange({ pattern: bassVerse, underSpans: outro.spans, track: bassTrack, register: 2, velocity: 95 });

  // ============= PAD =============
  // Plays throughout — the harmonic glue
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
  const padInsts = b.placeRange({ pattern: padPat, underSpans: allSpans, track: padTrack, velocity: 50 });
  b.smoothVoiceLeading(padInsts);
  for (const inst of padInsts) b.registerRange(inst, 57, 79);

  // Pad filter sweep: closed in intro, opens through verse, peaks at bridge, closes for outro
  const sweepIn = b.envelope({
    parameter: "filter.cutoff",
    startBeats: intro.startBeats,
    endBeats: bridge.endBeats,
    from: 300, to: 4000, curve: "exp",
  });
  b.bindEnvelope({ envelope: sweepIn, targetEntity: padTrack, targetParameter: "filter.cutoff" });
  const sweepOut = b.envelope({
    parameter: "filter.cutoff",
    startBeats: outro.startBeats,
    endBeats: outro.endBeats,
    from: 4000, to: 600, curve: "exp",
  });
  b.bindEnvelope({ envelope: sweepOut, targetEntity: padTrack, targetParameter: "filter.cutoff" });

  // ============= VELOCITY ENVELOPES (the new feature!) =============
  // Pad fades in across the intro
  const padFadeIn = b.envelope({
    parameter: "velocity",
    startBeats: intro.startBeats,
    endBeats: intro.endBeats,
    from: 0.3, to: 1.0, curve: "linear",
  });
  b.bindEnvelope({ envelope: padFadeIn, targetEntity: padTrack, targetParameter: "velocity" });

  // Whole mix fades out across the outro
  // (apply to each major track)
  for (const trk of [padTrack, leadTrack, bassTrack, stabTrack]) {
    const fadeOut = b.envelope({
      parameter: "velocity",
      startBeats: outro.startBeats + 16,        // last 4 bars
      endBeats: outro.endBeats,
      from: 1.0, to: 0.2, curve: "linear",
    });
    b.bindEnvelope({ envelope: fadeOut, targetEntity: trk, targetParameter: "velocity" });
  }

  // ============= STAB — verse + bridge =============
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
  const stabInsts = b.placeRange({ pattern: stabPat, underSpans: verse.spans, track: stabTrack, velocity: 85 });
  b.smoothVoiceLeading(stabInsts);
  for (const inst of stabInsts) b.registerRange(inst, 55, 76);

  // ============= LEAD: THE THEME via placeVarying =============
  // Theme: scale degrees 4-2-0-2-4 (5th, 3rd, root, 3rd, 5th — arch shape)
  const theme = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.25, velMul: 1.2 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,   dur: 0.25 },
      { at: 0.75,  dur: 0.25 },
    ],
    notes: [
      { kind: "scale_degree", value: 4 },
      { kind: "scale_degree", value: 2 },
      { kind: "scale_degree", value: 0 },
      { kind: "scale_degree", value: 2 },
      { kind: "scale_degree", value: 4 },
    ],
    defaultRegister: 5,
  });

  // Inverted theme variant for the every-4th rule
  const themeInverted = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,    dur: 0.25 },
      { at: 0.25, dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,  dur: 0.5 },
    ],
    notes: [
      { kind: "scale_degree", value: 0 },
      { kind: "scale_degree", value: 2 },
      { kind: "scale_degree", value: 4 },
      { kind: "scale_degree", value: 2 },
    ],
    defaultRegister: 5,
    transform: "invert",
  });

  // Verse: theme on bars 1, 3, 5, 7 of verse (every other bar). Every 4th gets inverted.
  b.placeVarying({
    default: theme,
    underSpans: [verse.spans[0], verse.spans[2], verse.spans[4], verse.spans[6]],
    track: leadTrack,
    register: 5,
    velocity: 100,
    vary: [{ every: 4, use: themeInverted, offset: 3 }],   // last (4th) placement gets inverted
  });

  // Bridge: theme moved up an octave (placeVarying with register override won't work cleanly;
  // we'll just place straight). The theme over the Dorian context sounds different.
  b.placeUnder({ pattern: theme, underHarmonicSpan: bridge.spans[1], track: leadTrack, register: 5, velocity: 95 });
  b.placeUnder({ pattern: theme, underHarmonicSpan: bridge.spans[3], track: leadTrack, register: 5, velocity: 100 });
  b.placeUnder({ pattern: theme, underHarmonicSpan: bridge.spans[5], track: leadTrack, register: 5, velocity: 105 });

  // Outro: theme returns once, then resolves to held tonic
  b.placeUnder({ pattern: theme, underHarmonicSpan: outro.spans[0], track: leadTrack, register: 5, velocity: 100 });
  b.placeUnder({ pattern: theme, underHarmonicSpan: outro.spans[4], track: leadTrack, register: 5, velocity: 95 });
  // Final held tonic
  b.placeNote({
    underHarmonicSpan: outro.spans[7],
    track: leadTrack,
    register: 5,
    durBeats: 3.5,
    velocity: 90,
    degree: 0,
  });

  // ============= SIDECHAIN (declared in the graph) =============
  b.sidechain({
    trigger: drumTrack,
    ducks: [bassTrack, stabTrack, padTrack, leadTrack],
    amount: 0.30,
    releaseMs: 200,
  });

  return b.graph;
}
