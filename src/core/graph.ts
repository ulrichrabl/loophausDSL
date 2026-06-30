/**
 * Graph builder. Lets us write piece definitions in TS in a way that
 * approximates what the DSL would look like, without yet building a parser.
 *
 * Every method returns the Id of the newly added node so we can reference it.
 */
import type {
  Graph, Node, Id, Ref, PitchClass, ScaleDegree,
  KeyContext, MeterContext, TempoContext, TransportContext, TrackContext,
  HarmonicSpan, RhythmicPattern, MelodicPattern, MelodicNoteSpec, EnvelopeBinding,
  Envelope, PatternInstance, SidechainRelationship,
  SmoothVoiceLeadingConstraint, RegisterRangeConstraint,
} from "./types.ts";

let _seq = 0;
const mkId = (prefix: string): Id => `${prefix}_${++_seq}`;

export class GraphBuilder {
  graph: Graph;

  constructor() {
    this.graph = {
      nodes: new Map(),
      transport: "",
    };
  }

  private add<T extends Node>(node: T): Id {
    this.graph.nodes.set(node.id, node);
    return node.id;
  }

  // --- Contexts ---------------------------------------------------------

  tempo(bpm: number): Id {
    return this.add<TempoContext>({ kind: "context", type: "tempo", id: mkId("tempo"), bpm });
  }

  meter(beatsPerBar: number, beatUnit: number): Id {
    return this.add<MeterContext>({
      kind: "context", type: "meter", id: mkId("meter"), beatsPerBar, beatUnit,
    });
  }

  transport(tempo: Id, meter: Id, opts: { swing?: number } = {}): Id {
    const id = this.add<TransportContext>({
      kind: "context", type: "transport", id: mkId("transport"),
      tempo, meter, swing: opts.swing,
    });
    this.graph.transport = id;
    return id;
  }

  key(tonic: PitchClass, mode: KeyContext["mode"]): Id {
    return this.add<KeyContext>({ kind: "context", type: "key", id: mkId("key"), tonic, mode });
  }

  track(name: string, midiChannel: number, opts: { program?: number; isPercussion?: boolean; instrument?: Id } = {}): Id {
    return this.add<TrackContext>({
      kind: "context", type: "track", id: mkId("track"),
      name, midiChannel, ...opts,
    });
  }

  /**
   * Define an instrument: a named audio sub-graph.
   * Returns the instrument's Id; bind it to a track via track(..., { instrument: id }).
   */
  defineInstrument(opts: {
    name: string;
    polyphony?: number;
    nodes: Record<string, any>;     // AudioNode map (see audio_types.ts)
    output: string;
    gateSource?: string;
  }): Id {
    return this.add<any>({
      kind: "instrument",
      id: mkId(`inst_${opts.name}`),
      name: opts.name,
      polyphony: opts.polyphony ?? 8,
      audioNodes: opts.nodes,
      output: opts.output,
      gateSource: opts.gateSource,
    });
  }

  // --- Harmonic spans ---------------------------------------------------

  harmonicSpan(opts: {
    inKey: Id;
    startBeats: number;
    endBeats: number;
    degree: ScaleDegree;
  }): Id {
    return this.add<HarmonicSpan>({
      kind: "relationship", type: "harmonic_span", id: mkId("h"),
      ...opts,
    });
  }

  // --- Patterns ---------------------------------------------------------

  rhythmicPattern(unitBeats: number, onsets: { at: number; dur: number; velMul?: number }[]): Id {
    return this.add<RhythmicPattern>({
      kind: "relationship", type: "rhythmic_pattern", id: mkId("rhy"),
      unitBeats, onsets,
    });
  }

  /** Convenient pulse: evenly-spaced onsets. */
  pulse(unitBeats: number, count: number): Id {
    const step = 1 / count;
    const onsets = Array.from({ length: count }, (_, i) => ({ at: i * step, dur: step }));
    return this.rhythmicPattern(unitBeats, onsets);
  }

  melodicPattern(opts: {
    unitBeats: number;
    notes: MelodicNoteSpec[];
    defaultRegister: number;
    ownRhythm?: { at: number; dur: number; velMul?: number }[];
    borrowRhythm?: Id;
    transform?: MelodicPattern["transform"];
  }): Id {
    return this.add<MelodicPattern>({
      kind: "relationship", type: "melodic_pattern", id: mkId("mel"),
      transform: opts.transform ?? "none",
      ...opts,
    });
  }

