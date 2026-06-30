/**
 * Unified runner.
 *
 *   npx tsx src/run.ts                        # lists examples
 *   npx tsx src/run.ts halflight              # renders halflight to outputs/
 *   npx tsx src/run.ts halflight --explain    # prints the explain() output too
 *   npx tsx src/run.ts all                    # renders every example
 *
 * Set OUTPUT_DIR to change the render destination (default: ./outputs).
 */
import { solve } from "./core/solver.ts";
import { explain } from "./core/explain.ts";
import { renderWebAudio } from "./midi/web_audio.ts";
import { examples } from "./examples/registry.ts";
import { outputPath } from "./lib/paths.ts";

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
  const out = outputPath(`${name}.wav`);
  await renderWebAudio(g, r, out);
  console.log(`Output: ${out}`);
}

(async () => {
  const args = process.argv.slice(2);
  const wantExplain = args.includes("--explain");
  const name = args.find((a: string) => !a.startsWith("--"));

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
