/**
 * The solver.
 *
 * Walks the graph, derives properties on relationships, expands
 * pattern instances into concrete events, then applies constraints
 * to adjust voicings.
 *
 * Two-pass:
 *   Pass 1 — derive: fill in harmonic_span.derived, expand instances
 *            to events, resolve melodic note pitches relative to harmony.
 *   Pass 2 — constrain: walk constraints, optimize over the entities
 *            they cover. Currently greedy / local; that's fine for now.
 *
 * The result is a flat array of concrete events ready to render.
 */
import type {
  Graph, Node, Event, PitchClass, HarmonicSpan, MelodicPattern,
  RhythmicPattern, PatternInstance, MelodicNoteSpec,
  SmoothVoiceLeadingConstraint, RegisterRangeConstraint, Modulation, KeyContext,
} from "./types.ts";
import { lookup } from "./graph.ts";
import {
  scaleTonePcs, chordTonePcsForDegree, extendedChordTonePcsForDegree, rootPcForDegree,
  functionLabelForDegree, closestMidiOfPc, placePcInRegister, keyLabel,
} from "./theory.ts";

interface SolvedEvent extends Event {
  /** Which instance/pattern produced this event — used by constraints */
  fromInstance?: string;
  /** Which note-index within the pattern — used for voice-leading mapping */
  noteIndex?: number;
}

export interface SolveResult {
  events: SolvedEvent[];
  /** Per-instance: the concrete MIDI notes assigned, in note-order */
  instanceVoicings: Map<string, number[]>;
  /** Diagnostic: what each harmonic span resolved to */
  harmonicSummary: { spanId: string; degree: string; root: string; tones: string[]; function: string }[];
  /** Total voice-leading motion across constrained sequences (smaller = smoother) */
  totalVoiceLeadingMotion: number;
  /** Modulations present in the graph (for diagnostics) */
  modulations: { atBeats: number; from: string; to: string; method: string; pivot: string[] }[];
}

