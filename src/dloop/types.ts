/**
 * .loop DSL — abstract syntax (Phase 5 v0 subset).
 */

export interface LoopFile {
  tempo?: number;
  meter?: { beats: number; unit: number };
  swing?: number;
  key?: { tonic: string; mode: string };
  tracks: TrackDecl[];
  progressions: ProgressionDecl[];
  patterns: PatternDecl[];
  placements: PlacementDecl[];
  voiceLeading: VoiceLeadingDecl[];
  registerRanges: RegisterRangeDecl[];
  envelopes: EnvelopeDecl[];
}

export interface TrackDecl {
  name: string;
  channel: number;
  instrument?: string;
  percussion?: boolean;
}

export interface ProgressionDecl {
  name: string;
  beatsPerStep: number;
  degrees: string[];
}

export type NoteSpec =
  | { kind: "chord"; indices: number[] }
  | { kind: "drum"; pcs: number[] };

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
  | { kind: "durations"; durs: number[] };

export interface PlacementDecl {
  pattern: string;
  progression: string;
  spanSlice?: { start?: number; end?: number }; // [start:end) indices
  track: string;
  register?: number;
  velocity?: number;
}

export interface VoiceLeadingDecl {
  track: string;
  progression: string;
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
