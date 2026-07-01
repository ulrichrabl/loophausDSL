/**
 * Line-oriented parser for .loop files.
 * Comments: # or //
 */
import type {
  EnvelopeDecl,
  LoopFile,
  NoteSpec,
  PatternDecl,
  PlacementDecl,
  ProgressionDecl,
  RegisterRangeDecl,
  RhythmSpec,
  TrackDecl,
  VoiceLeadingDecl,
} from "./types.ts";

export class ParseError extends Error {
  constructor(message: string, public line: number) {
    super(`Line ${line}: ${message}`);
  }
}

interface Line {
  num: number;
  text: string;
}

function stripComment(raw: string): string {
  const hash = raw.indexOf("#");
  let s = hash >= 0 ? raw.slice(0, hash) : raw;
  const slash = s.indexOf("//");
  if (slash >= 0) s = s.slice(0, slash);
  return s.trim();
}

function linesOf(source: string): Line[] {
  return source
    .split(/\r?\n/)
    .map((text, i) => ({ num: i + 1, text: stripComment(text) }))
    .filter((l) => l.text.length > 0);
}

export function parseLoop(source: string): LoopFile {
  const file: LoopFile = {
    tracks: [],
    progressions: [],
    patterns: [],
    placements: [],
    voiceLeading: [],
    registerRanges: [],
    envelopes: [],
  };

  const ls = linesOf(source);
  let i = 0;

  while (i < ls.length) {
    const { num, text } = ls[i];

    if (text.startsWith("@tempo ")) {
      file.tempo = parseFloat(text.slice(7));
      i++;
      continue;
    }
    if (text.startsWith("@swing ")) {
      file.swing = parseFloat(text.slice(7));
      i++;
      continue;
    }
    if (text.startsWith("@meter ")) {
      const m = text.slice(7).match(/^(\d+)\s*\/\s*(\d+)$/);
      if (!m) throw new ParseError("expected @meter 4/4", num);
      file.meter = { beats: parseInt(m[1], 10), unit: parseInt(m[2], 10) };
      i++;
      continue;
    }
    if (text.startsWith("@key ")) {
      const rest = text.slice(5).trim().split(/\s+/);
      if (rest.length < 2) throw new ParseError("expected @key C major", num);
      file.key = { tonic: rest[0], mode: rest.slice(1).join("_") };
      i++;
      continue;
    }

    if (text.startsWith("track ")) {
      file.tracks.push(parseTrack(text, num));
      i++;
      continue;
    }

    if (text.startsWith("progression ")) {
      const { decl, next } = parseProgressionBlock(ls, i);
      file.progressions.push(decl);
      i = next;
      continue;
    }

    if (text.startsWith("pattern ")) {
      const { decl, next } = parsePatternBlock(ls, i);
      file.patterns.push(decl);
      i = next;
      continue;
    }

    if (text.startsWith("place ")) {
      file.placements.push(parsePlacement(text, num));
      i++;
      continue;
    }

    if (text.startsWith("voice_leading ")) {
      file.voiceLeading.push(parseVoiceLeading(text, num));
      i++;
      continue;
    }

    if (text.startsWith("register ")) {
      file.registerRanges.push(parseRegister(text, num));
      i++;
      continue;
    }

    if (text.startsWith("envelope ")) {
      file.envelopes.push(parseEnvelope(text, num));
      i++;
      continue;
    }

    throw new ParseError(`unrecognized statement: ${text}`, num);
  }

  return file;
}

const TOP_LEVEL = /^(track|pattern|place|progression|@|voice_leading|register|envelope)\b/;

function parseTrack(text: string, line: number): TrackDecl {
  let m = text.match(/^track\s+(\w+)\s+instrument\s+(\w+)\s+channel\s+(\d+)$/);
  if (m) {
    return { name: m[1], instrument: m[2], channel: parseInt(m[3], 10) };
  }
  m = text.match(/^track\s+(\w+)\s+percussion\s+channel\s+(\d+)$/);
  if (m) {
    return { name: m[1], percussion: true, channel: parseInt(m[2], 10) };
  }
  throw new ParseError("expected track NAME instrument X channel N", line);
}

function parseProgressionBlock(ls: Line[], start: number): { decl: ProgressionDecl; next: number } {
  const head = ls[start].text;
  const hm = head.match(/^progression\s+(\w+)\s+beats\s+([\d.]+):$/);
  if (!hm) throw new ParseError("expected progression NAME beats N:", ls[start].num);
  const degrees: string[] = [];
  let i = start + 1;
  while (i < ls.length && !TOP_LEVEL.test(ls[i].text)) {
    degrees.push(...ls[i].text.split(/\s+/).filter(Boolean));
    i++;
  }
  if (degrees.length === 0) throw new ParseError("progression needs degree tokens", ls[start].num);
  return {
    decl: { name: hm[1], beatsPerStep: parseFloat(hm[2]), degrees: expandDegrees(degrees) },
    next: i,
  };
}

function expandDegrees(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    const m = t.match(/^([iIvV]+)\*(\d+)$/);
    if (m) {
      for (let k = 0; k < parseInt(m[2], 10); k++) out.push(m[1]);
    } else {
      out.push(t);
    }
  }
  return out;
}

