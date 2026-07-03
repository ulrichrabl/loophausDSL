/**
 * Loophaus core primitives.
 *
 * Six things, and only six things:
 *   - Event       discrete temporal happening
 *   - Envelope    continuous function over a span
 *   - Relationship  typed binding/derivation, exposes derived properties
 *   - Constraint  bidirectional restriction over multiple entities
 *   - Context     interpretive scope (key, meter, tempo, track)
 *   - Reference   a pointer between entities (just an Id)
 *
 * Everything else — chords, melodies, voicings, motifs, patterns —
 * is a pattern/derivation over these. Not primitive.
 */

export type Id = string;

/** A reference is just an Id pointing at another node. */
export type Ref<_T = unknown> = Id;

// ----- Contexts ---------------------------------------------------------

export type Context =
  | KeyContext
  | MeterContext
  | TempoContext
  | TransportContext
  | TrackContext;

export interface KeyContext {
  kind: "context";
  type: "key";
  id: Id;
  tonic: PitchClass;             // 0..11 (or cents, but 12-TET for now)
  mode: "major" | "natural_minor" | "harmonic_minor" | "dorian" | "mixolydian" | "phrygian_dominant";
}

export interface MeterContext {
  kind: "context";
  type: "meter";
  id: Id;
  beatsPerBar: number;           // numerator
  beatUnit: number;              // denominator (4 = quarter)
}

export interface TempoContext {
  kind: "context";
  type: "tempo";
  id: Id;
  bpm: number;
}

export interface TransportContext {
  kind: "context";
  type: "transport";
  id: Id;
  tempo: Ref<TempoContext>;
  meter: Ref<MeterContext>;
  /** 0 = straight 8ths, 1 = full triplet swing. Shifts the "&" of each beat later. */
  swing?: number;
}

export interface TrackContext {
  kind: "context";
  type: "track";
  id: Id;
  name: string;
  midiChannel: number;
  program?: number;              // MIDI program / GM patch (legacy renderer)
  isPercussion?: boolean;
  instrument?: Id;               // if set, use audio-graph synth instead of GM patch
}

// ----- Events -----------------------------------------------------------

/**
 * A bare temporal happening. Position is in beats from origin
 * (resolved through a transport context). Pitch and velocity are *not*
 * intrinsic — they're attached via relationships in most realistic
 * use, but we allow direct attachment here as a concrete shortcut
 * for solved/rendered events.
 */
export interface Event {
  kind: "event";
  id: Id;
  positionBeats: number;
  durationBeats: number;
  pitch?: number;                // MIDI note number; undefined = no pitch (drum, rest carrier)
  velocity?: number;             // 0..127
  track: Ref<TrackContext>;
}

// ----- Envelopes --------------------------------------------------------

/** A continuous function f(t) -> value over a beat-span. */
export interface Envelope {
  kind: "envelope";
  id: Id;
  parameter: string;             // free-form name; bindings target it
  startBeats: number;
  endBeats: number;
  from: number;
  to: number;
  curve: "linear" | "exp" | "log";
}

// ----- Relationships ----------------------------------------------------

/**
 * Relationships are directed, derive things, and expose queryable
 * properties through the solver. We discriminate by `type`.
 *
 * The relationship types here are the minimal set we found we needed
 * across our three test pieces. More can be added without breaking
 * the primitive model.
 */
export type Relationship =
  | HarmonicSpan
  | RhythmicPattern
  | MelodicPattern
  | EnvelopeBinding
  | SidechainRelationship
  | Modulation;

/**
 * Declares a sidechain ducking: whenever the `trigger` track emits an event,
 * the `ducks` tracks have their amplitude dipped. Cleaner than the renderer
 * inferring "kicks duck everything" — now it's explicit in the composition.
 */
export interface SidechainRelationship {
  kind: "relationship";
  type: "sidechain";
  id: Id;
  trigger: Ref<TrackContext>;
  ducks: Ref<TrackContext>[];
  amount: number;
  releaseMs: number;
  /** When set, only duck from trigger hits within this beat range. */
  startBeats?: number;
  endBeats?: number;
}

/**
 * Declares a change of tonal center from one KeyContext to another.
 * Optionally references a pivot harmonic span and common-tone pitch classes
 * that bridge the two keys. The solver uses this for cross-key voice-leading.
 */
export type ModulationMethod =
  | "direct"
  | "common_tone"
  | "dominant"
  | "chromatic_mediant"
  | "enharmonic";

export interface Modulation {
  kind: "relationship";
  type: "modulation";
  id: Id;
  fromKey: Ref<KeyContext>;
  toKey: Ref<KeyContext>;
  /** Beat where the new key takes effect (start of entry harmony). */
  atBeats: number;
  method: ModulationMethod;
  /** Harmonic span acting as pivot (often the last chord of the old key). */
  pivotSpan?: Ref<HarmonicSpan>;
  /** Pitch classes emphasized at the boundary (common tones, dominant tones). */
  pivotPcs?: PitchClass[];
}

/**
 * "From beat A to beat B, the harmonic context is scale-degree D
 *  of parent key K." Exposes derived props: root, third, fifth,
 *  chord_tones, scale_tones, function.
 */