  /**
   * Attach an expressive envelope to a single note (or any pattern instance).
   * The envelope modulates the voice's output gain, layered ON TOP of the
   * instrument's own ADSR envelope.
   *
   * Use this for dynamic shaping that lives in the music graph rather than
   * inside the instrument — e.g. a swelling held note, a fade across a phrase,
   * a single note that breathes.
   *
   * Shape is either a built-in name or a custom { from, to, curve }:
   *
   *   "swell"     starts quiet, rises to peak at midpoint, fades to silence
   *   "fade_in"   starts at 0, ends at 1.0 linearly
   *   "fade_out"  starts at 1.0, ends at 0 linearly
   *   custom      { from, to, curve: "linear" | "exp" }
   *
   * The time range is automatically taken from the instance's underlying
   * harmonic span (or atBeats / durBeats if directly placed). The composer
   * doesn't have to compute absolute beats.
   */
  noteEnvelope(opts: {
    instance: Id;
    shape: "swell" | "fade_in" | "fade_out" | { from: number; to: number; curve?: "linear" | "exp" };
  }): void {
    // Resolve the instance's time range from its underlying harmonic span (if any).
    const inst = lookup<PatternInstance>(this.graph, opts.instance);
    let startBeats: number, endBeats: number;
    if (inst.underHarmonicSpan) {
      const span = lookup<HarmonicSpan>(this.graph, inst.underHarmonicSpan);
      startBeats = span.startBeats;
      endBeats = span.endBeats;
    } else if (inst.atBeats !== undefined) {
      // Fall back to pattern length (best-effort)
      const pat = lookup<MelodicPattern>(this.graph, inst.pattern);
      startBeats = inst.atBeats;
      endBeats = inst.atBeats + (pat.kind === "relationship" && (pat as any).unitBeats || 4);
    } else {
      throw new Error("noteEnvelope: instance has no span or atBeats");
    }

    const bindOne = (sb: number, eb: number, from: number, to: number, curve: "linear" | "exp" = "linear") => {
      const env = this.envelope({ parameter: "gain", startBeats: sb, endBeats: eb, from, to, curve });
      this.bindEnvelope({ envelope: env, targetEntity: opts.instance, targetParameter: "gain" });
    };

    if (opts.shape === "swell") {
      const mid = (startBeats + endBeats) / 2;
      bindOne(startBeats, mid, 0.05, 1.0, "linear");
      bindOne(mid,        endBeats, 1.0, 0.05, "linear");
    } else if (opts.shape === "fade_in") {
      bindOne(startBeats, endBeats, 0.05, 1.0, "linear");
    } else if (opts.shape === "fade_out") {
      bindOne(startBeats, endBeats, 1.0, 0.05, "linear");
    } else {
      bindOne(startBeats, endBeats, opts.shape.from, opts.shape.to, opts.shape.curve ?? "linear");
    }
  }


  /**
   * A named section: a labeled range of harmonic spans.
   * Returned by .section() and accepted by placement helpers.
   *
   * Sections are utility objects, not graph entities. They're for readability
   * and avoiding fragile array slicing with magic indices.
   */
  section(name: string, spans: Id[]): Section {
    if (spans.length === 0) throw new Error(`Section "${name}" must have at least one span`);
    const first = lookup<HarmonicSpan>(this.graph, spans[0]);
    const last = lookup<HarmonicSpan>(this.graph, spans[spans.length - 1]);
    return {
      name,
      spans,
      startBeats: first.startBeats,
      endBeats: last.endBeats,
    };
  }

  // --- Instances --------------------------------------------------------

