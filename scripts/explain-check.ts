/**
 * Regenerate or verify committed explain() snapshots for core examples.
 *
 *   npm run explain:update
 *   npm run explain:check
 */
import fs from "node:fs";
import path from "node:path";
import { coreExamples, buildExample } from "../src/examples/registry.ts";
import { solve } from "../src/core/solver.ts";
import { explain } from "../src/core/explain.ts";

const SNAPSHOT_DIR = path.join(process.cwd(), "snapshots/explain");
const check = process.argv.includes("--check");

fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

let failed = false;

for (const name of coreExamples) {
  const g = buildExample(name);
  const text = explain(g, solve(g));
  const file = path.join(SNAPSHOT_DIR, `${name}.txt`);

  if (check) {
    if (!fs.existsSync(file)) {
      console.error(`Missing snapshot: ${file}`);
      failed = true;
      continue;
    }
    const expected = fs.readFileSync(file, "utf8");
    if (expected !== text) {
      console.error(`Snapshot mismatch: ${name}`);
      failed = true;
      continue;
    }
    console.log(`OK ${name}`);
  } else {
    fs.writeFileSync(file, text);
    console.log(`Wrote ${file}`);
  }
}

if (failed) process.exit(1);
