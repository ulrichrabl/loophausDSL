# .loop DSL syntax

Line-oriented text that compiles to `GraphBuilder`. Reference implementation: TypeScript API in `src/core/graph.ts`.

## Header

```
@tempo 120
@meter 4/4
@swing 0.15          # optional
@key C major         # default key (alias "default")
```

Comments: `#` at line start, or `#` / `//` after whitespace. `C#` in keys is preserved.

## Named keys

```
key minor C# natural_minor
key dorian C# dorian
```

Progressions reference keys by name. `@key` sets the `default` key for progressions without an explicit `key` clause.

## Tracks

```
track bass instrument wobble_bass channel 2
track drums percussion channel 10
```

Instrument names match `src/instruments/registry.ts`. Instruments with
built-in effect chains: `echo_pluck` (feedback delay), `shimmer_pad`
(chorus → reverb), `pressed_bass` (drive → compressor),
`broken_signal_lead` (distortion). See `examples/loop/effects_demo.loop`.

## Progressions & sections

```
progression verse key minor beats 4 start 0:
  i VI VII i

progression bridge key dorian beats 4 start 16:
  i IV VII i

section verse progression verse
section bridge progression bridge
```

- `beats` is `beatsPerStep` (one chord per N beats).
- `start` is optional; omitted progressions chain after the previous one.
- Supports `i*2` repetition tokens.
- Section names may alias progression names for span targeting.

## Patterns

```
pattern kick unit 4 register 2 velocity 105:
  rhythm quarters 4
  notes drum 0 0 0 0

pattern bass unit 4 register 2:
  rhythm "X . x . X . x ."
  notes seq chord 0 interval 12 chord 0 interval 12

pattern stab unit 4 register 4:
  rhythm hits 0.375:0.1 0.875:0.1
  notes chord 0 1 2

pattern motif unit 4 register 5 transform invert:
  rhythm dotted 0.375 0.125 0.25 0.25
  notes scale 0 2 4 2
```

Rhythm forms:
- `"X x x x"` — mini-notation (quotes required)
- `quarters N` — N equal steps in the unit
- `eighths N`
- `chord` — three simultaneous chord tones at onset 0
- `sustain` — single note for full unit
- `dotted d1 d2 d3 ...` — explicit normalized durations
- `hits AT:DUR AT:DUR ...` — chord/stack hits (each hit plays all notes)

Notes forms:
- `chord 0 1 2` — chord tone indices
- `scale 0 2 4` — scale degree indices
- `drum 0 0 0 0` — fixed pitch classes (percussion)
- `seq chord 0 interval 12 chord 0 interval 12` — mixed melodic tokens

## Placement

Single progression or section target:

```
place kick on main track drums
place motif on main[0:3] track lead
place phrase on verse[0,2,4,6] track lead register 5 velocity 100
```

Multi-span `place_range`:

```
place_range kick spans intro[4:] verse bridge track drums velocity 108
place_range pad spans intro verse bridge outro track pad velocity 55
```

Slice syntax: `[3]` one span, `[0:3)` range, `[4:]` to end, `[0,2,4,6]` pick indices.

## Variation & inline notes

```
place_varying hat_normal spans verse bridge track drums register 2 velocity 60
  vary every 4 use hat_fill offset 3
  vary chance 0.2 use ghost_pat seed 7
  vary on 3,7 use accent_pat

place_note degree 0 span outro[7] track lead register 5 dur 3.5 velocity 90
place_note chord 0 span outro[7] track lead register 5 dur 3.5 velocity 90
```

## Sidechain, constraints, modulations & envelopes

```
sidechain trigger drums ducks bass pad stab lead amount 0.3 release 200

modulate from c_minor to g_minor at 16 method dominant pivot V duration 4

voice_leading pad on *
voice_leading stab on bridge
register keys 55 79

envelope sweep pad filter.cutoff exp 0 16 200 8000
```

Modulation methods: `direct` (hard cut), `common_tone` (shared scale tones), `dominant` (V7 of destination). With `pivot DEG`, the compiler creates a pivot harmonic span registered as `pivot` for placement.

## Examples

| File | TS equivalent | Features |
|------|---------------|----------|
| `examples/loop/minor_vamp.loop` | `minor_vamp.ts` | basics, inversion, register |
| `examples/loop/electronic_loop.loop` | `electronic_loop.ts` | drums + envelope |
| `examples/loop/bridge_demo.loop` | `bridge_demo.ts` | multi-key, sections, sidechain |
| `examples/loop/modulation_demo.loop` | `modulation_demo.ts` | key modulation C→G via dominant pivot |

## Run

```bash
npx tsx src/run_loop.ts examples/loop/halflight.loop --explain
npm run loop:run -- examples/loop/bridge_demo.loop
npm test   # includes DSL golden tests
```

## Not yet in DSL

- `bindTrackGain` shape helpers (`swell`, `fade_in` as one-liners) — use explicit `envelope` lines
- Per-step velocity overrides in `place_range`
- Sidechain per-section toggles

Other registry examples (`strata`, `daft_punk`, …) can be ported using the syntax above.
