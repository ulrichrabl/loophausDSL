/**
 * Line-oriented parser for .loop files.
 * Comments: # or //
 */
import type {
  EnvelopeDecl,
  LoopFile,
  NoteSpec,
  NoteToken,
  PatternDecl,
  PlaceNoteDecl,
  PlaceRangeDecl,
  PlaceVaryingDecl,
  PlacementDecl,
  ProgressionDecl,
  RegisterRangeDecl,
  RhythmSpec,
  SectionDecl,
  PlaceAtDecl,
  TrackGainDecl,
  SidechainDecl,
  ModulationDecl,
  SpanRef,
  SpanSlice,
  TrackDecl,
  VaryRule,
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
  const slash = raw.indexOf("//");
  let s = slash >= 0 ? raw.slice(0, slash) : raw;
  s = s.trim();
  if (s.startsWith("#")) return "";
  s = s.replace(/\s+#.*$/, "");
  return s.trim();
}

function linesOf(source: string): Line[] {
  return source
    .split(/\r?\n/)
    .map((text, i) => ({ num: i + 1, text: stripComment(text) }))
    .filter((l) => l.text.length > 0);
}

const TOP_LEVEL =
  /^(track|pattern|place|place_at|place_range|place_varying|place_note|progression|section|key|sidechain|modulate|track_gain|@|voice_leading|register|envelope)\b/;

export function parseLoop(source: string): LoopFile {
  const file: LoopFile = {
    keys: [],
    tracks: [],
    progressions: [],
    sections: [],
    patterns: [],
    placements: [],
    placeRanges: [],
    placeVaryings: [],
    placeNotes: [],
    placeAts: [],
    trackGains: [],
    sidechains: [],
    modulations: [],
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

    if (text.startsWith("key ")) {
      file.keys.push(parseKeyDecl(text, num));
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

    if (text.startsWith("section ")) {
      file.sections.push(parseSection(text, num));
      i++;
      continue;
    }

    if (text.startsWith("pattern ")) {
      const { decl, next } = parsePatternBlock(ls, i);
      file.patterns.push(decl);
      i = next;
      continue;
    }

    if (text.startsWith("place_range ")) {
      file.placeRanges.push(parsePlaceRange(text, num));
      i++;
      continue;
    }

    if (text.startsWith("place_varying ")) {
      const { decl, next } = parsePlaceVaryingBlock(ls, i);
      file.placeVaryings.push(decl);
      i = next;
      continue;
    }

    if (text.startsWith("place_at ")) {
      file.placeAts.push(parsePlaceAt(text, num));
      i++;
      continue;
    }

    if (text.startsWith("place_note ")) {
      file.placeNotes.push(parsePlaceNote(text, num));
      i++;
      continue;
    }

    if (text.startsWith("place ")) {
      file.placements.push(parsePlacement(text, num));
      i++;
      continue;
    }

    if (text.startsWith("sidechain ")) {
      file.sidechains.push(parseSidechain(text, num));
      i++;
      continue;
    }

    if (text.startsWith("modulate ")) {
      file.modulations.push(parseModulation(text, num));
      i++;
      continue;
    }

    if (text.startsWith("track_gain ")) {
      file.trackGains.push(parseTrackGain(text, num));
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

function parseKeyDecl(text: string, line: number) {
  const rest = text.slice(4).trim().split(/\s+/);
  if (rest.length < 3) throw new ParseError("expected key NAME TONIC MODE", line);
  const [name, tonic, ...modeParts] = rest;
  return { name, tonic, mode: modeParts.join("_") };
}

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

function parseSection(text: string, line: number): SectionDecl {
  const m = text.match(/^section\s+(\w+)\s+progression\s+(\w+)$/);
  if (!m) throw new ParseError("expected section NAME progression PROG", line);
  return { name: m[1], progression: m[2] };
}

function parseProgressionBlock(ls: Line[], start: number): { decl: ProgressionDecl; next: number } {
  const head = ls[start].text;
  const hm = head.match(
    /^progression\s+(\w+)(?:\s+key\s+(\w+))?\s+beats\s+([\d.]+)(?:\s+start\s+([\d.]+))?:$/,
  );
  if (!hm) {
    throw new ParseError(
      "expected progression NAME [key KEY] beats N [start BEATS]:",
      ls[start].num,
    );
  }
  const degrees: string[] = [];
  let i = start + 1;
  while (i < ls.length && !TOP_LEVEL.test(ls[i].text)) {
    degrees.push(...ls[i].text.split(/\s+/).filter(Boolean));
    i++;
  }
  if (degrees.length === 0) throw new ParseError("progression needs degree tokens", ls[start].num);
  return {
    decl: {
      name: hm[1],
      keyName: hm[2] ?? "default",
      beatsPerStep: parseFloat(hm[3]),
      startBeats: hm[4] !== undefined ? parseFloat(hm[4]) : undefined,
      degrees: expandDegrees(degrees),
    },
    next: i,
  };
}

function expandDegrees(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    const m = t.match(/^([ivIVb#]+)\*(\d+)$/);
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
  if (rest.startsWith("hits ")) {
    const hits = rest
      .slice(5)
      .trim()
      .split(/\s+/)
      .map((tok) => {
        const [at, dur] = tok.split(":").map(parseFloat);
        if (Number.isNaN(at) || Number.isNaN(dur)) {
          throw new ParseError(`invalid hit token: ${tok}`, line);
        }
        return { at, dur };
      });
    return { kind: "hits", hits };
  }
  let m = rest.match(/^quarters\s+(\d+)$/);
  if (m) return { kind: "quarters", count: parseInt(m[1], 10) };
  m = rest.match(/^eighths\s+(\d+)$/);
  if (m) return { kind: "eighths", count: parseInt(m[1], 10) };
  if (rest === "chord") return { kind: "chord" };
  if (rest === "sustain") return { kind: "sustain" };
  throw new ParseError(`unknown rhythm: ${rest}`, line);
}

function parseNotes(text: string, line: number): NoteSpec {
  const rest = text.slice(6).trim();
  if (rest.startsWith("chord ")) {
    return { kind: "chord", indices: rest.slice(6).split(/\s+/).map((n) => parseInt(n, 10)) };
  }
  if (rest.startsWith("scale ")) {
    return { kind: "scale", indices: rest.slice(6).split(/\s+/).map((n) => parseInt(n, 10)) };
  }
  if (rest.startsWith("drum ")) {
    return { kind: "drum", pcs: rest.slice(5).split(/\s+/).map((n) => parseInt(n, 10)) };
  }
  if (rest.startsWith("seq ")) {
    return { kind: "seq", tokens: parseNoteTokens(rest.slice(4).split(/\s+/), line) };
  }
  throw new ParseError("notes must be chord, scale, drum, or seq ...", line);
}

function parseNoteTokens(parts: string[], line: number): NoteToken[] {
  const tokens: NoteToken[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === "chord" && parts[i + 1] !== undefined) {
      tokens.push({ kind: "chord", value: parseInt(parts[++i], 10) });
    } else if (p === "scale" && parts[i + 1] !== undefined) {
      tokens.push({ kind: "scale", value: parseInt(parts[++i], 10) });
    } else if (p === "interval" && parts[i + 1] !== undefined) {
      tokens.push({ kind: "interval", value: parseInt(parts[++i], 10) });
    } else if (p === "drum" && parts[i + 1] !== undefined) {
      tokens.push({ kind: "drum", value: parseInt(parts[++i], 10) });
    } else {
      throw new ParseError(`invalid seq token: ${p}`, line);
    }
  }
  return tokens;
}

function parseSpanSlice(raw: string): SpanSlice {
  if (raw.includes(",")) {
    return { kind: "indices", indices: raw.split(",").map((n) => parseInt(n.trim(), 10)) };
  }
  if (raw.includes(":")) {
    const [startStr, endStr] = raw.split(":");
    const start = parseInt(startStr, 10);
    if (endStr === "") return { kind: "range", start };
    return { kind: "range", start, end: parseInt(endStr, 10) };
  }
  const idx = parseInt(raw, 10);
  return { kind: "range", start: idx, end: idx + 1 };
}

function parseSpanRef(nameWithSlice: string): SpanRef {
  const m = nameWithSlice.match(/^(\w+)(?:\[(.+)\])?$/);
  if (!m) throw new Error(`invalid span ref: ${nameWithSlice}`);
  return { name: m[1], slice: m[2] !== undefined ? parseSpanSlice(m[2]) : undefined };
}

function parsePlacement(text: string, line: number): PlacementDecl {
  const m = text.match(
    /^place\s+(\w+)\s+on\s+(\w+(?:\[[^\]]+\])?)\s+track\s+(\w+)(?:\s+register\s+(\d+))?(?:\s+velocity\s+(\d+))?$/,
  );
  if (!m) throw new ParseError("expected place PAT on TARGET[slice] track NAME", line);
  return {
    pattern: m[1],
    target: parseSpanRef(m[2]),
    track: m[3],
    register: m[4] ? parseInt(m[4], 10) : undefined,
    velocity: m[5] ? parseInt(m[5], 10) : undefined,
  };
}

function parsePlaceRange(text: string, line: number): PlaceRangeDecl {
  const velList = text.match(/\s+velocities\s+((?:\d+\s*)+)$/);
  const velocities = velList
    ? velList[1].trim().split(/\s+/).map((n) => parseInt(n, 10))
    : undefined;
  const base = velList ? text.slice(0, velList.index) : text;
  const m = base.match(
    /^place_range\s+(\w+)\s+spans\s+(.+?)\s+track\s+(\w+)(?:\s+register\s+(\d+))?(?:\s+velocity\s+(\d+))?$/,
  );
  if (!m) throw new ParseError("expected place_range PAT spans ... track NAME", line);
  return {
    pattern: m[1],
    spanRefs: m[2].trim().split(/\s+/).map(parseSpanRef),
    track: m[3],
    register: m[4] ? parseInt(m[4], 10) : undefined,
    velocity: m[5] ? parseInt(m[5], 10) : undefined,
    velocities,
  };
}

function parsePlaceAt(text: string, line: number): PlaceAtDecl {
  const m = text.match(
    /^place_at\s+(\w+)\s+at\s+([\d.]+)\s+track\s+(\w+)(?:\s+register\s+(\d+))?(?:\s+velocity\s+(\d+))?$/,
  );
  if (!m) throw new ParseError("expected place_at PAT at BEATS track NAME", line);
  return {
    pattern: m[1],
    atBeats: parseFloat(m[2]),
    track: m[3],
    register: m[4] ? parseInt(m[4], 10) : undefined,
    velocity: m[5] ? parseInt(m[5], 10) : undefined,
  };
}

function parseTrackGain(text: string, line: number): TrackGainDecl {
  const m = text.match(
    /^track_gain\s+(\w+)\s+(swell|fade_in|fade_out)\s+([\d.]+)\s+([\d.]+)$/,
  );
  if (!m) throw new ParseError("expected track_gain TRACK swell|fade_in|fade_out START END", line);
  return {
    track: m[1],
    shape: m[2] as TrackGainDecl["shape"],
    startBeats: parseFloat(m[3]),
    endBeats: parseFloat(m[4]),
  };
}

function parsePlaceVaryingBlock(ls: Line[], start: number): { decl: PlaceVaryingDecl; next: number } {
  const head = ls[start].text;
  const hm = head.match(
    /^place_varying\s+(\w+)\s+spans\s+(.+?)\s+track\s+(\w+)(?:\s+register\s+(\d+))?(?:\s+velocity\s+(\d+))?$/,
  );
  if (!hm) throw new ParseError("expected place_varying PAT spans ... track NAME", ls[start].num);

  const vary: VaryRule[] = [];
  let i = start + 1;
  while (i < ls.length && !TOP_LEVEL.test(ls[i].text)) {
    const t = ls[i].text;
    let vm = t.match(/^vary\s+every\s+(\d+)\s+use\s+(\w+)(?:\s+offset\s+(\d+))?$/);
    if (vm) {
      vary.push({
        kind: "every",
        every: parseInt(vm[1], 10),
        pattern: vm[2],
        offset: vm[3] !== undefined ? parseInt(vm[3], 10) : undefined,
      });
    } else {
      vm = t.match(/^vary\s+chance\s+([\d.]+)\s+use\s+(\w+)(?:\s+seed\s+(\d+))?$/);
      if (vm) {
        vary.push({
          kind: "chance",
          chance: parseFloat(vm[1]),
          pattern: vm[2],
          seed: vm[3] !== undefined ? parseInt(vm[3], 10) : undefined,
        });
      } else {
        vm = t.match(/^vary\s+on\s+([\d,\s]+)\s+use\s+(\w+)$/);
        if (vm) {
          vary.push({
            kind: "onSteps",
            steps: vm[1].split(/[,\s]+/).filter(Boolean).map((n) => parseInt(n, 10)),
            pattern: vm[2],
          });
        } else {
          throw new ParseError("expected vary every|chance|on ...", ls[i].num);
        }
      }
    }
    i++;
  }

  return {
    decl: {
      defaultPattern: hm[1],
      spanRefs: hm[2].trim().split(/\s+/).map(parseSpanRef),
      track: hm[3],
      register: hm[4] ? parseInt(hm[4], 10) : undefined,
      velocity: hm[5] ? parseInt(hm[5], 10) : undefined,
      vary,
    },
    next: i,
  };
}

function parsePlaceNote(text: string, line: number): PlaceNoteDecl {
  const m = text.match(
    /^place_note\s+(degree|chord|pc)\s+([\d.]+)\s+(?:span\s+(\w+(?:\[[^\]]+\])?)|at\s+([\d.]+))\s+track\s+(\w+)\s+register\s+(\d+)\s+dur\s+([\d.]+)(?:\s+velocity\s+(\d+))?$/,
  );
  if (!m) {
    throw new ParseError(
      "expected place_note degree|chord|pc N span TARGET|at BEATS track NAME register R dur D",
      line,
    );
  }
  return {
    pitch: { kind: m[1] as "degree" | "chord" | "pc", value: parseFloat(m[2]) },
    spanRef: m[3] !== undefined ? parseSpanRef(m[3]) : undefined,
    atBeats: m[4] !== undefined ? parseFloat(m[4]) : undefined,
    track: m[5],
    register: parseInt(m[6], 10),
    durBeats: parseFloat(m[7]),
    velocity: m[8] !== undefined ? parseInt(m[8], 10) : undefined,
  };
}

function parseSidechain(text: string, line: number): SidechainDecl {
  const m = text.match(
    /^sidechain\s+trigger\s+(\w+)\s+ducks\s+([\w\s]+?)(?:\s+spans\s+(.+?))?(?:\s+from\s+([\d.]+)\s+to\s+([\d.]+))?(?:\s+amount\s+([\d.]+))?(?:\s+release\s+(\d+))?$/,
  );
  if (!m) {
    throw new ParseError(
      "expected sidechain trigger T ducks A B [spans ...] [from X to Y] [amount N] [release MS]",
      line,
    );
  }
  return {
    trigger: m[1],
    ducks: m[2].trim().split(/\s+/),
    spanRefs: m[3] ? m[3].trim().split(/\s+/).map(parseSpanRef) : undefined,
    startBeats: m[4] !== undefined ? parseFloat(m[4]) : undefined,
    endBeats: m[5] !== undefined ? parseFloat(m[5]) : undefined,
    amount: m[6] !== undefined ? parseFloat(m[6]) : undefined,
    releaseMs: m[7] !== undefined ? parseInt(m[7], 10) : undefined,
  };
}

function parseModulation(text: string, line: number): ModulationDecl {
  const m = text.match(
    /^modulate\s+from\s+(\w+)\s+to\s+(\w+)\s+at\s+([\d.]+)(?:\s+method\s+(direct|common_tone|dominant|chromatic_mediant|enharmonic))?(?:\s+pivot\s+([ivIVb#]+))?(?:\s+duration\s+([\d.]+))?$/,
  );
  if (!m) {
    throw new ParseError(
      "expected modulate from KEY to KEY at BEATS [method M] [pivot DEG] [duration N]",
      line,
    );
  }
  return {
    fromKey: m[1],
    toKey: m[2],
    atBeats: parseFloat(m[3]),
    method: m[4] as "direct" | "common_tone" | "dominant" | undefined,
    pivotDegree: m[5],
    pivotBeats: m[6] !== undefined ? parseFloat(m[6]) : undefined,
  };
}

function parseVoiceLeading(text: string, line: number): VoiceLeadingDecl {
  const m = text.match(/^voice_leading\s+(\w+)\s+on\s+(\w+|\*)$/);
  if (!m) throw new ParseError("expected voice_leading TRACK on TARGET", line);
  return { track: m[1], target: m[2] };
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
    case "sustain":
      return [{ at: 0, dur: 1 }];
    case "hits":
      return spec.hits.flatMap((h) => [{ at: h.at, dur: h.dur }]);
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

function noteSpecsToMelodicFlat(spec: NoteSpec) {
  if (spec.kind === "chord") {
    return spec.indices.map((value) => ({ kind: "chord_tone" as const, value }));
  }
  if (spec.kind === "scale") {
    return spec.indices.map((value) => ({ kind: "scale_degree" as const, value }));
  }
  if (spec.kind === "drum") {
    return spec.pcs.map((value) => ({ kind: "fixed_pc" as const, value }));
  }
  return noteTokensToMelodic(spec.tokens);
}

function noteTokensToMelodic(tokens: NoteToken[]) {
  return tokens.map((t) => {
    switch (t.kind) {
      case "chord":
        return { kind: "chord_tone" as const, value: t.value };
      case "scale":
        return { kind: "scale_degree" as const, value: t.value };
      case "interval":
        return { kind: "interval_from_prev" as const, value: t.value };
      case "drum":
        return { kind: "fixed_pc" as const, value: t.value };
    }
  });
}

export { noteSpecsToMelodicFlat as noteSpecsToMelodic, noteTokensToMelodic };