  /**
   * Build a rhythm from a mini-notation string.
   * Each space-separated token is one step.
   *   "x" = onset at normal velocity (velMul 1.0)
   *   "X" = accented onset (velMul 1.3)
   *   "." = rest
   *   "x*N" or "X*N" = N consecutive onsets of that kind
   *
   * Examples (with unitBeats = 4):
   *   "X . x . X . x ."    → accents on beats 1 and 3, normals on 2 and 4
   *   "x*8"                → 8 normal onsets (eighths if unit=4)
   *   "X x x x X x x x"    → backbeat accent pattern
   */
  rhythmMini(pattern: string, unitBeats: number): { at: number; dur: number; velMul?: number }[] {
    const tokens: string[] = [];
    for (const t of pattern.trim().split(/\s+/)) {
      const m = t.match(/^([xX.])\*(\d+)$/);
      if (m) {
        for (let i = 0; i < parseInt(m[2]); i++) tokens.push(m[1]);
      } else {
        tokens.push(t);
      }
    }
    const stepDur = 1 / tokens.length;
    const onsets: { at: number; dur: number; velMul?: number }[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === "x") onsets.push({ at: i * stepDur, dur: stepDur, velMul: 1.0 });
      else if (tokens[i] === "X") onsets.push({ at: i * stepDur, dur: stepDur, velMul: 1.3 });
    }
    void unitBeats;
    return onsets;
  }

  /**
   * Build a progression of harmonic spans from a mini-notation string.
   * Each token is a degree like "i", "IV", "II", optionally "*N" for repetition.
   *
   *   "i*4 II*2 i*2 i*2 VII VI V*2 II i"
   *
   * Returns the span IDs in order. Each step is one bar by default; pass
   * `beatsPerStep` to change (e.g. 8 = two bars per chord at 4/4).
   */
  progression(opts: {
    inKey: Id;
    pattern: string;
    startBeats?: number;
    beatsPerStep?: number;
  }): Id[] {
    const beatsPerStep = opts.beatsPerStep ?? 4;
    const tokens: string[] = [];
    for (const t of opts.pattern.trim().split(/\s+/)) {
      const m = t.match(/^([ivIV]+)\*(\d+)$/);
      if (m) {
        for (let i = 0; i < parseInt(m[2]); i++) tokens.push(m[1]);
      } else {
        tokens.push(t);
      }
    }
    const ids: Id[] = [];
    let pos = opts.startBeats ?? 0;
    for (const t of tokens) {
      ids.push(this.harmonicSpan({
        inKey: opts.inKey,
        degree: t as ScaleDegree,
        startBeats: pos,
        endBeats: pos + beatsPerStep,
      }));
      pos += beatsPerStep;
    }
    return ids;
  }

  /**
   * Place a single note inline — no need to declare a pattern struct first.
   * Specify the pitch by exactly one of: degree (scale), chordTone, or pc (absolute).
   * `dur` is in beats (absolute); position is the start of the given span (or atBeats).
   */
  placeNote(opts: {
    underHarmonicSpan?: Id;
    atBeats?: number;             // absolute beat position; only used if no span
    track: Id;
    register: number;
    durBeats: number;
    velocity?: number;
    degree?: number;              // scale degree (0..6)
    chordTone?: number;           // chord tone (0=root, 1=3rd, 2=5th)
    pc?: number;                  // absolute pitch class 0..11
    transform?: "none" | "invert" | "retrograde";
  }): Id {
    if ([opts.degree, opts.chordTone, opts.pc].filter(x => x !== undefined).length !== 1) {
      throw new Error("placeNote: specify exactly one of degree, chordTone, pc");
    }
    let note: MelodicNoteSpec;
    if (opts.degree !== undefined) note = { kind: "scale_degree", value: opts.degree };
    else if (opts.chordTone !== undefined) note = { kind: "chord_tone", value: opts.chordTone };
    else note = { kind: "fixed_pc", value: opts.pc! };

    // We use the span's full length as unitBeats; the single note has dur = durBeats/unitBeats.
    // Caller responsibility to give a sensible durBeats relative to the span.
    const unitBeats = opts.underHarmonicSpan
      ? (lookup<HarmonicSpan>(this.graph, opts.underHarmonicSpan).endBeats
         - lookup<HarmonicSpan>(this.graph, opts.underHarmonicSpan).startBeats)
      : opts.durBeats;
    const pat = this.melodicPattern({
      unitBeats,
      ownRhythm: [{ at: 0, dur: opts.durBeats / unitBeats }],
      notes: [note],
      defaultRegister: opts.register,
      transform: opts.transform ?? "none",
    });
    if (opts.underHarmonicSpan) {
      return this.placeUnder({
        pattern: pat, underHarmonicSpan: opts.underHarmonicSpan,
        track: opts.track, register: opts.register, velocity: opts.velocity,
      });
    }
    return this.placeAt({
      pattern: pat, atBeats: opts.atBeats ?? 0,
      track: opts.track, velocity: opts.velocity,
    });
  }

  /**
   * Place a pattern across spans with optional per-position variations.
   *
   *   vary: [
   *     { every: 4, use: hatFillPat },       // every 4th step uses a different pattern
   *     { chance: 0.2, use: ghostPat, seed: 7 },  // 20% chance to swap (deterministic seed)
   *     { onSteps: [3, 7], use: accentPat },  // explicit step indices
   *   ]
   *
   * Rules apply in order; later rules override earlier ones for a given step.
   * Returns instance IDs in step order.
   */
  placeVarying(opts: {
    default: Id;
    underSpans: Id[];
    track: Id;
    register?: number;
    velocity?: number;
    vary?: Array<
      | { every: number; use: Id; offset?: number }
      | { chance: number; use: Id; seed?: number }
      | { onSteps: number[]; use: Id }
    >;
  }): Id[] {
    const ids: Id[] = [];
    const rules = opts.vary ?? [];
    // Deterministic RNG seeded per-rule
    const makeRng = (seed: number) => {
      let s = seed >>> 0;
      return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
    };
    const rngs = rules.map(r => "chance" in r ? makeRng((r as any).seed ?? 1234) : null);
    for (let i = 0; i < opts.underSpans.length; i++) {
      let pat = opts.default;
      for (let ri = 0; ri < rules.length; ri++) {
        const r = rules[ri];
        if ("every" in r) {
          const off = r.offset ?? 0;
          if (((i - off) % r.every) === 0 && i >= off) pat = r.use;
        } else if ("chance" in r) {
          if (rngs[ri]!() < r.chance) pat = r.use;
        } else if ("onSteps" in r) {
          if (r.onSteps.includes(i)) pat = r.use;
        }
      }
      ids.push(this.placeUnder({
        pattern: pat, underHarmonicSpan: opts.underSpans[i],
        track: opts.track, register: opts.register, velocity: opts.velocity,
      }));
    }
    return ids;
  }

  /** Place a pattern under each of the given harmonic spans. Returns instance IDs. */
  placeRange(opts: {
    pattern: Id;
    underSpans: Id[];
    track: Id;
    register?: number;
    velocity?: number;
  }): Id[] {
    const ids: Id[] = [];
    for (const h of opts.underSpans) {
      ids.push(this.placeUnder({
        pattern: opts.pattern, underHarmonicSpan: h,
        track: opts.track, register: opts.register, velocity: opts.velocity,
      }));
    }
    return ids;
  }

  /** Place a pattern under a harmonic span. */
  placeUnder(opts: {
    pattern: Id;
    underHarmonicSpan: Id;
    track: Id;
    register?: number;
    velocity?: number;
  }): Id {
    return this.add<PatternInstance>({
      kind: "instance", id: mkId("inst"),
      ...opts,
    });
  }

  /** Place a pattern at an absolute beat position (e.g. for a drum pulse). */
  placeAt(opts: {
    pattern: Id;
    atBeats: number;
    track: Id;
    velocity?: number;
  }): Id {
    return this.add<PatternInstance>({
      kind: "instance", id: mkId("inst"),
      ...opts,
    });
  }

  // --- Envelopes --------------------------------------------------------

  envelope(opts: Omit<Envelope, "kind" | "id">): Id {
    return this.add<Envelope>({
      kind: "envelope", id: mkId("env"),
      ...opts,
    });
  }

  bindEnvelope(opts: { envelope: Id; targetEntity: Id; targetParameter: string }): Id {
    return this.add<EnvelopeBinding>({
      kind: "relationship", type: "envelope_binding", id: mkId("bind"),
      ...opts,
    });
  }

  sidechain(opts: {
    trigger: Id;
    ducks: Id[];
    amount?: number;
    releaseMs?: number;
  }): Id {
    return this.add<SidechainRelationship>({
      kind: "relationship", type: "sidechain", id: mkId("sc"),
      trigger: opts.trigger, ducks: opts.ducks,
      amount: opts.amount ?? 0.35,
      releaseMs: opts.releaseMs ?? 180,
    });
  }

  // --- Constraints ------------------------------------------------------

  smoothVoiceLeading(appliesTo: Id[], weight = 1): Id {
    return this.add<SmoothVoiceLeadingConstraint>({
      kind: "constraint", type: "smooth_voice_leading", id: mkId("c_svl"),
      appliesTo, weight,
    });
  }

  registerRange(appliesTo: Id, minMidi: number, maxMidi: number, weight = Infinity): Id {
    return this.add<RegisterRangeConstraint>({
      kind: "constraint", type: "register_range", id: mkId("c_reg"),
      appliesTo, minMidi, maxMidi, weight,
    });
  }
}

export function lookup<T extends Node>(g: Graph, id: Id): T {
  const n = g.nodes.get(id);
  if (!n) throw new Error(`Node not found: ${id}`);
  return n as T;
}

export function allOf<T extends Node>(g: Graph, predicate: (n: Node) => n is T): T[] {
  return [...g.nodes.values()].filter(predicate);
}

export interface Section {
  name: string;
  spans: Id[];
  startBeats: number;
  endBeats: number;
}
