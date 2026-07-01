/**
 * Compile and optionally render .loop DSL files.
 *
 *   npx tsx src/run_loop.ts examples/loop/electronic_loop.loop
 *   npx tsx src/run_loop.ts examples/loop/minor_vamp.loop --explain
 */
import fs from "node:fs";
import path from "node:path";
import { compileLoop } from "./dloop/compile.ts";
import { solve } from "./core/solver.ts";
import { explain } from "./core/explain.ts";
import { renderWebAudio } from "./midi/web_audio.ts";
import { outputPath } from "./lib/paths.ts";

const args = process.argv.slice(2);
const wantExplain = args.includes("--explain");
const noRender = args.includes("--no-render");
const fileArg = args.find((a) => !a.startsWith("--"));

if (!fileArg) {
  console.log("Usage:");
  console.log("  npx tsx src/run_loop.ts <file.loop> [--explain] [--no-render]");
  process.exit(1);
}

const file = path.resolve(fileArg);
const source = fs.readFileSync(file, "utf8");
const g = compileLoop(source);
const r = solve(g);

const base = path.basename(file, path.extname(file));
console.log(`\n=== ${base} (.loop) ===`);
console.log(`Events: ${r.events.length}, voice-leading motion: ${r.totalVoiceLeadingMotion}`);

if (wantExplain) {
  console.log("");
  console.log(explain(g, r));
}

if (!noRender) {
  const out = outputPath(`${base}.wav`);
  await renderWebAudio(g, r, out);
  console.log(`Output: ${out}`);
}
