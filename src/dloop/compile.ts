/**
 * Compile .loop AST → GraphBuilder graph.
 */
import { GraphBuilder, lookup } from "../core/graph.ts";
import type { Graph, HarmonicSpan, KeyContext, MelodicNoteSpec } from "../core/types.ts";
import { pcFromName } from "../core/theory.ts";
import { buildInstrument, type InstrumentName } from "../instruments/registry.ts";
import { noteSpecsToMelodic, parseLoop, rhythmToOnsets } from "./parse.ts";
import type {
  LoopFile,
  NoteSpec,
  PatternDecl,
  PlaceNoteDecl,
  PlaceRangeDecl,
  PlaceVaryingDecl,
  PlacementDecl,
  SpanRef,
} from "./types.ts";

const MODES = new Set<KeyContext["mode"]>([
  "major",
  "natural_minor",
  "harmonic_minor",
  "dorian",
  "mixolydian",
  "phrygian_dominant",
]);

export function compileLoop(source: string): Graph {
  return compileLoopFile(parseLoop(source));
}

export function compileLoopFile(file: LoopFile): Graph {
  const b = new GraphBuilder();

  if (file.tempo === undefined || file.meter === undefined) {
    throw new Error(".loop file requires @tempo and @meter");
  }

  const tempo = b.tempo(file.tempo);
  const meter = b.meter(file.meter.beats, file.meter.unit);
  b.transport(tempo, meter, file.swing !== undefined ? { swing: file.swing } : {});

  const keyDecls = [...file.keys];
  if (file.key) {
    keyDecls.unshift({ name: "default", tonic: file.key.tonic, mode: file.key.mode });
  }
  if (keyDecls.length === 0) {
    throw new Error(".loop file requires @key or named key declarations");
  }

  const keyIds = new Map<string, string>();
  for (const k of keyDecls) {
    const mode = k.mode.replace(/-/g, "_") as KeyContext["mode"];
    if (!MODES.has(mode)) throw new Error(`Unknown mode: ${k.mode}`);
    keyIds.set(k.name, b.key(pcFromName(k.tonic), mode));
  }

  const trackIds = new Map<string, string>();
  const instrumentIds = new Map<string, string>();

  for (const t of file.tracks) {
    let instrumentRef: string | undefined;
    if (t.instrument) {
      if (!instrumentIds.has(t.instrument)) {
        const built = buildInstrument(t.instrument as InstrumentName);
        instrumentIds.set(t.instrument, built.id);
      }
      instrumentRef = instrumentIds.get(t.instrument);
    }
    const id = b.track(t.name, t.channel, {
      isPercussion: t.percussion,
      instrument: instrumentRef,
    });
    trackIds.set(t.name, id);
  }

  const progressionSpans = new Map<string, string[]>();
  let chainStart = 0;
  for (const p of file.progressions) {
    const inKey = keyIds.get(p.keyName);
    if (!inKey) throw new Error(`Unknown key: ${p.keyName}`);
    const startBeats = p.startBeats ?? chainStart;
    const pattern = p.degrees.join(" ");
    const spans = b.progression({
      inKey,
      pattern,
      beatsPerStep: p.beatsPerStep,
      startBeats,
    });
    progressionSpans.set(p.name, spans);
    const last = lookup<HarmonicSpan>(b.graph, spans[spans.length - 1]);
    chainStart = last.endBeats;
  }

  const sectionSpans = new Map<string, string[]>();
  for (const s of file.sections) {
    const spans = progressionSpans.get(s.progression);
    if (!spans) throw new Error(`Unknown progression for section ${s.name}: ${s.progression}`);
    sectionSpans.set(s.name, spans);
  }
  // Section name may alias progression name when no explicit section decl.
  for (const [name, spans] of progressionSpans) {
    if (!sectionSpans.has(name)) sectionSpans.set(name, spans);
  }

  const patternIds = new Map<string, string>();
  for (const p of file.patterns) {
    patternIds.set(p.name, compilePattern(b, p));
  }

  for (const mod of file.modulations) {
    const fromKey = keyIds.get(mod.fromKey);
    const toKey = keyIds.get(mod.toKey);
    if (!fromKey) throw new Error(`Unknown from key: ${mod.fromKey}`);
    if (!toKey) throw new Error(`Unknown to key: ${mod.toKey}`);

    if (mod.method === "direct" && !mod.pivotDegree && !mod.pivotBeats) {
      b.modulate({
        fromKey,
        toKey,
        atBeats: mod.atBeats,
        method: mod.method,
      });
    } else {
      const { pivotSpan } = b.modulateWithPivot({
        fromKey,
        toKey,
        atBeats: mod.atBeats,
        method: mod.method,
        pivotDegree: mod.pivotDegree as import("../core/types.ts").ScaleDegree | undefined,
        pivotBeats: mod.pivotBeats,
      });
      sectionSpans.set("pivot", [pivotSpan]);
    }
  }

  const instancesByTrackTarget = new Map<string, string[]>();

  const recordInstance = (track: string, target: string, inst: string) => {
    const k = `${track}:${target}`;
    const list = instancesByTrackTarget.get(k) ?? [];
    list.push(inst);
    instancesByTrackTarget.set(k, list);
    const allK = `${track}:*`;
    const allList = instancesByTrackTarget.get(allK) ?? [];
    allList.push(inst);
    instancesByTrackTarget.set(allK, allList);
  };

  const placeOnSpans = (
    pattern: string,
    spans: string[],
    track: string,
    targetLabel: string,
    opts: { register?: number; velocity?: number; velocities?: number[] },
  ) => {
    const patId = patternIds.get(pattern);
    const trackId = trackIds.get(track);
    if (!patId) throw new Error(`Unknown pattern: ${pattern}`);
    if (!trackId) throw new Error(`Unknown track: ${track}`);
    if (opts.velocities && opts.velocities.length !== spans.length) {
      throw new Error(
        `place_range ${pattern}: ${opts.velocities.length} velocities for ${spans.length} spans`,
      );
    }
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const inst = b.placeUnder({
        pattern: patId,
        underHarmonicSpan: span,
        track: trackId,
        register: opts.register,
        velocity: opts.velocities?.[i] ?? opts.velocity,
      });
      recordInstance(track, targetLabel, inst);
    }
  };

  for (const pl of file.placements) {
    const spans = resolveSpanRefs([pl.target], progressionSpans, sectionSpans);
    placeOnSpans(pl.pattern, spans, pl.track, pl.target.name, pl);
  }

  for (const pr of file.placeRanges) {
    const spans = resolveSpanRefs(pr.spanRefs, progressionSpans, sectionSpans);
    const targetLabel = pr.spanRefs.map((r) => r.name).join("+");
    placeOnSpans(pr.pattern, spans, pr.track, targetLabel, pr);
  }

  for (const pv of file.placeVaryings) {
    compilePlaceVarying(b, pv, patternIds, trackIds, progressionSpans, sectionSpans, recordInstance);
  }

  for (const pn of file.placeNotes) {
    compilePlaceNote(b, pn, trackIds, progressionSpans, sectionSpans, recordInstance);
  }

  for (const pa of file.placeAts) {
    const patId = patternIds.get(pa.pattern);
    const trackId = trackIds.get(pa.track);
    if (!patId) throw new Error(`Unknown pattern: ${pa.pattern}`);
    if (!trackId) throw new Error(`Unknown track: ${pa.track}`);
    const inst = b.placeAt({
      pattern: patId,
      atBeats: pa.atBeats,
      track: trackId,
      velocity: pa.velocity,
    });
    recordInstance(pa.track, `at_${pa.atBeats}`, inst);
  }

  for (const sc of file.sidechains) {
    const trigger = trackIds.get(sc.trigger);
    if (!trigger) throw new Error(`Unknown sidechain trigger: ${sc.trigger}`);
    const ducks = sc.ducks.map((d) => {
      const id = trackIds.get(d);
      if (!id) throw new Error(`Unknown sidechain duck track: ${d}`);
      return id;
    });
    let startBeats = sc.startBeats;
    let endBeats = sc.endBeats;
    if (sc.spanRefs && sc.spanRefs.length > 0) {
      const spanIds = resolveSpanRefs(sc.spanRefs, progressionSpans, sectionSpans);
      const range = beatRangeForSpans(b.graph, spanIds);
      startBeats = range.startBeats;
      endBeats = range.endBeats;
    }
    b.sidechain({
      trigger,
      ducks,
      amount: sc.amount,
      releaseMs: sc.releaseMs,
      startBeats,
      endBeats,
    });
  }

  for (const tg of file.trackGains) {
    const trackId = trackIds.get(tg.track);
    if (!trackId) throw new Error(`Unknown track: ${tg.track}`);
    b.trackGain({
      track: trackId,
      shape: tg.shape,
      startBeats: tg.startBeats,
      endBeats: tg.endBeats,
    });
  }

  for (const vl of file.voiceLeading) {
    const k = `${vl.track}:${vl.target}`;
    const insts = instancesByTrackTarget.get(k);
    if (insts && insts.length > 1) b.smoothVoiceLeading(insts);
  }

  for (const rr of file.registerRanges) {
    const insts = instancesByTrackTarget.get(`${rr.track}:*`);
    if (!insts) continue;
    for (const inst of insts) b.registerRange(inst, rr.min, rr.max);
  }

  for (const env of file.envelopes) {
    const trackId = trackIds.get(env.targetTrack);
    if (!trackId) throw new Error(`Unknown envelope track: ${env.targetTrack}`);
    const envId = b.envelope({
      parameter: env.parameter,
      startBeats: env.startBeats,
      endBeats: env.endBeats,
      from: env.from,
      to: env.to,
      curve: env.curve,
    });
    b.bindEnvelope({
      envelope: envId,
      targetEntity: trackId,
      targetParameter: env.parameter,
    });
  }

  return b.graph;
}

