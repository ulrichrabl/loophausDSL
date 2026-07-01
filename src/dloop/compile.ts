/**
 * Compile .loop AST → GraphBuilder graph.
 */
import { GraphBuilder } from "../core/graph.ts";
import type { Graph, KeyContext } from "../core/types.ts";
import { pcFromName } from "../core/theory.ts";
import { buildInstrument, type InstrumentName } from "../instruments/registry.ts";
import { parseLoop, rhythmToOnsets } from "./parse.ts";
import type { LoopFile, NoteSpec, PatternDecl, PlacementDecl } from "./types.ts";

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

  if (file.tempo === undefined || file.meter === undefined || file.key === undefined) {
    throw new Error(".loop file requires @tempo, @meter, and @key");
  }

  const tempo = b.tempo(file.tempo);
  const meter = b.meter(file.meter.beats, file.meter.unit);
  b.transport(tempo, meter, file.swing !== undefined ? { swing: file.swing } : {});

  const mode = file.key.mode.replace(/-/g, "_") as KeyContext["mode"];
  if (!MODES.has(mode)) throw new Error(`Unknown mode: ${file.key.mode}`);
  const key = b.key(pcFromName(file.key.tonic), mode);

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
  for (const p of file.progressions) {
    const pattern = p.degrees.join(" ");
    const spans = b.progression({
      inKey: key,
      pattern,
      beatsPerStep: p.beatsPerStep,
      startBeats: 0,
    });
    progressionSpans.set(p.name, spans);
  }

  const patternIds = new Map<string, string>();
  for (const p of file.patterns) {
    patternIds.set(p.name, compilePattern(b, p));
  }

  const instancesByTrackProg = new Map<string, string[]>();

  for (const pl of file.placements) {
    const spans = resolveSpans(progressionSpans, pl);
    const patId = patternIds.get(pl.pattern);
    const trackId = trackIds.get(pl.track);
    if (!patId) throw new Error(`Unknown pattern: ${pl.pattern}`);
    if (!trackId) throw new Error(`Unknown track: ${pl.track}`);

    for (const span of spans) {
      const inst = b.placeUnder({
        pattern: patId,
        underHarmonicSpan: span,
        track: trackId,
        register: pl.register,
        velocity: pl.velocity,
      });
      const k = `${pl.track}:${pl.progression}`;
      const list = instancesByTrackProg.get(k) ?? [];
      list.push(inst);
      instancesByTrackProg.set(k, list);
    }
  }

  for (const vl of file.voiceLeading) {
    const k = `${vl.track}:${vl.progression}`;
    const insts = instancesByTrackProg.get(k);
    if (insts && insts.length > 1) b.smoothVoiceLeading(insts);
  }

  for (const rr of file.registerRanges) {
    const entry = [...instancesByTrackProg.entries()].find(([key]) => key.startsWith(`${rr.track}:`));
    if (!entry) continue;
    for (const inst of entry[1]) b.registerRange(inst, rr.min, rr.max);
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

function resolveSpans(progressionSpans: Map<string, string[]>, pl: PlacementDecl): string[] {
  const all = progressionSpans.get(pl.progression);
  if (!all) throw new Error(`Unknown progression: ${pl.progression}`);
  if (!pl.spanSlice) return all;
  const { start = 0, end = all.length } = pl.spanSlice;
  return all.slice(start, end);
}

function compilePattern(b: GraphBuilder, p: PatternDecl): string {
  const onsets = rhythmToOnsets(p.rhythm, p.unitBeats, (pat, unit) => b.rhythmMini(pat, unit));
  const notes = noteSpecsToMelodic(p.notes);
  if (notes.length !== onsets.length && p.rhythm.kind !== "chord") {
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

function noteSpecsToMelodic(spec: NoteSpec) {
  if (spec.kind === "chord") {
    return spec.indices.map((value) => ({ kind: "chord_tone" as const, value }));
  }
  return spec.pcs.map((value) => ({ kind: "fixed_pc" as const, value }));
}