export function solve(g: Graph): SolveResult {
  const events: SolvedEvent[] = [];
  const instanceVoicings = new Map<string, number[]>();
  const harmonicSummary: SolveResult["harmonicSummary"] = [];
  const modulations = collectModulations(g);

  // ---- Pass 1a: derive properties on harmonic spans ----
  const harmonicSpanNodes = [...g.nodes.values()]
    .filter((n): n is HarmonicSpan => n.kind === "relationship" && n.type === "harmonic_span")
    .sort((a, b) => a.startBeats - b.startBeats);

  for (const span of harmonicSpanNodes) {
      const key = lookup<any>(g, span.inKey);
      const chordTones = chordTonePcsForDegree(key, span.degree);
      const extendedTones = extendedChordTonePcsForDegree(key, span.degree);
      const scaleTones = scaleTonePcs(key);
      const rootPc = rootPcForDegree(key, span.degree);
      span.derived = {
        rootPc,
        chordTonePcs: chordTones,
        extendedChordTonePcs: extendedTones,
        scaleTonePcs: scaleTones,
        functionLabel: functionLabelForDegree(span.degree, key.mode),
      };
      harmonicSummary.push({
        spanId: span.id,
        degree: span.degree,
        root: noteName(rootPc),
        tones: chordTones.map(noteName),
        function: span.derived.functionLabel,
      });
  }

  // ---- Pass 1b: expand pattern instances into events ----
  for (const node of g.nodes.values()) {
    if (node.kind !== "instance") continue;
    const inst = node as PatternInstance;
    expandInstance(g, inst, events, instanceVoicings);
  }

  // Collect register_range constraints up front; voice-leading uses them.
  const rangeByInstance = new Map<string, { min: number; max: number }>();
  for (const node of g.nodes.values()) {
    if (node.kind === "constraint" && node.type === "register_range") {
      const c = node as RegisterRangeConstraint;
      rangeByInstance.set(c.appliesTo, { min: c.minMidi, max: c.maxMidi });
    }
  }

  // Clamp initial voicings to their register range BEFORE voice-leading,
  // so voice-leading optimizes from a sensible starting point.
  for (const [instId, range] of rangeByInstance) {
    const cur = instanceVoicings.get(instId);
    if (!cur) continue;
    const fixed = cur.map(m => {
      let n = m;
      while (n < range.min) n += 12;
      while (n > range.max) n -= 12;
      return n;
    });
    instanceVoicings.set(instId, fixed);
    for (const ev of events) {
      if (ev.fromInstance === instId && ev.noteIndex !== undefined && ev.pitch !== undefined) {
        ev.pitch = fixed[ev.noteIndex % fixed.length];
      }
    }
  }

  // ---- Pass 2: apply constraints ----
  let totalMotion = 0;
  const modulationByKeyPair = indexModulations(g, modulations);
  for (const node of g.nodes.values()) {
    if (node.kind !== "constraint") continue;

    if (node.type === "smooth_voice_leading") {
      const c = node as SmoothVoiceLeadingConstraint;
      const motion = applySmoothVoiceLeading(
        g, c, instanceVoicings, events, rangeByInstance, modulationByKeyPair,
      );
      totalMotion += motion;
    }
    // register_range is handled above (as initialization) AND embedded in voice-leading.
  }

  // ---- Pass 2.5: apply velocity envelopes ----
  // Look for envelope bindings with parameter === "velocity" targeting a track.
  // Scale each event on that track by the envelope value at its position.
  for (const node of g.nodes.values()) {
    if (node.kind !== "relationship" || (node as any).type !== "envelope_binding") continue;
    const bind = node as any;
    if (bind.targetParameter !== "velocity") continue;
    const env = lookup<any>(g, bind.envelope);
    // Track-targeted: scale all events on that track within the envelope span
    for (const ev of events) {
      if (ev.track !== bind.targetEntity) continue;
      if (ev.positionBeats < env.startBeats || ev.positionBeats > env.endBeats) continue;
      const t = (ev.positionBeats - env.startBeats) / (env.endBeats - env.startBeats);
      let mul: number;
      if (env.curve === "exp") mul = env.from * Math.pow(env.to / Math.max(0.001, env.from), t);
      else if (env.curve === "log") mul = env.from + (env.to - env.from) * Math.log(1 + 9 * t) / Math.log(10);
      else mul = env.from + (env.to - env.from) * t;
      ev.velocity = Math.max(1, Math.min(127, Math.round((ev.velocity ?? 90) * mul)));
    }
  }

  // ---- Pass 3: apply swing if set on transport ----
  // Shifts off-eighth positions (the "&" of each beat) later in time.
  // swing=0 → no change. swing=1 → full triplet swing (offbeat at 2/3 of beat).
  const transport = g.nodes.get(g.transport) as any;
  const swing = transport?.swing ?? 0;
  if (swing > 0) {
    const maxShift = (1 / 6) * swing;  // up to 1/6 beat for full triplet feel
    for (const ev of events) {
      const beatFrac = ev.positionBeats - Math.floor(ev.positionBeats);
      // Detect "& of beat": position fraction near 0.5 within a beat
      if (Math.abs(beatFrac - 0.5) < 0.02) {
        ev.positionBeats += maxShift;
      }
    }
  }

  events.sort((a, b) => a.positionBeats - b.positionBeats);
  return { events, instanceVoicings, harmonicSummary, totalVoiceLeadingMotion: totalMotion, modulations };
}

// ---- Expansion ---------------------------------------------------------

function expandInstance(
  g: Graph, inst: PatternInstance,
  events: SolvedEvent[], voicings: Map<string, number[]>,
) {
  const pat = lookup<Node>(g, inst.pattern);

  if (pat.kind === "relationship" && pat.type === "rhythmic_pattern") {
    // Pure rhythm — no pitch. Used for drums/pulses.
    expandRhythm(inst, pat as RhythmicPattern, events);
    return;
  }
  if (pat.kind === "relationship" && pat.type === "melodic_pattern") {
    expandMelodic(g, inst, pat as MelodicPattern, events, voicings);
    return;
  }
  throw new Error(`Unsupported pattern kind in instance ${inst.id}`);
}

