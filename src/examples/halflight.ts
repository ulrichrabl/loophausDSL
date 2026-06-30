/**
 * "Halflight" — 32 bars, C# minor → C# Dorian → C# minor.
 *
 * Demonstrates:
 *   - b.section(name, spans)           — named ranges
 *   - b.placeVarying({vary})           — hat fills + probabilistic variation
 *   - track.gain envelope bindings     — real fade-ins/outs
 *   - Sections and gain envelopes work together cleanly
 *
 * Structure (8 bars each):
 *   intro  (1-8) : pad fades in, kick enters bar 5, drums build
 *   verse  (9-16): full groove + lead melody phrase A
 *   bridge (17-24): MODE SHIFT to C# Dorian (brighter), stabs enter, phrase B
 *   outro  (25-32): back to C# minor; drums drop out; pad alone; pad filter closes
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import { defineWobbleBass, defineSupersawLead, defineWarmPad, defineClavinetStab } from "../instruments/library.ts";

export function buildHalflight() {
  const b = new GraphBuilder();

  // 92 BPM with subtle swing
  b.transport(b.tempo(92), b.meter(4, 4), { swing: 0.22 });

  // Two key contexts on the same tonic
  const keyMinor  = b.key(pcFromName("C#"), "natural_minor");  // C# minor
  const keyDorian = b.key(pcFromName("C#"), "dorian");          // C# Dorian (raises 6th)

  // Define instruments as audio-graph compositions, then bind to tracks.
  const bassSynth = defineWobbleBass(b);
  const leadSynth = defineSupersawLead(b);
  const padSynth  = defineWarmPad(b);
  const stabSynth = defineClavinetStab(b);

  // Tracks
  const drumTrack = b.track("drums", 10, { program: 26, isPercussion: true });
  const bassTrack = b.track("bass",  2,  { instrument: bassSynth });
  const stabTrack = b.track("stab",  3,  { instrument: stabSynth });
  const padTrack  = b.track("pad",   4,  { instrument: padSynth });
  const leadTrack = b.track("lead",  5,  { instrument: leadSynth });

  // ============= PROGRESSIONS via mini-notation =============
  // Intro (8 bars): i bVI VII i × 2
  const introSpans  = b.progression({
    inKey: keyMinor,
    pattern: "i VI VII i i VI VII i",
    startBeats: 0,
  });

  // Verse (8 bars): same shape
  const verseSpans  = b.progression({
    inKey: keyMinor,
    pattern: "i VI VII i i VI VII i",
    startBeats: 32,
  });

  // Bridge (8 bars) — same chord SHAPES (i bVI VII i) but in Dorian
  //   The Dorian gives a different color even on identical degree names
  //   because the parent scale differs (D# vs D as 6th)
  const bridgeSpans = b.progression({
    inKey: keyDorian,
    pattern: "i IV VII i i IV VII i",   // using IV (major in Dorian — the brightness)
    startBeats: 64,
  });

  // Outro (8 bars): back to minor, resolving descent
  const outroSpans  = b.progression({
    inKey: keyMinor,
    pattern: "i VII VI v i VII VI i",
    startBeats: 96,
  });

  // ============= SECTIONS — named, not magic indices =============
  const intro  = b.section("intro",  introSpans);
  const verse  = b.section("verse",  verseSpans);
  const bridge = b.section("bridge", bridgeSpans);
  const outro  = b.section("outro",  outroSpans);
  const allSpans = [...introSpans, ...verseSpans, ...bridgeSpans, ...outroSpans];

  // ============= PAD: plays the whole piece, with volume + filter envelopes =============
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
  for (const inst of padInsts) b.registerRange(inst, 57, 79);

  // Pad volume fades up across intro (gain envelope on the pad track itself)
  const padFadeIn = b.envelope({
    parameter: "gain",
    startBeats: 0, endBeats: 16,       // bars 1-4 ramp up
    from: 0.05, to: 0.55, curve: "linear",
  });
  b.bindEnvelope({ envelope: padFadeIn, targetEntity: padTrack, targetParameter: "gain" });

  // Pad volume held through verse/bridge, then fades for outro (last 8 bars)
  const padFadeOut = b.envelope({
    parameter: "gain",
    startBeats: 96, endBeats: 128,
    from: 0.55, to: 0.18, curve: "linear",
  });
  b.bindEnvelope({ envelope: padFadeOut, targetEntity: padTrack, targetParameter: "gain" });

  // Filter sweep: opens through intro+verse+bridge, closes through outro
  const filterOpen = b.envelope({
    parameter: "filter.cutoff",
    startBeats: 0, endBeats: 96,
    from: 320, to: 4000, curve: "exp",
  });
  b.bindEnvelope({ envelope: filterOpen, targetEntity: padTrack, targetParameter: "filter.cutoff" });

  const filterClose = b.envelope({
    parameter: "filter.cutoff",
    startBeats: 96, endBeats: 128,
    from: 4000, to: 600, curve: "exp",
  });
  b.bindEnvelope({ envelope: filterClose, targetEntity: padTrack, targetParameter: "filter.cutoff" });

  // ============= DRUMS =============
  // Kick: enters at bar 5 (intro mid), full through verse+bridge, drops in outro until bar 29
  const kickPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X x x x", 4),
    notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }),
    defaultRegister: 2,
  });
  // Kick from bar 5 to bar 24 (intro:5-8, verse:9-16, bridge:17-24)
  b.placeRange({ pattern: kickPat, underSpans: [...intro.spans.slice(4), ...verse.spans, ...bridge.spans],
    track: drumTrack, register: 2, velocity: 108 });
  // Outro: drums silent bars 25-28, return for the last 4 bars
  b.placeRange({ pattern: kickPat, underSpans: outro.spans.slice(4),
    track: drumTrack, register: 2, velocity: 100 });

  // Hi-hats with VARIATION — most bars normal, every 4th bar a fill, occasional ghost notes
  const hatNormal = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("x X x X x X x X", 4),
    notes: Array(8).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  const hatFill = b.melodicPattern({
    unitBeats: 4,
    // Densify into 16ths on beat 4 to suggest a fill leading into the next bar
    ownRhythm: b.rhythmMini("x X x X x X X X X X X X", 4),
    notes: Array(12).fill({ kind: "fixed_pc" as const, value: 6 }),
    defaultRegister: 2,
  });
  // placeVarying: most bars normal, every 4th bar gets a fill
  const hatBars = [...verse.spans, ...bridge.spans];   // hats during verse+bridge
  b.placeVarying({
    default: hatNormal,
    underSpans: hatBars,
    track: drumTrack,
    register: 2,
    velocity: 60,
    vary: [
      { every: 4, use: hatFill, offset: 3 },    // bars 4, 8, 12, 16 of the run = fills
    ],
  });

  // Snare on 2 and 4 throughout verse+bridge
  const snarePat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini(". x . x", 4),
    notes: Array(2).fill({ kind: "fixed_pc" as const, value: 2 }),
    defaultRegister: 2,
  });
  b.placeRange({ pattern: snarePat, underSpans: [...verse.spans, ...bridge.spans],
    track: drumTrack, register: 2, velocity: 95 });
  // Return for last 4 bars
  b.placeRange({ pattern: snarePat, underSpans: outro.spans.slice(4),
    track: drumTrack, register: 2, velocity: 88 });

  // ============= BASS =============
  // Bass enters at verse (bar 9), runs through outro
  const bassGroove = b.melodicPattern({
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
  b.placeRange({ pattern: bassGroove, underSpans: [...verse.spans, ...bridge.spans],
    track: bassTrack, register: 2, velocity: 100 });
  // Sparser bass in outro — let it breathe
  const bassOutro = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: b.rhythmMini("X . . . X . . .", 4),
    notes: [{ kind: "chord_tone", value: 0 }, { kind: "chord_tone", value: 0 }],
    defaultRegister: 2,
  });
  b.placeRange({ pattern: bassOutro, underSpans: outro.spans,
    track: bassTrack, register: 2, velocity: 85 });

  // Bass fades in at start of verse
  const bassFadeIn = b.envelope({
    parameter: "gain",
    startBeats: 32, endBeats: 40,        // bars 9-10
    from: 0.05, to: 0.9, curve: "linear",
  });
  b.bindEnvelope({ envelope: bassFadeIn, targetEntity: bassTrack, targetParameter: "gain" });

  // ============= STAB (bridge only — the mode shift reveal) =============
  const stabPat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0.375, dur: 0.1, velMul: 1.1 }, { at: 0.375, dur: 0.1 }, { at: 0.375, dur: 0.1 },
      { at: 0.875, dur: 0.1, velMul: 1.1 }, { at: 0.875, dur: 0.1 }, { at: 0.875, dur: 0.1 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 }, { kind: "chord_tone", value: 1 }, { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 0 }, { kind: "chord_tone", value: 1 }, { kind: "chord_tone", value: 2 },
    ],
    defaultRegister: 4,
  });
  const stabInsts = b.placeRange({ pattern: stabPat, underSpans: bridge.spans, track: stabTrack, velocity: 85 });
  b.smoothVoiceLeading(stabInsts);
  for (const inst of stabInsts) b.registerRange(inst, 57, 76);

  // Stab fades in over the first 2 bars of bridge — gentle entry
  const stabFadeIn = b.envelope({
    parameter: "gain",
    startBeats: 64, endBeats: 72,
    from: 0.05, to: 0.55, curve: "linear",
  });
  b.bindEnvelope({ envelope: stabFadeIn, targetEntity: stabTrack, targetParameter: "gain" });

  // ============= LEAD =============
  // Phrase A: in verse
  const phraseA = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.25, velMul: 1.15 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,   dur: 0.5 },
    ],
    notes: [
      { kind: "scale_degree", value: 0 },   // C# (tonic)
      { kind: "scale_degree", value: 2 },   // E (b3 in minor)
      { kind: "scale_degree", value: 4 },   // G# (5th)
      { kind: "scale_degree", value: 2 },   // E (back to 3rd)
    ],
    defaultRegister: 5,
  });
  // Place on bars 1, 3, 5, 7 of verse (every other bar)
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: verse.spans[0], track: leadTrack, register: 5, velocity: 95 });
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: verse.spans[2], track: leadTrack, register: 5, velocity: 100 });
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: verse.spans[4], track: leadTrack, register: 5, velocity: 102 });
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: verse.spans[6], track: leadTrack, register: 5, velocity: 105 });

  // Phrase B in bridge — extends the theme by adding a passing tone
  const phraseB = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0,     dur: 0.25, velMul: 1.15 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.375, dur: 0.125 },
      { at: 0.5,   dur: 0.25 },
      { at: 0.75,  dur: 0.25 },
    ],
    notes: [
      { kind: "scale_degree", value: 0 },
      { kind: "scale_degree", value: 2 },
      { kind: "scale_degree", value: 4 },
      { kind: "scale_degree", value: 5 },   // 6th — the Dorian-bright note (D# in C# Dorian)!
      { kind: "scale_degree", value: 4 },
    ],
    defaultRegister: 5,
  });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: bridge.spans[0], track: leadTrack, register: 5, velocity: 105 });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: bridge.spans[2], track: leadTrack, register: 5, velocity: 108 });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: bridge.spans[4], track: leadTrack, register: 5, velocity: 110 });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: bridge.spans[6], track: leadTrack, register: 5, velocity: 112 });

  // Outro: single held tonic, far back (low velocity)
  b.placeNote({
    underHarmonicSpan: outro.spans[3],
    track: leadTrack, register: 5, durBeats: 3.5,
    degree: 0, velocity: 80,
  });
  // Final resolution — held tonic on last bar
  b.placeNote({
    underHarmonicSpan: outro.spans[7],
    track: leadTrack, register: 5, durBeats: 3.5,
    degree: 0, velocity: 90,
  });

  return { graph: b.graph, sections: { intro, verse, bridge, outro } };
}
