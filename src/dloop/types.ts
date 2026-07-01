/**
 * .loop DSL — abstract syntax.
 */

export interface LoopFile {
  tempo?: number;
  meter?: { beats: number; unit: number };
  swing?: number;
  /** Shorthand for key named "default". */
  key?: { tonic: string; mode: string };
  keys: KeyDecl[];
  tracks: TrackDecl[];
  progressions: ProgressionDecl[];
  sections: SectionDecl[];
  patterns: PatternDecl[];
  placements: PlacementDecl[];
  placeRanges: PlaceRangeDecl[];
  placeVaryings: PlaceVaryingDecl[];
  placeNotes: PlaceNoteDecl[];
  sidechains: SidechainDecl[];
  voiceLeading: VoiceLeadingDecl[];
  registerRanges: RegisterRangeDecl[];
  envelopes: EnvelopeDecl[];
}

export interface KeyDecl {
  name: string;
  tonic: string;
  mode: string;
}

export interface TrackDecl {
  name: string;
  channel: number;
  instrument?: string;
  percussion?: boolean;
}

export interface ProgressionDecl {
  name: string;
  keyName: string;
  beatsPerStep: number;
  startBeats?: number;
  degrees: string[];
}

export interface SectionDecl {
  name: string;
  progression: string;
}

export type NoteSpec =
  | { kind: "chord"; indices: number[] }
  | { kind: "drum"; pcs: number[] }
  | { kind: "scale"; indices: number[] }
  | { kind: "seq"; tokens: NoteToken[] };

export type NoteToken =
  | { kind: "chord"; value: number }
  | { kind: "scale"; value: number }
  | { kind: "interval"; value: number }
  | { kind: "drum"; value: number };

export interface PatternDecl {
  name: string;
  unitBeats: number;
  register: number;
  velocity?: number;
  transform?: "invert";
  rhythm: RhythmSpec;
  notes: NoteSpec;
}

export type RhythmSpec =
  | { kind: "mini"; pattern: string }
  | { kind: "quarters"; count: number }
  | { kind: "eighths"; count: number }
  | { kind: "chord" }
  | { kind: "durations"; durs: number[] }
  | { kind: "sustain" }
  | { kind: "hits"; hits: { at: number; dur: number }[] };

export interface SpanRef {
  name: string;
  /** Single index, [start:end), [start:], or comma-separated indices. */
  slice?: SpanSlice;
}

export type SpanSlice =
  | { kind: "range"; start: number; end?: number }
  | { kind: "indices"; indices: number[] };

export interface PlacementDecl {
  pattern: string;
  target: SpanRef;
  track: string;
  register?: number;
  velocity?: number;
}

export interface PlaceRangeDecl {
  pattern: string;
  spanRefs: SpanRef[];
  track: string;
  register?: number;
  velocity?: number;
}

export type VaryRule =
  | { kind: "every"; every: number; pattern: string; offset?: number }
  | { kind: "chance"; chance: number; pattern: string; seed?: number }
  | { kind: "onSteps"; steps: number[]; pattern: string };

export interface PlaceVaryingDecl {
  defaultPattern: string;
  spanRefs: SpanRef[];
  track: string;
  register?: number;
  velocity?: number;
  vary: VaryRule[];
}

export interface PlaceNoteDecl {
  track: string;
  register: number;
  durBeats: number;
  velocity?: number;
  pitch: { kind: "degree" | "chord" | "pc"; value: number };
  spanRef?: SpanRef;
  atBeats?: number;
}

export interface SidechainDecl {
  trigger: string;
  ducks: string[];
  amount?: number;
  releaseMs?: number;
}

export interface VoiceLeadingDecl {
  track: string;
  /** Section/progression name or "*" for all placements on track. */
  target: string;
}

export interface RegisterRangeDecl {
  track: string;
  min: number;
  max: number;
}

export interface EnvelopeDecl {
  name: string;
  targetTrack: string;
  parameter: string;
  curve: "linear" | "exp";
  startBeats: number;
  endBeats: number;
  from: number;
  to: number;
}