function resolveSpanRefs(
  refs: SpanRef[],
  progressionSpans: Map<string, string[]>,
  sectionSpans: Map<string, string[]>,
): string[] {
  const out: string[] = [];
  for (const ref of refs) {
    out.push(...resolveSpanRef(ref, progressionSpans, sectionSpans));
  }
  return out;
}

function resolveSpanRef(
  ref: SpanRef,
  progressionSpans: Map<string, string[]>,
  sectionSpans: Map<string, string[]>,
): string[] {
  const all = sectionSpans.get(ref.name) ?? progressionSpans.get(ref.name);
  if (!all) throw new Error(`Unknown span target: ${ref.name}`);
  if (!ref.slice) return all;

  if (ref.slice.kind === "indices") {
    return ref.slice.indices.map((i) => {
      const span = all[i];
      if (!span) throw new Error(`Span index out of range: ${ref.name}[${i}]`);
      return span;
    });
  }

  const { start, end } = ref.slice;
  return all.slice(start, end ?? all.length);
}

function compilePlaceVarying(
  b: GraphBuilder,
  pv: PlaceVaryingDecl,
  patternIds: Map<string, string>,
  trackIds: Map<string, string>,
  progressionSpans: Map<string, string[]>,
  sectionSpans: Map<string, string[]>,
  recordInstance: (track: string, target: string, inst: string) => void,
) {
  const defaultPat = patternIds.get(pv.defaultPattern);
  const trackId = trackIds.get(pv.track);
  if (!defaultPat) throw new Error(`Unknown pattern: ${pv.defaultPattern}`);
  if (!trackId) throw new Error(`Unknown track: ${pv.track}`);

  const spans = resolveSpanRefs(pv.spanRefs, progressionSpans, sectionSpans);
  const varyRules = pv.vary.map((r) => {
    const pat = patternIds.get(r.pattern);
    if (!pat) throw new Error(`Unknown vary pattern: ${r.pattern}`);
    if (r.kind === "every") return { every: r.every, use: pat, offset: r.offset };
    if (r.kind === "chance") return { chance: r.chance, use: pat, seed: r.seed };
    return { onSteps: r.steps, use: pat };
  });

  const targetLabel = pv.spanRefs.map((r) => r.name).join("+");
  const insts = b.placeVarying({
    default: defaultPat,
    underSpans: spans,
    track: trackId,
    register: pv.register,
    velocity: pv.velocity,
    vary: varyRules,
  });
  for (const inst of insts) recordInstance(pv.track, targetLabel, inst);
}

