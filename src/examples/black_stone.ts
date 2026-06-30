/**
 * "Black Stone" — slow ballad in C minor, ~3:50, 84 BPM with swing.
 *
 * The compositional ambition: harmony as the primary expressive material.
 * Every chord is a 7th chord (or richer). The melody floats over real
 * chord changes — not modal vamping, not pedal points, but actual
 * harmonic motion where each change is news.
 *
 * Progression structure (16 bars per A-section):
 *   im7 - ivm7 - V7 - im7      (Cm7 - Fm7 - G7 - Cm7)
 *
 * The V7 (G7) is the dominant — uses the LEADING TONE B natural, which
 * isn't in C natural minor. We use C HARMONIC MINOR as the parent key
 * for that chord (the canonical jazz-minor move). Switching key contexts
 * mid-progression is how the framework expresses this.
 *
 * Sections:
 *   1-8    intro     — pad alone, Cm
 *   9-24   A section — bass + comping + lead melody
 *   25-40  B section — chord changes get richer: bIIIM7, bVIM7
 *   41-56  C section — modal interchange to Cm Dorian (briefly brighter)
 *   57-72  A return  — back home, counter-melody enters
 *   73-80  coda      — final cadence on CmM7 (Picardy-flavored ending)
 */
import { GraphBuilder } from "../core/graph.ts";
import { pcFromName } from "../core/theory.ts";
import {
  defineWobbleBass, defineWarmPad, defineFeltSynth,
  defineClavinetStab, defineSupersawLead,
} from "../instruments/library.ts";

