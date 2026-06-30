/**
 * Example 3: The parametric demo.
 *
 * Builds the minor vamp, then EDITS ONE NODE — changes h3 from III to iv —
 * and re-solves. The melody under bar 5-6, the voice-led keys voicings,
 * and the bass note all re-derive automatically.
 *
 * This is the CAD parallel made concrete: change one parameter, the
 * dependent graph re-resolves. No re-entry, no copy-paste. The bass
 * note WAS Eb; now it's F. The motif's pitches change. The voice
 * leading recomputes.
 */
import { buildMinorVamp } from "./minor_vamp.ts";
import { solve } from "../core/solver.ts";
import type { HarmonicSpan } from "../core/types.ts";
import { midiToName } from "../core/theory.ts";

export function buildAndCompareReharmonization() {
  const g = buildMinorVamp();

  // Solve original
  const before = solve(g);

  // EDIT: Find h3 (the III span) and change its degree to iv.
  const spans = [...g.nodes.values()].filter(
    (n): n is HarmonicSpan => n.kind === "relationship" && n.type === "harmonic_span"
  );
  // h3 is the third span (startBeats 16, was "III")
  const h3 = spans.find(s => s.startBeats === 16)!;
  console.log(`\n  EDIT: ${h3.id} ${h3.degree} → iv`);
  h3.degree = "iv";
  // Clear derived; the solver will recompute.
  delete h3.derived;

  const after = solve(g);

  // Show the difference
  console.log("\n  Before bar 5-6 (was III = Eb major):");
  reportSpanAround(before, 16);
  console.log("  After bar 5-6 (now iv = F minor):");
  reportSpanAround(after, 16);

  console.log(`\n  Total voice-leading motion: ${before.totalVoiceLeadingMotion} → ${after.totalVoiceLeadingMotion}`);

  return { g, before, after };
}

function reportSpanAround(r: ReturnType<typeof solve>, startBeats: number) {
  const evs = r.events.filter(e =>
    e.positionBeats >= startBeats && e.positionBeats < startBeats + 8 && e.pitch !== undefined
  );
  // Group by track for readability
  const byInst = new Map<string, string[]>();
  for (const e of evs) {
    const k = e.fromInstance ?? "?";
    if (!byInst.has(k)) byInst.set(k, []);
    byInst.get(k)!.push(midiToName(e.pitch!));
  }
  for (const [inst, notes] of byInst) {
    console.log(`    ${inst}: [${notes.join(" ")}]`);
  }
}
