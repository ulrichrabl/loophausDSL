/**
 * Minimum viable theory engine.
 * Operates on pitch classes (0..11). 12-TET only for now.
 * Architecture allows extension to cents-based reasoning later.
 */
import type { PitchClass, ScaleDegree, KeyContext, ModulationMethod } from "./types.ts";

// Scale intervals (semitones from tonic)
const SCALE_INTERVALS = {
  major:               [0, 2, 4, 5, 7, 9, 11],
  natural_minor:       [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor:      [0, 2, 3, 5, 7, 8, 11],
  dorian:              [0, 2, 3, 5, 7, 9, 10],
  mixolydian:          [0, 2, 4, 5, 7, 9, 10],
  phrygian_dominant:   [0, 1, 4, 5, 7, 8, 10],  // freygish — 1 b2 3 4 5 b6 b7
} as const;

const DEGREE_INDEX: Record<string, number> = {
  i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6,
  I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6,
};

const FUNCTION_LABELS_MAJOR: Record<number, string> = {
  0: "tonic", 1: "supertonic", 2: "mediant", 3: "subdominant",
  4: "dominant", 5: "submediant", 6: "leading_tone",
};
const FUNCTION_LABELS_MINOR: Record<number, string> = {
  0: "tonic", 1: "supertonic", 2: "mediant", 3: "subdominant",
  4: "dominant", 5: "submediant", 6: "subtonic",
};

export function scaleTonePcs(key: KeyContext): PitchClass[] {
  const intervals = SCALE_INTERVALS[key.mode];
  return intervals.map(i => (key.tonic + i) % 12);
}

/**
 * Build the chord on a scale degree, diatonically, with as many tones as requested.
 * Stacks thirds within the scale: 1-3-5-7-9-11-13.
 * Quality (major/minor/dim/dom7/m7/M7/…) falls out naturally from the parent mode.
 *
 * Returns 7 tones (the full stack); callers slice by chord_tone index:
 *   index 0 = root, 1 = 3rd, 2 = 5th, 3 = 7th, 4 = 9th, 5 = 11th, 6 = 13th.
 *
 * For backwards compatibility the existing `chordTonePcsForDegree` returns a triad.
 */
export function chordTonePcsForDegree(
  key: KeyContext,
  degree: ScaleDegree
): PitchClass[] {
  const scale = scaleTonePcs(key);
  const degIdx = DEGREE_INDEX[degree];
  // Triad: degree, degree+2, degree+4 (mod 7)
  return [0, 2, 4].map(offset => scale[(degIdx + offset) % 7]);
}

/**
 * Extended chord tones — full diatonic stack of thirds for a degree.
 * Used when a melodic note specifies chord_tone with value > 2 (7th, 9th, etc.).
 */
export function extendedChordTonePcsForDegree(
  key: KeyContext,
  degree: ScaleDegree
): PitchClass[] {
  const scale = scaleTonePcs(key);
  const degIdx = DEGREE_INDEX[degree];
  // 1-3-5-7-9-11-13 = scale indices [0, 2, 4, 6, 8 mod 7 = 1, 10 mod 7 = 3, 12 mod 7 = 5]
  return [0, 2, 4, 6, 1, 3, 5].map(offset => scale[(degIdx + offset) % 7]);
}

export function rootPcForDegree(
  key: KeyContext,
  degree: ScaleDegree
): PitchClass {
  return scaleTonePcs(key)[DEGREE_INDEX[degree]];
}

export function functionLabelForDegree(degree: ScaleDegree, mode?: KeyContext["mode"]): string {
  const isMinor = mode === "natural_minor" || mode === "harmonic_minor";
  const table = isMinor ? FUNCTION_LABELS_MINOR : FUNCTION_LABELS_MAJOR;
  return table[DEGREE_INDEX[degree]];
}

/** Place a pitch class in a register. Returns MIDI note number. */
export function placePcInRegister(pc: PitchClass, octave: number): number {
  return (octave + 1) * 12 + pc;
}

/** Find the MIDI note of a pitch class closest to a target MIDI note. */
export function closestMidiOfPc(pc: PitchClass, targetMidi: number): number {
  // Find an octave such that |result - targetMidi| is minimized
  const targetPc = targetMidi % 12;
  const baseOctave = Math.floor(targetMidi / 12);
  const candidates = [
    (baseOctave - 1) * 12 + pc,
    baseOctave * 12 + pc,
    (baseOctave + 1) * 12 + pc,
  ];
  return candidates.reduce((best, c) =>
    Math.abs(c - targetMidi) < Math.abs(best - targetMidi) ? c : best,
    candidates[0]
  );
}

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${oct}`;
}

export function pcFromName(name: string): PitchClass {
  const idx = NOTE_NAMES.findIndex(n => n === name);
  if (idx < 0) throw new Error(`Unknown note name: ${name}`);
  return idx;
}

/** Pitch classes shared by both keys' parent scales. */
export function commonTonePcsBetweenKeys(a: KeyContext, b: KeyContext): PitchClass[] {
  const sa = new Set(scaleTonePcs(a));
  const sb = scaleTonePcs(b);
  return sb.filter((pc) => sa.has(pc));
}

/** Dominant-seventh chord tones (V7) leading into a key — uses raised 7th for minor keys. */
export function dominantSeventhPcs(key: KeyContext): PitchClass[] {
  const scale =
    key.mode === "natural_minor" || key.mode === "harmonic_minor"
      ? scaleTonePcs({ ...key, mode: "harmonic_minor" })
      : scaleTonePcs(key);
  const root = scale[4]; // V degree
  return [0, 4, 7, 10].map((i) => (root + i) % 12);
}

/** Relative major of a minor key (up a minor 3rd). */
export function relativeMajorOf(minor: KeyContext): PitchClass {
  return (minor.tonic + 3) % 12;
}

/** Relative minor of a major key (down a minor 3rd). */
export function relativeMinorOf(major: KeyContext): PitchClass {
  return (major.tonic + 9) % 12;
}

export function keyLabel(key: KeyContext): string {
  return `${NOTE_NAMES[key.tonic]} ${key.mode.replace(/_/g, " ")}`;
}

export function keysShareTonic(a: KeyContext, b: KeyContext): boolean {
  return a.tonic === b.tonic;
}

/**
 * Pitch classes to emphasize at a modulation boundary.
 * - common_tone: scale tones shared by both keys
 * - dominant: V7 of the destination key
 * - direct: empty (hard cut)
 */
export function pivotPcsForModulation(
  fromKey: KeyContext,
  toKey: KeyContext,
  method: ModulationMethod,
  pivotDegree?: ScaleDegree,
): PitchClass[] {
  switch (method) {
    case "common_tone":
      if (pivotDegree) {
        return chordTonePcsForDegree(fromKey, pivotDegree);
      }
      return commonTonePcsBetweenKeys(fromKey, toKey);
    case "dominant":
      return dominantSeventhPcs(toKey);
    case "direct":
      return [];
  }
}

/** Suggest a pivot degree in the source key for a modulation to `toKey`. */
export function suggestPivotDegree(
  fromKey: KeyContext,
  toKey: KeyContext,
  method: ModulationMethod,
): ScaleDegree | undefined {
  if (method === "direct") return undefined;
  if (method === "dominant") {
    const fromScale = scaleTonePcs(fromKey);
    const idx = fromScale.indexOf(toKey.tonic);
    if (idx >= 0) {
      const lower = ["i", "ii", "iii", "iv", "v", "vi", "vii"][idx];
      return lower.toUpperCase() as ScaleDegree;
    }
    const domRoot = dominantSeventhPcs(toKey)[0];
    const domIdx = fromScale.indexOf(domRoot);
    if (domIdx >= 0) {
      const lower = ["i", "ii", "iii", "iv", "v", "vi", "vii"][domIdx];
      return lower.toUpperCase() as ScaleDegree;
    }
    return "V";
  }
  // common_tone: prefer a triad in fromKey that shares tones with toKey tonic triad.
  const toTriad = [0, 2, 4].map((o) => scaleTonePcs(toKey)[o]);
  for (const deg of ["I", "IV", "V", "vi", "iii", "ii", "i", "VI", "III"] as ScaleDegree[]) {
    const triad = chordTonePcsForDegree(fromKey, deg);
    if (triad.some((pc) => toTriad.includes(pc))) return deg;
  }
  return "I";
}
