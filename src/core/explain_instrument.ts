/**
 * Structured commentary for instrument (audio) graphs.
 *
 * Mirrors explain() on the score side — lets humans and LLMs review sound
 * design without listening or reading imperative Web Audio code.
 */
import type { Instrument, AudioNode, AudioParam } from "./audio_types.ts";
import type { InstrumentNode } from "./types.ts";

type Inst = Instrument | InstrumentNode;

export function explainInstrument(inst: Inst): string {
  const lines: string[] = [];
  lines.push(`# Instrument: ${inst.name}`);
  lines.push(`Polyphony: ${inst.polyphony}`);
  lines.push(`Output node: ${inst.output}`);
  lines.push("");

  lines.push("## Nodes");
  for (const [name, node] of Object.entries(inst.audioNodes)) {
    lines.push(`- **${name}** (${describeNode(node as AudioNode)})`);
  }

  const mods = collectModulations(inst);
  lines.push("");
  lines.push("## Modulations");
  if (mods.length === 0) {
    lines.push("- (none)");
  } else {
    for (const m of mods) {
      lines.push(`- ${m.target}: ${m.source} × ${m.amount}${m.base !== undefined ? ` (base ${m.base})` : ""}`);
    }
  }

  lines.push("");
  lines.push("## Ports");
  lines.push("- `$freq` — per-note frequency (Hz)");
  lines.push("- `$vel` — per-note velocity (0..1)");
  lines.push("- `$gate` — note on/off trigger");

  return lines.join("\n");
}

function describeNode(node: AudioNode): string {
  switch (node.type) {
    case "osc":
      return node.wave === "custom"
        ? `osc custom (${node.harmonics?.length ?? 0} harmonics), freq=${fmtParam(node.freq)}`
        : `osc ${node.wave}, freq=${fmtParam(node.freq)}`;
    case "noise":
      return `noise ${node.color ?? "white"}`;
    case "filter":
      return `${node.filterType} ← ${node.input}, cutoff=${fmtParam(node.cutoff)}`;
    case "amp":
      return `amp ← ${node.input}, gain=${fmtParam(node.gain)}`;
    case "mixer":
      return `mixer [${node.inputs.join(", ")}]`;
    case "env_gen":
      return `env ${node.envType} a=${node.a}s` +
        (node.d !== undefined ? ` d=${node.d}s` : "") +
        (node.s !== undefined ? ` s=${node.s}` : "") +
        (node.r !== undefined ? ` r=${node.r}s` : "") +
        (node.curve === "exp" ? " (exp)" : "");
    case "lfo":
      return `lfo ${node.wave}, rate=${fmtParam(node.rate)}`;
    case "math":
      return `math ${node.op}(${fmtParam(node.a)}, ${fmtParam(node.b)})`;
    case "effect": {
      const params = node.params
        ? " (" + Object.entries(node.params).map(([k, v]) => `${k}=${fmtParam(v)}`).join(", ") + ")"
        : "";
      return `effect ${node.effectType} ← ${node.input}${params}`;
    }
    default:
      return "unknown";
  }
}

function fmtParam(p: AudioParam | undefined): string {
  if (p === undefined) return "?";
  if (typeof p === "number") return String(p);
  if (typeof p === "string") return p;
  const base = typeof p.base === "number" ? String(p.base) : p.base;
  const modCount = p.mod?.length ?? 0;
  return modCount > 0 ? `{ base: ${base}, +${modCount} mod }` : `{ base: ${base} }`;
}

export interface ModLine {
  target: string;
  source: string;
  amount: number;
  base?: number | string;
}

function collectModulations(inst: Inst): ModLine[] {
  const out: ModLine[] = [];
  for (const [nodeName, raw] of Object.entries(inst.audioNodes)) {
    const node = raw as AudioNode;
    scanParams(nodeName, "freq", (node as { freq?: AudioParam }).freq, out);
    scanParams(nodeName, "detune", (node as { detune?: AudioParam }).detune, out);
    scanParams(nodeName, "cutoff", (node as { cutoff?: AudioParam }).cutoff, out);
    scanParams(nodeName, "q", (node as { q?: AudioParam }).q, out);
    scanParams(nodeName, "gain", (node as { gain?: AudioParam }).gain, out);
    scanParams(nodeName, "rate", (node as { rate?: AudioParam }).rate, out);
    scanParams(nodeName, "depth", (node as { depth?: AudioParam }).depth, out);
    if (node.type === "effect" && node.params) {
      for (const [k, v] of Object.entries(node.params)) {
        scanParams(nodeName, k, v, out);
      }
    }
  }
  return out;
}

function scanParams(
  nodeName: string,
  param: string,
  value: AudioParam | undefined,
  out: ModLine[],
): void {
  if (!value || typeof value !== "object" || !("mod" in value) || !value.mod) return;
  for (const m of value.mod) {
    out.push({
      target: `${nodeName}.${param}`,
      source: m.source,
      amount: m.amount,
      base: value.base,
    });
  }
}

/** @internal test helper */
export function modulationRoutes(inst: Inst): ModLine[] {
  return collectModulations(inst);
}