function expandRhythm(inst: PatternInstance, pat: RhythmicPattern, events: SolvedEvent[]) {
  // For pure rhythm instances we need an atBeats anchor OR a harmonic span to inherit timing from.
  let start = 0;
  let span = pat.unitBeats;
  if (inst.atBeats !== undefined) {
    start = inst.atBeats;
  }
  for (const onset of pat.onsets) {
    events.push({
      kind: "event",
      id: `${inst.id}_${events.length}`,
      positionBeats: start + onset.at * span,
      durationBeats: onset.dur * span,
      track: inst.track,
      velocity: inst.velocity ?? 100,
      fromInstance: inst.id,
    });
  }
}

function findHarmonicSpanAtBeat(g: Graph, beat: number): HarmonicSpan | undefined {
  let found: HarmonicSpan | undefined;
  for (const node of g.nodes.values()) {
    if (node.kind !== "relationship" || node.type !== "harmonic_span") continue;
    const span = node as HarmonicSpan;
    if (beat >= span.startBeats && beat < span.endBeats - 1e-9) {
      if (!found || span.startBeats >= found.startBeats) found = span;
    }
  }
  return found;
}

function expandMelodic(
  g: Graph, inst: PatternInstance, pat: MelodicPattern,
  events: SolvedEvent[], voicings: Map<string, number[]>,
) {
  let span: HarmonicSpan;
  if (inst.underHarmonicSpan) {
    span = lookup<HarmonicSpan>(g, inst.underHarmonicSpan);
  } else if (inst.atBeats !== undefined) {
    const atSpan = findHarmonicSpanAtBeat(g, inst.atBeats);
    if (!atSpan) {
      throw new Error(`Melodic pattern instance ${inst.id} at beat ${inst.atBeats} has no harmonic context`);
    }
    span = atSpan;
  } else {
    throw new Error(`Melodic pattern instance ${inst.id} needs underHarmonicSpan or atBeats`);
  }
  if (!span.derived) throw new Error(`Harmonic span ${span.id} not derived`);

  // Resolve rhythm
  let rhythm: { at: number; dur: number; velMul?: number }[];
  let rhythmUnitBeats: number;
  if (pat.ownRhythm) {
    rhythm = pat.ownRhythm;
    rhythmUnitBeats = pat.unitBeats;
  } else if (pat.borrowRhythm) {
    const r = lookup<RhythmicPattern>(g, pat.borrowRhythm);
    rhythm = r.onsets;
    rhythmUnitBeats = r.unitBeats;
  } else {
    throw new Error(`Melodic pattern ${pat.id} has neither ownRhythm nor borrowRhythm`);
  }

  const spanStart = inst.atBeats ?? span.startBeats;
  const spanLen = span.endBeats - span.startBeats;

  // Compute pitch classes from note specs
  let notes = pat.notes;
  if (pat.transform === "retrograde") {
    notes = [...notes].reverse();
  }
  // For 'invert' on chord_tone/scale_degree patterns, we invert at the
  // SPEC level — mirror the indices around their mean. This keeps the
  // motif diatonic to the chord/scale, which is what musicians mean by
  // inversion within a tonal context. Literal MIDI-interval mirroring
  // would produce notes outside the chord.
  if (pat.transform === "invert") {
    const indexable = notes.every(n => n.kind === "chord_tone" || n.kind === "scale_degree");
    if (indexable) {
      const vals = notes.map(n => n.value);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      notes = notes.map(n => ({ kind: n.kind, value: min + max - n.value }));
    }
  }

  const register = inst.register ?? pat.defaultRegister;

  // First resolve to MIDI notes
  const midiNotes: number[] = [];
  let prevMidi: number | null = null;
  for (let i = 0; i < notes.length; i++) {
    const spec = notes[i];
    const midi = resolveNoteSpec(spec, span, register, prevMidi);
    midiNotes.push(midi);
    prevMidi = midi;
  }

  // (literal MIDI-interval inversion path removed; see spec-level inversion above)

  voicings.set(inst.id, midiNotes);

  // Emit events tiling rhythm across the span. Velocity gets multiplied by per-onset velMul (accents).
  let cursor = inst.atBeats ?? span.startBeats;
  const spanEnd = inst.atBeats !== undefined ? inst.atBeats + pat.unitBeats : span.endBeats;
  let i = 0;
  while (cursor < spanEnd - 1e-9) {
    for (let k = 0; k < rhythm.length; k++) {
      const onsetAt = cursor + rhythm[k].at * rhythmUnitBeats;
      if (onsetAt >= spanEnd - 1e-9) break;
      const midi = midiNotes[i % midiNotes.length];
      const baseVel = inst.velocity ?? 90;
      const velMul = rhythm[k].velMul ?? 1.0;
      events.push({
        kind: "event",
        id: `${inst.id}_${i}`,
        positionBeats: onsetAt,
        durationBeats: Math.min(rhythm[k].dur * rhythmUnitBeats, spanEnd - onsetAt),
        track: inst.track,
        pitch: midi,
        velocity: Math.min(127, Math.round(baseVel * velMul)),
        fromInstance: inst.id,
        noteIndex: i,
      });
      i++;
    }
    cursor += rhythmUnitBeats;
  }
}

