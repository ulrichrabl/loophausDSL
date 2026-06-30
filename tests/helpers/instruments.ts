/** Assert every non-percussion track has an instrument graph bound. */
import type { Graph, TrackContext } from "../../src/core/types.ts";

export function pitchedTracks(g: Graph): TrackContext[] {
  return [...g.nodes.values()].filter(
    (n): n is TrackContext => n.kind === "context" && n.type === "track" && !n.isPercussion,
  );
}

export function assertAllPitchedTracksHaveInstrument(g: Graph): void {
  for (const track of pitchedTracks(g)) {
    if (!track.instrument) {
      throw new Error(`Track "${track.name}" has no instrument graph`);
    }
  }
}

export function allPitchedTracksHaveInstrument(g: Graph): boolean {
  return pitchedTracks(g).every((t) => Boolean(t.instrument));
}
