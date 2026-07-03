/**
 * The explanation engine.
 *
 * Walks a solved graph and produces structured commentary. This is the
 * LLM-readability proof: an LLM (or human) can read this and understand
 * the music without needing audio. It's also a debugging tool — verify
 * that what the graph SAYS matches what you intended.
 */
import type { Graph, Node, HarmonicSpan, MelodicPattern, RhythmicPattern, PatternInstance, SidechainRelationship, Envelope, EnvelopeBinding, Modulation, KeyContext } from "./types.ts";
import type { SolveResult } from "./solver.ts";
import { lookup } from "./graph.ts";
import { midiToName, NOTE_NAMES, keyLabel } from "./theory.ts";

export function explain(g: Graph, r: SolveResult): string {
  const out: string[] = [];

  // ----- Header -----
  const transport = lookup<any>(g, g.transport);
  const tempo = lookup<any>(g, transport.tempo);
  const meter = lookup<any>(g, transport.meter);
  out.push(`# Piece overview\n`);
  out.push(`Tempo: ${tempo.bpm} BPM`);
  out.push(`Meter: ${meter.beatsPerBar}/${meter.beatUnit}`);
  if (transport.swing) out.push(`Swing: ${(transport.swing * 100).toFixed(0)}%`);

  // ----- Keys -----
  const keys = [...g.nodes.values()].filter(n => n.kind === "context" && (n as any).type === "key") as any[];
  if (keys.length === 1) {
    out.push(`Key: ${NOTE_NAMES[keys[0].tonic]} ${keys[0].mode.replace(/_/g, " ")}`);
  } else if (keys.length > 1) {
    out.push(`Keys (${keys.length}):`);
    for (const k of keys) out.push(`  - ${keyLabel(k)}`);
  }

  // ----- Modulations -----
  const mods = [...g.nodes.values()].filter(
    n => n.kind === "relationship" && (n as any).type === "modulation"
  ) as Modulation[];
  if (mods.length > 0) {
    out.push(`\n# Modulations (${mods.length})\n`);
    for (const m of mods.sort((a, b) => a.atBeats - b.atBeats)) {
      const fromKey = lookup<KeyContext>(g, m.fromKey);
      const toKey = lookup<KeyContext>(g, m.toKey);
      const bar = Math.floor(m.atBeats / meter.beatsPerBar) + 1;
      const pivot = (m.pivotPcs ?? []).map(p => NOTE_NAMES[p]).join(", ") || "(none)";
      out.push(`- Bar ${bar}: ${keyLabel(fromKey)} → ${keyLabel(toKey)} via ${m.method} (pivot: ${pivot})`);
    }
  }

  // ----- Length -----
  const spans = [...g.nodes.values()].filter(
    n => n.kind === "relationship" && (n as any).type === "harmonic_span"
  ) as HarmonicSpan[];
  if (spans.length > 0) {
    const start = Math.min(...spans.map(s => s.startBeats));
    const end = Math.max(...spans.map(s => s.endBeats));
    const bars = Math.round((end - start) / meter.beatsPerBar);
    out.push(`Length: ${bars} bars (${end - start} beats)`);
  }

  // ----- Tracks -----
  const tracks = [...g.nodes.values()].filter(n => n.kind === "context" && (n as any).type === "track") as any[];
  out.push(`\n# Tracks (${tracks.length})\n`);
  for (const t of tracks) {
    const evCount = r.events.filter(e => e.track === t.id).length;
    out.push(`- ${t.name} (ch ${t.midiChannel}${t.isPercussion ? ", percussion" : ", program " + t.program})  — ${evCount} events`);
  }

  // ----- Harmonic skeleton -----
  out.push(`\n# Harmonic progression\n`);
  // Group consecutive same-degree spans
  const harmonics = spans
    .slice()
    .sort((a, b) => a.startBeats - b.startBeats)
    .map(s => ({
      bar: Math.floor(s.startBeats / meter.beatsPerBar) + 1,
      degree: s.degree,
      root: s.derived ? NOTE_NAMES[s.derived.rootPc] : "?",
      tones: s.derived ? s.derived.chordTonePcs.map(p => NOTE_NAMES[p]).join("-") : "?",
      func: s.derived?.functionLabel ?? "?",
    }));
  let prev: any = null;
  let runStart = 1;
  for (let i = 0; i <= harmonics.length; i++) {
    const cur = harmonics[i];
    if (prev && (!cur || cur.degree !== prev.degree)) {
      const span = prev.bar === runStart ? `bar ${runStart}` : `bars ${runStart}-${prev.bar}`;
      out.push(`  ${span.padEnd(13)}: ${prev.degree.padEnd(4)} → ${prev.root.padEnd(3)} (${prev.tones})  [${prev.func}]`);
      runStart = cur ? cur.bar : 0;
    }
    prev = cur;
  }

  // ----- Patterns and where they play -----
  out.push(`\n# Layers\n`);
  const instances = [...g.nodes.values()].filter(n => n.kind === "instance") as PatternInstance[];
  // Group instances by track + pattern combo
  const layerGroups = new Map<string, { trackName: string; patternId: string; spans: number[] }>();
  for (const inst of instances) {
    const trk = lookup<any>(g, inst.track);
    const key = `${trk.name}::${inst.pattern}`;
    if (!layerGroups.has(key)) {
      layerGroups.set(key, { trackName: trk.name, patternId: inst.pattern, spans: [] });
    }
    if (inst.underHarmonicSpan) {
      const span = lookup<HarmonicSpan>(g, inst.underHarmonicSpan);
      const bar = Math.floor(span.startBeats / meter.beatsPerBar) + 1;
      layerGroups.get(key)!.spans.push(bar);
    }
  }

  for (const { trackName, patternId, spans: bars } of layerGroups.values()) {
    const pat = lookup<Node>(g, patternId);
    let desc = "";
    if (pat.kind === "relationship" && pat.type === "melodic_pattern") {
      const mp = pat as MelodicPattern;
      const noteDesc = mp.notes.map(n => {
        if (n.kind === "chord_tone") return `chord-tone ${n.value}`;
        if (n.kind === "scale_degree") return `scale-degree ${n.value}`;
        if (n.kind === "fixed_pc") return NOTE_NAMES[n.value];
        return `interval ${n.value > 0 ? "+" : ""}${n.value}`;
      }).join(", ");
      const tform = mp.transform && mp.transform !== "none" ? ` (${mp.transform})` : "";
      desc = `[${noteDesc}]${tform}`;
    } else if (pat.kind === "relationship" && pat.type === "rhythmic_pattern") {
      const rp = pat as RhythmicPattern;
      desc = `rhythm with ${rp.onsets.length} onsets`;
    }
    const sortedBars = [...new Set(bars)].sort((a, b) => a - b);
    const barsDesc = compactBarList(sortedBars);
    out.push(`- ${trackName.padEnd(8)} ${desc}`);
    out.push(`           plays at bars ${barsDesc}`);
  }

  // ----- Envelopes -----
  const envs = [...g.nodes.values()].filter(n => n.kind === "envelope") as Envelope[];
  if (envs.length > 0) {
    out.push(`\n# Envelopes\n`);
    for (const env of envs) {
      const startBar = Math.floor(env.startBeats / meter.beatsPerBar) + 1;
      const endBar = Math.floor(env.endBeats / meter.beatsPerBar) + 1;
      out.push(`- ${env.parameter}: ${env.from} → ${env.to} (${env.curve}) over bars ${startBar}-${endBar}`);
      // Find what it binds to
      const bindings = [...g.nodes.values()].filter(
        n => n.kind === "relationship" && (n as any).type === "envelope_binding" && (n as any).envelope === env.id
      ) as EnvelopeBinding[];
      for (const bind of bindings) {
        const tgt = g.nodes.get(bind.targetEntity);
        const tgtName = tgt && (tgt as any).name ? (tgt as any).name : bind.targetEntity;
        out.push(`         → modulates ${tgtName}.${bind.targetParameter}`);
      }
    }
  }

  // ----- Sidechains -----
  const sidechains = [...g.nodes.values()].filter(
    n => n.kind === "relationship" && (n as any).type === "sidechain"
  ) as SidechainRelationship[];
  if (sidechains.length > 0) {
    out.push(`\n# Sidechain ducking\n`);
    for (const sc of sidechains) {
      const trigger = lookup<any>(g, sc.trigger);
      const ducks = sc.ducks.map(d => lookup<any>(g, d).name).join(", ");
      out.push(`- ${trigger.name} ducks [${ducks}] by ${Math.round(sc.amount * 100)}%, release ${sc.releaseMs}ms`);
    }
  }

  // ----- Diagnostics -----
  out.push(`\n# Diagnostics\n`);
  out.push(`- Total events: ${r.events.length}`);
  out.push(`- Voice-leading motion: ${r.totalVoiceLeadingMotion} semitones`);

  return out.join("\n");
}

/** Compact bar list: [1,2,3,5,7,8,9] → "1-3, 5, 7-9" */
function compactBarList(bars: number[]): string {
  if (bars.length === 0) return "(none)";
  const parts: string[] = [];
  let runStart = bars[0];
  let prev = bars[0];
  for (let i = 1; i <= bars.length; i++) {
    const cur = bars[i];
    if (cur !== prev + 1) {
      parts.push(runStart === prev ? `${runStart}` : `${runStart}-${prev}`);
      runStart = cur;
    }
    prev = cur;
  }
  return parts.join(", ");
}
