import type { Graph } from "../core/types.ts";

export interface BuildResult {
  graph: Graph;
  sections?: Record<string, unknown>;
}

export function buildResult(
  graph: Graph,
  extra: Omit<BuildResult, "graph"> = {},
): BuildResult {
  return { graph, ...extra };
}

export function unwrapGraph(input: Graph | BuildResult): Graph {
  if (input && typeof input === "object" && "nodes" in input && input.nodes instanceof Map) {
    return input as Graph;
  }
  if (input && typeof input === "object" && "graph" in input) {
    return (input as BuildResult).graph;
  }
  throw new Error("Expected Graph or BuildResult with a graph property");
}
