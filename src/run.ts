/**
 * Unified runner.
 *
 *   npx tsx src/run.ts                        # lists examples
 *   npx tsx src/run.ts halflight              # renders halflight to outputs/
 *   npx tsx src/run.ts halflight --explain    # prints the explain() output too
 *   npx tsx src/run.ts all                    # renders every example
 */
import { solve } from "./core/solver.ts";
import { explain } from "./core/explain.ts";
import { renderWebAudio } from "./midi/web_audio.ts";

import { buildMinorVamp } from "./examples/minor_vamp.ts";
import { buildElectronicLoop } from "./examples/electronic_loop.ts";
import { buildDaftPunkV2 } from "./examples/daft_punk_v2.ts";
import { buildFreygishNights } from "./examples/freygish_nights.ts";
import { buildPolymorph } from "./examples/polymorph.ts";
import { buildHalflight } from "./examples/halflight.ts";
import { buildStrata } from "./examples/strata.ts";
import { buildCosmonaut } from "./examples/cosmonaut.ts";
import { buildApsis } from "./examples/apsis.ts";
import { buildBlackStone } from "./examples/black_stone.ts";
import { buildSwellTest } from "./examples/swell_test.ts";
import { buildThreshold } from "./examples/threshold.ts";
import { buildHelios } from "./examples/helios.ts";

type Builder = () => any;
const examples: Record<string, Builder> = {
  minor_vamp:      () => buildMinorVamp(),
  electronic_loop: () => buildElectronicLoop(),
  daft_punk:       () => buildDaftPunkV2(),
  freygish_nights: () => buildFreygishNights(),
  polymorph:       () => buildPolymorph(),
  halflight:       () => { const r = buildHalflight(); return r.graph; },
  strata:          () => { const r = buildStrata();    return r.graph ?? r; },
  cosmonaut:       () => { const r = buildCosmonaut(); return r.graph; },
  apsis:           () => { const r = buildApsis();     return r.graph; },
  black_stone:     () => { const r = buildBlackStone(); return r.graph; },
  swell_test:      () => { const r = buildSwellTest(); return r.graph; },
  threshold:       () => { const r = buildThreshold(); return r.graph; },
  helios:          () => { const r = buildHelios();    return r.graph; },
};

async function renderOne(name: string, wantExplain: boolean) {
  const builder = examples[name];
  if (!builder) {
    console.error(`Unknown example: ${name}`);
    console.error(`Available: ${Object.keys(examples).join(", ")}`);
    process.exit(1);
  }
  console.log(`\n=== ${name} ===`);
  const g = builder();
  const r = solve(g);
  console.log(`Events: ${r.events.length}, voice-leading motion: ${r.totalVoiceLeadingMotion}`);
  if (wantExplain) {
    console.log("");
    console.log(explain(g, r));
  }
  await renderWebAudio(g, r, `/mnt/user-data/outputs/${name}.wav`);
  console.log(`Output: /mnt/user-data/outputs/${name}.wav`);
}

(async () => {
  const args = process.argv.slice(2);
  const wantExplain = args.includes("--explain");
  const name = args.find(a => !a.startsWith("--"));

  if (!name) {
    console.log("Available examples:");
    for (const n of Object.keys(examples)) console.log(`  ${n}`);
    console.log("\nUsage:");
    console.log("  npx tsx src/run.ts <name>            # render one example");
    console.log("  npx tsx src/run.ts <name> --explain  # also print explanation");
    console.log("  npx tsx src/run.ts all               # render every example");
    return;
  }

  if (name === "all") {
    for (const n of Object.keys(examples)) {
      await renderOne(n, wantExplain);
    }
  } else {
    await renderOne(name, wantExplain);
  }
})();
