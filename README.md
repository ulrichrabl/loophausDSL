# Loophaus — working prototype

A parametric music composition kernel. Six primitives, a solver, a synth engine,
and a library of example pieces.

**Not related to [vcz-Gray/loophaus](https://github.com/vcz-Gray/loophaus)** (AI coding loops).
This project is a score graph (A) + instrument graph (B) probe for parametric music.

## Status

This is the probe — a working prototype to test the parametric music thesis
through actual composition. Not a product. The code is honest, audio is rendered
through real subtractive synthesis (node-web-audio-api), and the pieces exercise
the kernel from multiple angles.

## Running

```bash
npm install
npm test                                 # solver goldens + explain snapshots
npx tsx src/run.ts                     # list available examples
npx tsx src/run.ts bridge_demo         # 8-bar A+B demo (all pitched = instrument graphs)
npx tsx src/run.ts halflight           # render one example → ./outputs/
npx tsx src/run.ts halflight --explain # also print structured analysis
npx tsx src/run.ts modulation_demo      # C minor → G minor key change
npx tsx src/run_loop.ts examples/loop/modulation_demo.loop
npx tsx src/run_loop.ts examples/loop/effects_demo.loop   # per-instrument effect chains
```

Rendered WAV/MIDI goes to `./outputs/` by default. Override with `OUTPUT_DIR`.

## Using as a package

Install straight from git (the `prepare` script builds `dist/` automatically):

```bash
npm install github:ulrichrabl/loophausDSL
```

Two entry points:

- **`loophaus`** — browser-safe core: `compileLoop`, `solve`, `explain`,
  `GraphBuilder`, theory helpers, instrument definitions, `renderInstrumentVoice`
  (context-agnostic per-voice synthesis). No Node.js dependencies — bundles
  cleanly into web apps.
- **`loophaus/node`** — offline rendering to files: `renderWebAudio` (WAV),
  `renderMidi`, `renderInstrumentNote`. Requires Node (native audio + fs).

```typescript
import { compileLoop, solve, explain } from "loophaus";
import { renderWebAudio } from "loophaus/node";   // Node only

const graph = compileLoop(loopSource);   // .loop text → graph
const result = solve(graph);             // graph → events (beats, pitch, velocity, track)
console.log(explain(graph, result));     // structured commentary
await renderWebAudio(graph, result, "out.wav");
```

A DAW integration consumes `result.events` and schedules them with its own
playback engine; `.loop` text is the interchange format.

## Testing

| Command | What it checks |
|---------|----------------|
| `npm test` | Full suite + explain snapshots (~3s + WAV renders) |
| `npm run test:unit` | Fast unit tests only (~1s, no WAV renders) |
| `npm run test:integration` | WAV render smoke tests only |
| `npm run intent:check` | Intent specs match graph structure |
| `npm run explain:update` | Regenerate `snapshots/explain/*.txt` after intentional changes |
| `npm run explain:check` | Verify explain output matches committed snapshots |
| `npm run loop:run` | Compile/render a `.loop` file → WAV |
| `npm run synth:sweep` | Render isolated instrument notes → `./outputs/synth_*.wav` |

**`.loop` DSL:** [docs/dloop_syntax.md](docs/dloop_syntax.md) — golden-tested against core examples.

**Collaboration loop:** [docs/collaboration_loop.md](docs/collaboration_loop.md)

Each rendered WAV goes to `./outputs/<name>.wav` (or `$OUTPUT_DIR`).

## Synth effects (`src/core/audio_types.ts`)

Instruments are declarative audio graphs; effects are just nodes in the chain,
placed anywhere via `input:`. Five effect types, all wet/dry-mixable:

| Effect | Parameters | Example instrument |
|--------|-----------|--------------------|
| `distortion` | amount, mix | `broken_signal_lead`, `pressed_bass` |
| `delay` | time, feedback, mix | `echo_pluck` |
| `chorus` | rate, depth, mix | `shimmer_pad` |
| `reverb` | duration, decay, mix | `shimmer_pad` |
| `compressor` | threshold, ratio, attack, release, knee, makeup | `pressed_bass` |

Time-based effects automatically extend the voice's render tail
(`instrumentTailSec`) so delay feedback and reverb decay ring out instead of
being truncated. See `examples/loop/effects_demo.loop` for all of them in a mix.

## Instrument palette (`src/instruments/library.ts`)

17 instruments across families, all declarative audio graphs:

| Family | Instruments | Techniques |
|--------|-------------|------------|
| Bass | `wobble_bass`, `pressed_bass`, `acid_bass` | sub-osc, drive+compressor, 303 accent via `$vel`→cutoff |
| Leads | `supersaw_lead`, `broken_signal_lead`, `hoover_lead` | detune stacks, distortion, rave chorus |
| Pads/strings | `warm_pad`, `shimmer_pad`, `string_machine` | slow envelopes, chorus→reverb, ensemble chorus |
| Keys | `fm_epiano`, `glass_keys`, `drawbar_organ`, `clavinet_stab` | 2-op FM, custom PeriodicWave spectra, exp decay |
| Bells/plucks | `fm_bell`, `echo_pluck`, `felt_synth`, `soft_brass` | inharmonic FM, feedback delay, keytracked filter |

Synthesis features: custom additive waveforms (`wave: "custom"` + `harmonics`),
2-operator FM (audio-rate signal into `osc.freq`), exponential envelope curves,
pink noise, ring modulation (audio-rate `math mul`), and port modulation —
`$vel`/`$freq` in any mod matrix for velocity-sensitive brightness and
keytracking. Velocity-timbre instruments render correctly in full mixes via
velocity-bucketed voice caching. Audition everything:
`npm run synth:sweep -- all`.

## Samples

Sample *semantics* live in the kernel; sample *bytes* come from the host.
A `sampler` node names a sample, its root pitch, and loop behavior — the
graph stays declarative and portable. At render time the host passes a
`SampleBank` (name → AudioBuffer):

```typescript
import { GraphBuilder, defineSampler } from "loophaus";
import { loadSamplesFromDir, renderWebAudio } from "loophaus/node";

const samples = await loadSamplesFromDir("./samples");   // kick.wav → "kick"
const inst = defineSampler(b, {
  name: "piano", sample: "piano_c4", rootMidi: 60,       // repitched per note
  adsr: { a: 0.002, d: 0.1, s: 0.8, r: 0.3 },
});
await renderWebAudio(graph, result, "out.wav", { samples });
```

In a browser DAW, decode with your own `AudioContext` and pass the same bank
shape. One-shots (crashes, risers) play to the end of the sample past
note-off; `loop: true` sustains while the note is held. Try
`npx tsx src/demos/sampler_demo.ts` — it synthesizes its own pluck sample,
so no assets are needed.

## Kernel — six primitives (`src/core/types.ts`)

- **Event** — discrete temporal happening (position + duration + optional pitch + track)
- **Envelope** — continuous function over a span (filter sweeps, volume fades)
- **Relationship** — typed directional binding (HarmonicSpan, RhythmicPattern, MelodicPattern, EnvelopeBinding, Sidechain)
- **Constraint** — bidirectional restriction (voice-leading, register range)
- **Context** — interpretive scope (Key, Meter, Tempo, Transport, Track)
- **Reference** — typed pointer between graph nodes

## Examples

| Name | Bars | Key/Mode | Demonstrates |
|------|------|----------|--------------|
| minor_vamp | 8 | C minor | Kernel basics — progression, motif under chords, inversion, voice-leading |
| electronic_loop | 4 | C major | Drums + bass following roots + filter envelope |
| daft_punk | 16 | A minor | French house — build-up, drum fills, lead with development |
| freygish_nights | 16 | D Phrygian Dominant | Modal harmony, sparse arrangement, filter sweep |
| polymorph | 24 | F# minor → Dorian → minor | Same motif recontextualized across mode shifts |
| halflight | 32 | C# minor → Dorian → minor | Real dynamics via gain envelopes, section abstraction, hat fills |
| strata | 32 | B minor (3 sections) | Section-based composition with declared sidechain |

## Framework API surface

```typescript
const b = new GraphBuilder();

// Transport with optional swing
b.transport(b.tempo(92), b.meter(4, 4), { swing: 0.22 });

// Contexts
const key = b.key(pcFromName("C#"), "natural_minor");
const drumTrack = b.track("drums", 10, { program: 26, isPercussion: true });

// Progression via mini-notation
const spans = b.progression({
  inKey: key,
  pattern: "i VI VII i i VI VII i",   // accepts *N repetition
  startBeats: 0,
});

// Sections (named ranges)
const verse = b.section("verse", spans);

// Rhythm via mini-notation (X = accent, x = normal, . = rest)
const kick = b.melodicPattern({
  unitBeats: 4,
  ownRhythm: b.rhythmMini("X x x x", 4),
  notes: Array(4).fill({ kind: "fixed_pc" as const, value: 0 }),
  defaultRegister: 2,
});

// Place across spans, optionally with variation
b.placeRange({ pattern: kick, underSpans: verse.spans, track: drumTrack, velocity: 108 });
b.placeVarying({
  default: hatNormal, underSpans: verse.spans, track: drumTrack,
  vary: [
    { every: 4, use: hatFill, offset: 3 },     // every 4th step
    { chance: 0.2, use: hatGhost, seed: 7 },   // probabilistic
    { onSteps: [3, 7], use: accent },          // explicit steps
  ],
});

// One-off note inline
b.placeNote({
  underHarmonicSpan: spans[7], track: leadTrack, register: 5,
  degree: 0, durBeats: 3.5, velocity: 95,
});

// Constraints
b.smoothVoiceLeading([inst1, inst2, inst3, inst4]);
b.registerRange(inst, 57, 79);

// Envelopes (target filter.cutoff or gain on track buses)
const fade = b.envelope({
  parameter: "gain", startBeats: 0, endBeats: 16,
  from: 0.05, to: 0.55, curve: "linear",
});
b.bindEnvelope({ envelope: fade, targetEntity: padTrack, targetParameter: "gain" });

// Sidechain
b.sidechain({ trigger: drumTrack, ducks: [bassTrack, padTrack], amount: 0.35, releaseMs: 180 });

// Key modulation (tonic change, not just mode shift)
b.modulateWithPivot({ fromKey: keyCm, toKey: keyGm, atBeats: 16, method: "dominant", pivotDegree: "V" });
```

## File layout

```
src/
  core/
    types.ts        The six primitives
    theory.ts       Scales, degrees, chord-tone derivation
    graph.ts        GraphBuilder API
    solver.ts       Graph -> concrete events
    explain.ts      Structured commentary
  midi/
    render.ts       MIDI file output (GM soundfont path)
    web_audio.ts    Real synthesis: subtractive synth + sidechain + reverb
  examples/        Eight pieces of increasing complexity
  run.ts           Unified runner
  play.ts          User playground
```

## Known gaps (next-round candidates)

1. Per-event velocity envelopes within an instance (build across N bars) — `noteEnvelope` exists in TS API
2. Drum synthesis as declarative instrument graphs (currently hardcoded voices keyed to MIDI note numbers)
3. Browser version with live editing — kernel is platform-agnostic
4. Audio-rate sidechain via AudioWorklet
5. Full `.loop` ports of remaining registry examples (`daft_punk`, `strata`, `helios`, …)
