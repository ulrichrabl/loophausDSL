import type { Graph, HarmonicSpan, KeyContext } from "../../src/core/types.ts";
import type { SolveResult } from "../../src/core/solver.ts";
import { lookup } from "../../src/core/graph.ts";

export interface SolveSummary {
  eventCount: number;
  voiceLeadingMotion: number;
  degrees: string[];
  eventsByTrackName: Record<string, number>;
}

/** Stable, name-based summary for golden tests (avoids opaque track IDs). */
export function summarizeSolve(g: Graph, r: SolveResult): SolveSummary {
  const trackNameById = new Map<string, string>();
  for (const node of g.nodes.values()) {
    if (node.kind === "context" && node.type === "track") {
      trackNameById.set(node.id, node.name);
    }
  }

  const eventsByTrackName: Record<string, number> = {};
  for (const e of r.events) {
    const name = trackNameById.get(e.track) ?? e.track;
    eventsByTrackName[name] = (eventsByTrackName[name] ?? 0) + 1;
  }

  return {
    eventCount: r.events.length,
    voiceLeadingMotion: r.totalVoiceLeadingMotion,
    degrees: r.harmonicSummary.map((h) => h.degree),
    eventsByTrackName,
  };
}

export function assertEventInvariants(g: Graph, r: SolveResult): void {
  for (const e of r.events) {
    if (e.positionBeats < 0) throw new Error(`negative position: ${e.id}`);
    if (e.durationBeats <= 0) throw new Error(`non-positive duration: ${e.id}`);
    if (e.pitch !== undefined && (e.pitch < 0 || e.pitch > 127)) {
      throw new Error(`pitch out of MIDI range: ${e.pitch}`);
    }
    if (e.velocity !== undefined && (e.velocity < 0 || e.velocity > 127)) {
      throw new Error(`velocity out of range: ${e.velocity}`);
    }
    if (!g.nodes.has(e.track)) throw new Error(`unknown track ref: ${e.track}`);
  }
}

export function harmonicSpansInRange(
  g: Graph,
  startBeats: number,
  endBeats: number,
): HarmonicSpan[] {
  return [...g.nodes.values()]
    .filter((n): n is HarmonicSpan => n.kind === "relationship" && n.type === "harmonic_span")
    .filter((s) => s.startBeats >= startBeats && s.endBeats <= endBeats)
    .sort((a, b) => a.startBeats - b.startBeats);
}

export function keyModeForSpan(g: Graph, span: HarmonicSpan): KeyContext["mode"] {
  const key = lookup<KeyContext>(g, span.inKey);
  return key.mode;
}

export function keysInGraph(g: Graph): KeyContext[] {
  return [...g.nodes.values()].filter(
    (n): n is KeyContext => n.kind === "context" && n.type === "key",
  );
}