export function buildBlackStone() {
  const b = new GraphBuilder();
  b.transport(b.tempo(84), b.meter(4, 4), { swing: 0.4 });

  // Two key contexts to handle the natural-vs-harmonic-minor split that real
  // minor-key jazz requires. The Cm7 chord uses natural minor (gives Bb as
  // the 7th of Cm7). The G7 chord uses harmonic minor (gives B as the 3rd
  // of G7 — the leading tone).
  const cMin    = b.key(pcFromName("C"), "natural_minor");
  const cMinHM  = b.key(pcFromName("C"), "harmonic_minor");
  const cDorian = b.key(pcFromName("C"), "dorian");

  const bassSynth    = defineWobbleBass(b);
  const padSynth     = defineWarmPad(b);
  const stabSynth    = defineClavinetStab(b);
  const leadSynth    = defineFeltSynth(b);
  const counterSynth = defineSupersawLead(b);

  const drumTrack    = b.track("drums",   10, { program: 1, isPercussion: true });
  const bassTrack    = b.track("bass",    2,  { instrument: bassSynth    });
  const stabTrack    = b.track("stab",    3,  { instrument: stabSynth    });
  const padTrack     = b.track("pad",     4,  { instrument: padSynth     });
  const leadTrack    = b.track("lead",    5,  { instrument: leadSynth    });
  // Counter-melody track. Named "lead2" so the renderer routes it through
  // the lead bus (gets the reverb). This is itself a friction point — the
  // renderer's bus routing is hardcoded to known track names.
  const counterTrack = b.track("lead2",   6,  { instrument: counterSynth });

  // ============= HARMONIC SKELETON =============
  // Each "chord" is 4 bars, so beatsPerStep = 16. Within those 4 bars the
  // chord is felt as static — bass walks, comping plays, melody phrases.
  //
  // The split-key encoding: each chord uses the key context whose diatonic
  // 7th matches the chord we want.

  // --- INTRO: just Cm ---
  const intro = b.progression({
    inKey: cMin, pattern: "i*8", startBeats: 0, beatsPerStep: 4,
  });
  // 8 bars of Cm pad alone

  // --- A SECTION: im7 - ivm7 - V7 - im7 ---
  // Cm7 (nat min for the Bb), Fm7 (nat min for the Eb), G7 (HARMONIC for the B), Cm7
  const a1_im   = b.progression({ inKey: cMin,   pattern: "i*4",   startBeats: 32, beatsPerStep: 4 });
  const a1_ivm  = b.progression({ inKey: cMin,   pattern: "iv*4",  startBeats: 48, beatsPerStep: 4 });
  const a1_V    = b.progression({ inKey: cMinHM, pattern: "V*4",   startBeats: 64, beatsPerStep: 4 });
  const a1_im2  = b.progression({ inKey: cMin,   pattern: "i*4",   startBeats: 80, beatsPerStep: 4 });

  // --- B SECTION: richer changes ---
  // i7 - bIIIM7 - bVIM7 - V7
  // Cm7, EbM7, AbM7, G7
  const b1_im   = b.progression({ inKey: cMin,   pattern: "i*4",   startBeats: 96,  beatsPerStep: 4 });
  const b1_bIII = b.progression({ inKey: cMin,   pattern: "III*4", startBeats: 112, beatsPerStep: 4 });
  const b1_bVI  = b.progression({ inKey: cMin,   pattern: "VI*4",  startBeats: 128, beatsPerStep: 4 });
  const b1_V    = b.progression({ inKey: cMinHM, pattern: "V*4",   startBeats: 144, beatsPerStep: 4 });

  // --- C SECTION: Dorian interchange — brighter, uses the natural 6th (A) ---
  // i7 (Cm7) - IV7 (F7 in Dorian, dominant chord!) - i7 - bVII7 (Bb7)
  const c1_im   = b.progression({ inKey: cDorian, pattern: "i*4",   startBeats: 160, beatsPerStep: 4 });
  const c1_IV   = b.progression({ inKey: cDorian, pattern: "IV*4",  startBeats: 176, beatsPerStep: 4 });
  const c1_im2  = b.progression({ inKey: cDorian, pattern: "i*4",   startBeats: 192, beatsPerStep: 4 });
  const c1_bVII = b.progression({ inKey: cDorian, pattern: "VII*4", startBeats: 208, beatsPerStep: 4 });

  // --- A RETURN: same as A but with counter-melody ---
  const a2_im   = b.progression({ inKey: cMin,   pattern: "i*4",   startBeats: 224, beatsPerStep: 4 });
  const a2_ivm  = b.progression({ inKey: cMin,   pattern: "iv*4",  startBeats: 240, beatsPerStep: 4 });
  const a2_V    = b.progression({ inKey: cMinHM, pattern: "V*4",   startBeats: 256, beatsPerStep: 4 });
  const a2_im2  = b.progression({ inKey: cMin,   pattern: "i*4",   startBeats: 272, beatsPerStep: 4 });

  // --- CODA: final cadence ---
  const coda    = b.progression({ inKey: cMin, pattern: "i*8", startBeats: 288, beatsPerStep: 4 });

  // Convenience groupings
  const aSection  = [...a1_im, ...a1_ivm, ...a1_V, ...a1_im2];
  const bSection  = [...b1_im, ...b1_bIII, ...b1_bVI, ...b1_V];
  const cSection  = [...c1_im, ...c1_IV, ...c1_im2, ...c1_bVII];
  const a2Section = [...a2_im, ...a2_ivm, ...a2_V, ...a2_im2];
  const allSpans  = [...intro, ...aSection, ...bSection, ...cSection, ...a2Section, ...coda];

  // First bar of each chord in each section (for placing things once per chord change)
  const aChordStarts  = [a1_im[0], a1_ivm[0], a1_V[0], a1_im2[0]];
  const bChordStarts  = [b1_im[0], b1_bIII[0], b1_bVI[0], b1_V[0]];
  const cChordStarts  = [c1_im[0], c1_IV[0], c1_im2[0], c1_bVII[0]];
  const a2ChordStarts = [a2_im[0], a2_ivm[0], a2_V[0], a2_im2[0]];

  // ============= PAD (whole piece — extended voicings: 1, 3, 5, 7) =============
  // The big extended-harmony test: chord_tone 3 = the 7th. This is the new
  // capability we added. The pad now plays four-note 7th chords instead of triads.
  const padExt = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0, dur: 1 }, { at: 0, dur: 1 }, { at: 0, dur: 1 }, { at: 0, dur: 1 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },   // root
      { kind: "chord_tone", value: 1 },   // 3rd
      { kind: "chord_tone", value: 2 },   // 5th
      { kind: "chord_tone", value: 3 },   // 7th — NEW capability
    ],
    defaultRegister: 4,
  });
  const padInsts = b.placeRange({ pattern: padExt, underSpans: allSpans, track: padTrack, velocity: 55 });
  b.smoothVoiceLeading(padInsts);
  for (const i of padInsts) b.registerRange(i, 55, 76);

  // Pad gain envelope
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 0, endBeats: 32, from: 0.15, to: 0.50, curve: "linear" }),
    targetEntity: padTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 272, endBeats: 320, from: 0.50, to: 0.10, curve: "linear" }),
    targetEntity: padTrack, targetParameter: "gain",
  });
  // Pad filter — slowly opens through the journey, closes for the coda
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 0, endBeats: 224, from: 320, to: 3500, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "filter.cutoff", startBeats: 272, endBeats: 320, from: 3500, to: 900, curve: "exp" }),
    targetEntity: padTrack, targetParameter: "filter.cutoff",
  });

  // ============= BASS — walking line through chord tones =============
  // Real walking bass: quarter-notes outlining each chord through its tones.
  // Per chord: root (beat 1), then approach to next chord's root through
  // chord-tones and chromatic passing notes.
  //
  // For this piece I'll keep it simpler: root, 3rd, 5th, root on each
  // 4-bar chord. That's 4 notes per chord (not 16 — half-time bass).
  const bassWalk = b.melodicPattern({
    unitBeats: 16,                                              // spans the full 4-bar chord
    ownRhythm: [
      { at: 0.0,   dur: 0.2, velMul: 1.0 },
      { at: 0.25,  dur: 0.2, velMul: 0.85 },
      { at: 0.5,   dur: 0.2, velMul: 0.85 },
      { at: 0.75,  dur: 0.2, velMul: 0.85 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },     // root
      { kind: "chord_tone", value: 2 },     // 5th
      { kind: "chord_tone", value: 1 },     // 3rd
      { kind: "chord_tone", value: 3 },     // 7th — the walking bass hits the 7th approaching the next chord
    ],
    defaultRegister: 2,
  });
  // Walking bass under every chord starting from A section
  for (const startSpan of [...aChordStarts, ...bChordStarts, ...cChordStarts, ...a2ChordStarts]) {
    b.placeUnder({ pattern: bassWalk, underHarmonicSpan: startSpan, track: bassTrack, register: 2, velocity: 80 });
  }
  // Coda: bass just holds the root
  b.placeNote({
    underHarmonicSpan: coda[0], track: bassTrack, register: 2,
    chordTone: 0, durBeats: 28, velocity: 75,
  });
  // Bass fade-in
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 24, endBeats: 40, from: 0.1, to: 0.85, curve: "linear" }),
    targetEntity: bassTrack, targetParameter: "gain",
  });

  // ============= STAB (comping — chord on offbeats, jazz style) =============
  // Classic jazz comping: hits on beats 2-and and 4-and (or close).
  // Plays the full extended chord: 3-5-7 (omitting root, which bass covers).
  const compHit = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0.375, dur: 0.15, velMul: 1.0 },
      { at: 0.375, dur: 0.15 },
      { at: 0.375, dur: 0.15 },
      { at: 0.875, dur: 0.15, velMul: 1.0 },
      { at: 0.875, dur: 0.15 },
      { at: 0.875, dur: 0.15 },
    ],
    notes: [
      { kind: "chord_tone", value: 1 },     // 3rd
      { kind: "chord_tone", value: 2 },     // 5th
      { kind: "chord_tone", value: 3 },     // 7th
      { kind: "chord_tone", value: 1 },
      { kind: "chord_tone", value: 2 },
      { kind: "chord_tone", value: 3 },
    ],
    defaultRegister: 4,
  });
  // Stab plays through A, B, C, A2 sections
  const stabInsts = b.placeRange({
    pattern: compHit, underSpans: [...aSection, ...bSection, ...cSection, ...a2Section],
    track: stabTrack, velocity: 65,
  });
  b.smoothVoiceLeading(stabInsts);
  for (const i of stabInsts) b.registerRange(i, 55, 76);

  // ============= LEAD MELODY (felt synth) =============
  // A melody that uses the chord changes — phrases that target chord tones
  // including the 7th. Sparse, vocal, long notes alternating with phrases.

  // Phrase A: starts on the 5th, descends through the 3rd to the 7th of the next chord
  // (this is the "walking down the changes" feel — the 7th of each chord IS the
  // approach tone to the next chord's 3rd, classic voice leading)
  const phraseA = b.melodicPattern({
    unitBeats: 16,
    ownRhythm: [
      { at: 0.0,   dur: 0.25, velMul: 1.1 },
      { at: 0.25,  dur: 0.125 },
      { at: 0.5,   dur: 0.375 },
    ],
    notes: [
      { kind: "chord_tone", value: 2 },   // 5th
      { kind: "chord_tone", value: 1 },   // 3rd
      { kind: "chord_tone", value: 3 },   // 7th — the resolution
    ],
    defaultRegister: 5,
  });
  // Phrase B: a held tonic with a turn
  const phraseB = b.melodicPattern({
    unitBeats: 16,
    ownRhythm: [
      { at: 0.0,  dur: 0.375, velMul: 1.0 },
      { at: 0.5,  dur: 0.125 },
      { at: 0.625, dur: 0.125 },
      { at: 0.75, dur: 0.25 },
    ],
    notes: [
      { kind: "chord_tone", value: 0 },   // root
      { kind: "chord_tone", value: 1 },   // 3rd
      { kind: "chord_tone", value: 3 },   // 7th
      { kind: "chord_tone", value: 2 },   // 5th
    ],
    defaultRegister: 5,
  });
  // Phrase C: a leaping phrase — 9th to 7th to 3rd (uses the 9 — chord_tone 4!)
  const phraseC = b.melodicPattern({
    unitBeats: 16,
    ownRhythm: [
      { at: 0.0,  dur: 0.25, velMul: 1.15 },
      { at: 0.25, dur: 0.125 },
      { at: 0.5,  dur: 0.5 },
    ],
    notes: [
      { kind: "chord_tone", value: 4 },   // 9th — NEW (extended)
      { kind: "chord_tone", value: 3 },   // 7th
      { kind: "chord_tone", value: 1 },   // 3rd
    ],
    defaultRegister: 5,
  });

  // A section: phrases on chords 1 and 3 (alternating phrase, silence)
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: aChordStarts[0], track: leadTrack, register: 5, velocity: 90 });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: aChordStarts[2], track: leadTrack, register: 5, velocity: 92 });

  // B section: more phrases — the richer chord changes deserve more melody
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: bChordStarts[0], track: leadTrack, register: 5, velocity: 92 });
  b.placeUnder({ pattern: phraseC, underHarmonicSpan: bChordStarts[1], track: leadTrack, register: 5, velocity: 95 });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: bChordStarts[2], track: leadTrack, register: 5, velocity: 95 });
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: bChordStarts[3], track: leadTrack, register: 5, velocity: 92 });

  // C section: the Dorian brightness — phraseC on the IV (its 9th sounds extra rich)
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: cChordStarts[0], track: leadTrack, register: 5, velocity: 95 });
  b.placeUnder({ pattern: phraseC, underHarmonicSpan: cChordStarts[1], track: leadTrack, register: 5, velocity: 100 });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: cChordStarts[2], track: leadTrack, register: 5, velocity: 95 });

  // A return: lead returns with the original phrase, fuller velocity
  b.placeUnder({ pattern: phraseA, underHarmonicSpan: a2ChordStarts[0], track: leadTrack, register: 5, velocity: 100 });
  b.placeUnder({ pattern: phraseB, underHarmonicSpan: a2ChordStarts[2], track: leadTrack, register: 5, velocity: 100 });

  // Coda: held tonic, fading
  b.placeNote({
    underHarmonicSpan: coda[0], track: leadTrack, register: 5,
    chordTone: 0, durBeats: 28, velocity: 90,
  });

  // ============= COUNTER-MELODY (enters in A return) =============
  // A second voice above the lead, playing chord tones at a higher register
  // and at different beats (so they don't collide rhythmically).
  // This is the closest I can get to real counterpoint in the current framework —
  // there's no "respond to that voice" relationship, no contrary motion constraint.
  const counterPhrase = b.melodicPattern({
    unitBeats: 16,
    ownRhythm: [
      // Counter-melody enters in the second half of each chord
      { at: 0.375, dur: 0.25, velMul: 0.95 },
      { at: 0.625, dur: 0.375 },
    ],
    notes: [
      { kind: "chord_tone", value: 3 },   // 7th up top — colors the chord
      { kind: "chord_tone", value: 1 },   // 3rd
    ],
    defaultRegister: 6,
  });
  for (const startSpan of a2ChordStarts) {
    b.placeUnder({ pattern: counterPhrase, underHarmonicSpan: startSpan, track: counterTrack, register: 6, velocity: 75 });
  }
  // Counter-melody also in C section to add brightness during Dorian
  b.placeUnder({ pattern: counterPhrase, underHarmonicSpan: cChordStarts[1], track: counterTrack, register: 6, velocity: 70 });
  b.placeUnder({ pattern: counterPhrase, underHarmonicSpan: cChordStarts[3], track: counterTrack, register: 6, velocity: 72 });

  // ============= DRUMS — brushed, very sparse =============
  // Just a soft closed hi-hat on quarter offbeats. No snare backbeat — this
  // is a ballad, not a swing tune.
  const softHat = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [
      { at: 0.25, dur: 0.15, velMul: 0.85 },
      { at: 0.5,  dur: 0.15, velMul: 0.7 },
      { at: 0.75, dur: 0.15, velMul: 0.85 },
    ],
    notes: [
      { kind: "fixed_pc", value: 6 }, { kind: "fixed_pc", value: 6 }, { kind: "fixed_pc", value: 6 },
    ],
    defaultRegister: 2,
  });
  // Hat from A section through A return
  for (const s of [...aSection, ...bSection, ...cSection, ...a2Section]) {
    b.placeUnder({ pattern: softHat, underHarmonicSpan: s, track: drumTrack, register: 2, velocity: 38 });
  }
  // A single brushed snare hit at the start of each section (the gentlest possible signal)
  const brushedSnare = b.melodicPattern({
    unitBeats: 4,
    ownRhythm: [{ at: 0.25, dur: 0.2 }],
    notes: [{ kind: "fixed_pc", value: 2 }],
    defaultRegister: 2,
  });
  b.placeUnder({ pattern: brushedSnare, underHarmonicSpan: aChordStarts[0],  track: drumTrack, register: 2, velocity: 55 });
  b.placeUnder({ pattern: brushedSnare, underHarmonicSpan: bChordStarts[0],  track: drumTrack, register: 2, velocity: 60 });
  b.placeUnder({ pattern: brushedSnare, underHarmonicSpan: cChordStarts[0],  track: drumTrack, register: 2, velocity: 55 });
  b.placeUnder({ pattern: brushedSnare, underHarmonicSpan: a2ChordStarts[0], track: drumTrack, register: 2, velocity: 65 });

  // Drum gain — fade in slowly, fade out at coda
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 32, endBeats: 56, from: 0.15, to: 0.65, curve: "linear" }),
    targetEntity: drumTrack, targetParameter: "gain",
  });
  b.bindEnvelope({
    envelope: b.envelope({ parameter: "gain", startBeats: 280, endBeats: 320, from: 0.65, to: 0.0, curve: "linear" }),
    targetEntity: drumTrack, targetParameter: "gain",
  });

  return { graph: b.graph };
}