function resolveNoteSpec(
  spec: MelodicNoteSpec, span: HarmonicSpan, register: number, prevMidi: number | null,
): number {
  const d = span.derived!;
  switch (spec.kind) {
    case "chord_tone": {
      // Triad indices 0/1/2 (root/3/5) use the basic triad.
      // Indices 3/4/5/6 (7/9/11/13) use the extended diatonic stack.
      const pool = spec.value > 2 && d.extendedChordTonePcs
        ? d.extendedChordTonePcs
        : d.chordTonePcs;
      const pc = pool[spec.value % pool.length];
      return placeInBand(pc, register, prevMidi);
    }
    case "scale_degree": {
      const pc = d.scaleTonePcs[spec.value % d.scaleTonePcs.length];
      return placeInBand(pc, register, prevMidi);
    }
    case "interval_from_prev": {
      if (prevMidi === null) return placePcInRegister(d.rootPc, register);
      return prevMidi + spec.value;
    }
    case "fixed_pc": {
      return placePcInRegister(spec.value as PitchClass, register);
    }
  }
}

/**
 * Place a pitch class in the octave band [registerMidi, registerMidi+12).
 * Each pitch class has exactly one octave that falls in the band, so this
 * is deterministic. The result: a pattern's notes stay in a stable register,
 * but the contour varies across different chords because each chord's
 * pitch classes lay out differently within the band. That contour
 * variation IS the parametric feature — same motif, different shape per chord.
 */
function placeInBand(pc: PitchClass, register: number, _prevMidi: number | null): number {
  const bandLow = placePcInRegister(0, register);
  return bandLow + pc;
}

// ---- Constraint solving (greedy local) ---------------------------------

/**
 * For each adjacent pair of instances in the sequence, re-voice
 * the second so that each note is moved to the closest octave of
 * its pitch class relative to the corresponding note of the first.
 *
 * If a register_range constraint exists on the target instance, the
 * search is restricted to octaves within that range, so voice-leading
 * can't drift voices off the keyboard.
 */
function collectModulations(g: Graph): SolveResult["modulations"] {
  const out: SolveResult["modulations"] = [];
  for (const node of g.nodes.values()) {
    if (node.kind !== "relationship" || node.type !== "modulation") continue;
    const m = node as Modulation;
    const fromKey = lookup<KeyContext>(g, m.fromKey);
    const toKey = lookup<KeyContext>(g, m.toKey);
    out.push({
      atBeats: m.atBeats,
      from: keyLabel(fromKey),
      to: keyLabel(toKey),
      method: m.method,
      pivot: (m.pivotPcs ?? []).map(noteName),
    });
  }
  return out.sort((a, b) => a.atBeats - b.atBeats);
}

function indexModulations(
  g: Graph,
  _summary: SolveResult["modulations"],
): Map<string, Modulation> {
  const map = new Map<string, Modulation>();
  for (const node of g.nodes.values()) {
    if (node.kind !== "relationship" || node.type !== "modulation") continue;
    const m = node as Modulation;
    map.set(`${m.fromKey}->${m.toKey}@${m.atBeats}`, m);
  }
  return map;
}