function parsePatternBlock(ls: Line[], start: number): { decl: PatternDecl; next: number } {
  const head = ls[start].text;
  const hm = head.match(
    /^pattern\s+(\w+)\s+unit\s+([\d.]+)(?:\s+register\s+(\d+))?(?:\s+velocity\s+(\d+))?(?:\s+transform\s+(invert))?:?$/,
  );
  if (!hm) {
    throw new ParseError(
      "expected pattern NAME unit N [register R] [velocity V] [transform invert]",
      ls[start].num,
    );
  }

  let rhythm: RhythmSpec | null = null;
  let notes: NoteSpec | null = null;
  let i = start + 1;
  while (i < ls.length && !TOP_LEVEL.test(ls[i].text)) {
    const t = ls[i].text;
    if (t.startsWith("rhythm ")) rhythm = parseRhythm(t, ls[i].num);
    else if (t.startsWith("notes ")) notes = parseNotes(t, ls[i].num);
    else throw new ParseError("expected rhythm or notes in pattern body", ls[i].num);
    i++;
  }
  if (!rhythm || !notes) throw new ParseError("pattern needs rhythm and notes", ls[start].num);

  return {
    decl: {
      name: hm[1],
      unitBeats: parseFloat(hm[2]),
      register: hm[3] ? parseInt(hm[3], 10) : 4,
      velocity: hm[4] ? parseInt(hm[4], 10) : undefined,
      transform: hm[5] ? "invert" : undefined,
      rhythm,
      notes,
    },
    next: i,
  };
}

function parseRhythm(text: string, line: number): RhythmSpec {
  const rest = text.slice(7).trim();
  if (rest.startsWith('"') && rest.endsWith('"')) {
    return { kind: "mini", pattern: rest.slice(1, -1) };
  }
  if (rest.startsWith("dotted ")) {
    return { kind: "durations", durs: rest.slice(7).trim().split(/\s+/).map(parseFloat) };
  }
  let m = rest.match(/^quarters\s+(\d+)$/);
  if (m) return { kind: "quarters", count: parseInt(m[1], 10) };
  m = rest.match(/^eighths\s+(\d+)$/);
  if (m) return { kind: "eighths", count: parseInt(m[1], 10) };
  if (rest === "chord") return { kind: "chord" };
  throw new ParseError(`unknown rhythm: ${rest}`, line);
}

function parseNotes(text: string, line: number): NoteSpec {
  const rest = text.slice(6).trim();
  if (rest.startsWith("chord ")) {
    return { kind: "chord", indices: rest.slice(6).split(/\s+/).map((n) => parseInt(n, 10)) };
  }
  if (rest.startsWith("drum ")) {
    return { kind: "drum", pcs: rest.slice(5).split(/\s+/).map((n) => parseInt(n, 10)) };
  }
  throw new ParseError("notes must be chord ... or drum ...", line);
}

function parsePlacement(text: string, line: number): PlacementDecl {
  const m = text.match(
    /^place\s+(\w+)\s+on\s+(\w+)(?:\[(\d+)(?::(\d+))?\])?\s+track\s+(\w+)(?:\s+register\s+(\d+))?(?:\s+velocity\s+(\d+))?$/,
  );
  if (!m) throw new ParseError("expected place PAT on PROG[slice] track NAME", line);
  let spanSlice: PlacementDecl["spanSlice"];
  if (m[3] !== undefined) {
    const start = parseInt(m[3], 10);
    spanSlice = m[4] !== undefined ? { start, end: parseInt(m[4], 10) } : { start, end: start + 1 };
  }
  return {
    pattern: m[1],
    progression: m[2],
    spanSlice,
    track: m[5],
    register: m[6] ? parseInt(m[6], 10) : undefined,
    velocity: m[7] ? parseInt(m[7], 10) : undefined,
  };
}

function parseVoiceLeading(text: string, line: number): VoiceLeadingDecl {
  const m = text.match(/^voice_leading\s+(\w+)\s+on\s+(\w+)$/);
  if (!m) throw new ParseError("expected voice_leading TRACK on PROG", line);
  return { track: m[1], progression: m[2] };
}

function parseRegister(text: string, line: number): RegisterRangeDecl {
  const m = text.match(/^register\s+(\w+)\s+(\d+)\s+(\d+)$/);
  if (!m) throw new ParseError("expected register TRACK MIN MAX", line);
  return { track: m[1], min: parseInt(m[2], 10), max: parseInt(m[3], 10) };
}

function parseEnvelope(text: string, line: number): EnvelopeDecl {
  const m = text.match(
    /^envelope\s+(\w+)\s+(\w+)\s+([\w.]+)\s+(linear|exp)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/,
  );
  if (!m) throw new ParseError("expected envelope NAME TRACK PARAM curve start end from to", line);
  return {
    name: m[1],
    targetTrack: m[2],
    parameter: m[3],
    curve: m[4] as "linear" | "exp",
    startBeats: parseFloat(m[5]),
    endBeats: parseFloat(m[6]),
    from: parseFloat(m[7]),
    to: parseFloat(m[8]),
  };
}

export function rhythmToOnsets(
  spec: RhythmSpec,
  unitBeats: number,
  rhythmMini: (pattern: string, unit: number) => { at: number; dur: number; velMul?: number }[],
): { at: number; dur: number; velMul?: number }[] {
  switch (spec.kind) {
    case "mini":
      return rhythmMini(spec.pattern, unitBeats);
    case "quarters": {
      const step = 1 / spec.count;
      return Array.from({ length: spec.count }, (_, i) => ({ at: i * step, dur: step }));
    }
    case "eighths": {
      const step = 1 / spec.count;
      return Array.from({ length: spec.count }, (_, i) => ({ at: i * step, dur: step }));
    }
    case "chord":
      return [
        { at: 0, dur: 1 },
        { at: 0, dur: 1 },
        { at: 0, dur: 1 },
      ];
    case "durations": {
      let at = 0;
      return spec.durs.map((dur) => {
        const o = { at, dur };
        at += dur;
        return o;
      });
    }
    default:
      return [];
  }
}