function compilePlaceNote(
  b: GraphBuilder,
  pn: PlaceNoteDecl,
  trackIds: Map<string, string>,
  progressionSpans: Map<string, string[]>,
  sectionSpans: Map<string, string[]>,
  recordInstance: (track: string, target: string, inst: string) => void,
) {
  const trackId = trackIds.get(pn.track);
  if (!trackId) throw new Error(`Unknown track: ${pn.track}`);

  const opts: Parameters<GraphBuilder["placeNote"]>[0] = {
    track: trackId,
    register: pn.register,
    durBeats: pn.durBeats,
    velocity: pn.velocity,
  };

  if (pn.pitch.kind === "degree") opts.degree = pn.pitch.value;
  else if (pn.pitch.kind === "chord") opts.chordTone = pn.pitch.value;
  else opts.pc = pn.pitch.value;

  if (pn.spanRef) {
    const spans = resolveSpanRef(pn.spanRef, progressionSpans, sectionSpans);
    if (spans.length !== 1) throw new Error("place_note span must resolve to exactly one harmonic span");
    opts.underHarmonicSpan = spans[0];
  } else if (pn.atBeats !== undefined) {
    opts.atBeats = pn.atBeats;
  } else {
    throw new Error("place_note requires span or at");
  }

  const inst = b.placeNote(opts);
  const target = pn.spanRef?.name ?? "at";
  recordInstance(pn.track, target, inst);
}