function findModulationForInstances(
  g: Graph,
  prevInstId: string,
  curInstId: string,
  modIndex: Map<string, Modulation>,
): Modulation | undefined {
  const prevInst = g.nodes.get(prevInstId) as PatternInstance | undefined;
  const curInst = g.nodes.get(curInstId) as PatternInstance | undefined;
  if (!prevInst?.underHarmonicSpan || !curInst?.underHarmonicSpan) return undefined;
  const prevSpan = lookup<HarmonicSpan>(g, prevInst.underHarmonicSpan);
  const curSpan = lookup<HarmonicSpan>(g, curInst.underHarmonicSpan);
  if (prevSpan.inKey === curSpan.inKey) return undefined;

  for (const m of modIndex.values()) {
    if (m.fromKey === prevSpan.inKey && m.toKey === curSpan.inKey) return m;
  }
  return undefined;
}

function closestMidiViaPivot(
  pc: PitchClass,
  targetMidi: number,
  pivotPcs: PitchClass[],
  range?: { min: number; max: number },
): number {
  const baseOctave = Math.floor(targetMidi / 12);
  const candidates: number[] = [];
  for (let oct = baseOctave - 2; oct <= baseOctave + 2; oct++) {
    const n = oct * 12 + pc;
    if (range && (n < range.min || n > range.max)) continue;
    candidates.push(n);
  }
  if (candidates.length === 0) return closestMidiOfPc(pc, targetMidi);

  return candidates.reduce((best, c) => {
    const dist = Math.abs(c - targetMidi);
    const pivotBonus = pivotPcs.includes(pc) ? 2 : 0;
    const bestDist = Math.abs(best - targetMidi) - (pivotPcs.includes(pc) ? 2 : 0);
    return dist - pivotBonus < bestDist ? c : best;
  }, candidates[0]);
}

function applySmoothVoiceLeading(
  g: Graph,
  c: SmoothVoiceLeadingConstraint,
  voicings: Map<string, number[]>,
  events: SolvedEvent[],
  rangeByInstance: Map<string, { min: number; max: number }>,
  modIndex: Map<string, Modulation>,
): number {
  let totalMotion = 0;
  for (let i = 1; i < c.appliesTo.length; i++) {
    const prevId = c.appliesTo[i - 1];
    const curId = c.appliesTo[i];
    const prev = voicings.get(prevId);
    const cur = voicings.get(curId);
    if (!prev || !cur) continue;

    const range = rangeByInstance.get(curId);
    const modulation = findModulationForInstances(g, prevId, curId, modIndex);
    const pivotPcs = modulation?.pivotPcs ?? [];

    const newCur = cur.map((m, idx) => {
      const target = prev[idx % prev.length];
      const pc = ((m % 12) + 12) % 12;
      if (modulation && pivotPcs.length > 0) {
        return closestMidiViaPivot(pc, target, pivotPcs, range);
      }
      if (range) {
        // Find octaves of pc within [min, max]; among those, closest to target.
        const candidates: number[] = [];
        for (let oct = -1; oct < 10; oct++) {
          const n = (oct + 1) * 12 + pc;
          if (n >= range.min && n <= range.max) candidates.push(n);
        }
        if (candidates.length === 0) return closestMidiOfPc(pc, target);
        return candidates.reduce((best, c2) =>
          Math.abs(c2 - target) < Math.abs(best - target) ? c2 : best, candidates[0]);
      }
      return closestMidiOfPc(pc, target);
    });
    // Sort ascending so voices don't cross. For block triadic voicings,
    // voice identity isn't meaningful — only the resulting chord stack is.
    newCur.sort((a, b) => a - b);

    voicings.set(curId, newCur);

    // Update events
    for (const ev of events) {
      if (ev.fromInstance === curId && ev.noteIndex !== undefined && ev.pitch !== undefined) {
        ev.pitch = newCur[ev.noteIndex % newCur.length];
      }
    }
    for (let k = 0; k < newCur.length; k++) {
      totalMotion += Math.abs(newCur[k] - prev[k % prev.length]);
    }
  }
  return totalMotion;
}

// (register_range constraints are handled inline during pass 2 setup
//  and inside applySmoothVoiceLeading; no separate pass needed.)

// ---- Helpers -----------------------------------------------------------

function noteName(pc: PitchClass): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return names[pc];
}
