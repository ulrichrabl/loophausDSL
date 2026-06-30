import fs from "node:fs";
import path from "node:path";

/** Writable output directory for WAV/MIDI renders. Override with OUTPUT_DIR. */
export function outputDir(): string {
  return process.env.OUTPUT_DIR ?? path.join(process.cwd(), "outputs");
}

export function outputPath(filename: string): string {
  const dir = outputDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}