function compilePattern(b: GraphBuilder, p: PatternDecl): string {
  let onsets = rhythmToOnsets(p.rhythm, p.unitBeats, (pat, unit) => b.rhythmMini(pat, unit));
  let notes: MelodicNoteSpec[] = noteSpecsToMelodic(p.notes);

  if (p.rhythm.kind === "hits") {
    const perHit = notes.length;
    const expandedNotes: MelodicNoteSpec[] = [];
    const expandedOnsets: typeof onsets = [];
    for (const h of p.rhythm.hits) {
      for (let i = 0; i < perHit; i++) {
        expandedNotes.push(notes[i]);
        expandedOnsets.push({ at: h.at, dur: h.dur });
      }
    }
    notes = expandedNotes;
    onsets = expandedOnsets;
  } else if (notes.length !== onsets.length && p.rhythm.kind !== "chord") {
    throw new Error(`Pattern ${p.name}: ${onsets.length} onsets but ${notes.length} notes`);
  }

  return b.melodicPattern({
    unitBeats: p.unitBeats,
    ownRhythm: onsets,
    notes: notes.length === onsets.length ? notes : notes.slice(0, onsets.length),
    defaultRegister: p.register,
    transform: p.transform,
  });
}

export { resolveSpanRef, resolveSpanRefs };

function beatRangeForSpans(g: Graph, spanIds: string[]): { startBeats: number; endBeats: number } {
  if (spanIds.length === 0) throw new Error("beatRangeForSpans: no spans");
  let start = Infinity;
  let end = 0;
  for (const id of spanIds) {
    const span = lookup<HarmonicSpan>(g, id);
    start = Math.min(start, span.startBeats);
    end = Math.max(end, span.endBeats);
  }
  return { startBeats: start, endBeats: end };
}