export interface HarmonicSpan {
  kind: "relationship";
  type: "harmonic_span";
  id: Id;
  inKey: Ref<KeyContext>;
  startBeats: number;
  endBeats: number;
  degree: ScaleDegree;           // 'i', 'ii', 'IV', 'V', etc. (case = quality hint)
  // Solver fills these:
  derived?: {
    rootPc: PitchClass;
    chordTonePcs: PitchClass[];          // triad: [root, third, fifth]
    extendedChordTonePcs?: PitchClass[]; // full diatonic stack: [1, 3, 5, 7, 9, 11, 13]
    scaleTonePcs: PitchClass[];  // parent scale
    functionLabel: string;       // 'tonic', 'subdominant', etc.
  };
}

/**
 * A rhythm: a set of onset positions + durations within a unit-span.
 * Pitches are NOT here. This is purely temporal — the layer-algebra
 * payoff: rhythm exists independently and can be combined with
 * pitch-producing patterns.
 */
export interface RhythmicPattern {
  kind: "relationship";
  type: "rhythmic_pattern";
  id: Id;
  // Positions and durations expressed as fractions of the unit span.
  // velMul (optional) is a per-onset velocity multiplier — used for accent patterns.
  onsets: { at: number; dur: number; velMul?: number }[];
  unitBeats: number;             // how many beats the unit-span covers
}

/**
 * A melodic/voicing pattern: produces pitched events, with pitches
 * specified relative to a harmonic context. Carries its own rhythm
 * (or borrows one — that's the layer-algebra move).
 *
 * Each note declares its pitch via one of:
 *  - chord_tone: index into current harmonic span's chord_tone_pcs
 *  - scale_degree: index into current harmonic span's scale_tone_pcs
 *  - interval_from_prev: directed interval (semitones) from prior note
 *  - fixed_pc: absolute pitch class
 *
 * Register is resolved separately.
 */
export interface MelodicPattern {
  kind: "relationship";
  type: "melodic_pattern";
  id: Id;
  // EITHER its own rhythm (positions in fractions of unitBeats) ...
  ownRhythm?: { at: number; dur: number; velMul?: number }[];
  // ... OR it borrows from a referenced RhythmicPattern.
  borrowRhythm?: Ref<RhythmicPattern>;
  unitBeats: number;
  notes: MelodicNoteSpec[];      // one per onset
  defaultRegister: number;       // octave anchor (e.g. 4 = around C4)
  transform?: "none" | "invert" | "retrograde";
}

export interface MelodicNoteSpec {
  kind: "chord_tone" | "scale_degree" | "interval_from_prev" | "fixed_pc";
  value: number;                 // 0-indexed for chord/scale tone; semitones for interval; PC for fixed
}

/** Bind an envelope to a named target parameter of an entity. */
export interface EnvelopeBinding {
  kind: "relationship";
  type: "envelope_binding";
  id: Id;
  envelope: Ref<Envelope>;
  targetEntity: Id;              // could be a track, an event, anything
  targetParameter: string;       // e.g. 'filter.cutoff', 'velocity'
}

// ----- Constraints ------------------------------------------------------

/**
 * Constraints are bidirectional. They restrict multiple entities
 * jointly. The solver finds values that minimize total violation.
 *
 * We support a small set for now. Each can carry a weight; weight=Infinity
 * means hard constraint, smaller means soft preference.
 */
export type Constraint = SmoothVoiceLeadingConstraint | RegisterRangeConstraint;

export interface SmoothVoiceLeadingConstraint {
  kind: "constraint";
  type: "smooth_voice_leading";
  id: Id;
  appliesTo: Id[];               // sequence of melodic_pattern instances, in time order
  weight: number;                // higher = prefer smoother
}

export interface RegisterRangeConstraint {
  kind: "constraint";
  type: "register_range";
  id: Id;
  appliesTo: Id;                 // a melodic_pattern instance
  minMidi: number;
  maxMidi: number;
  weight: number;                // Infinity = hard
}

// ----- Instance placement -----------------------------------------------

/**
 * Patterns are templates. To produce events, they need to be
 * *instantiated* under a harmonic span (or at an absolute time).
 * The instance is the thing that the solver expands into events.
 */
export interface PatternInstance {
  kind: "instance";
  id: Id;
  pattern: Ref<MelodicPattern | RhythmicPattern>;
  underHarmonicSpan?: Ref<HarmonicSpan>;   // for melodic patterns
  atBeats?: number;              // absolute placement override
  register?: number;             // override pattern's default
  track: Ref<TrackContext>;
  velocity?: number;
}

// ----- Pitch class helpers ----------------------------------------------

export type PitchClass = number; // 0..11, C=0

export type ScaleDegree =
  | "i" | "ii" | "iii" | "iv" | "v" | "vi" | "vii"
  | "I" | "II" | "III" | "IV" | "V" | "VI" | "VII";

// ----- The graph --------------------------------------------------------

export type Node =
  | Context
  | Event
  | Envelope
  | Relationship
  | Constraint
  | PatternInstance
  | InstrumentNode;

// Re-export instrument as a node-storable variant
export interface InstrumentNode {
  kind: "instrument";
  id: Id;
  name: string;
  polyphony: number;
  // The audio-graph contents live in audio_types.ts. We carry it as opaque
  // here to avoid coupling the kernel types to audio specifics.
  audioNodes: Record<string, any>;     // AudioNode (typed in audio_types.ts)
  output: string;
  gateSource?: string;
}

export interface Graph {
  nodes: Map<Id, Node>;
  transport: Ref<TransportContext>;
}
