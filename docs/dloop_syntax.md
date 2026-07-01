# .loop DSL syntax (v0)

Line-oriented text that compiles to `GraphBuilder`. Reference implementation: TypeScript API in `src/core/graph.ts`.

## Header

```
@tempo 120
@meter 4/4
@swing 0.15          # optional
@key C major         # modes: major, natural_minor, dorian, ...
```

## Tracks

```
track bass instrument wobble_bass channel 2
track drums percussion channel 10
```

Instrument names match `src/instruments/registry.ts`.

## Progression

```
progression main beats 4:
  vi IV I V
```

`beats` is `beatsPerStep` (one chord per N beats). Supports `i*2` repetition tokens.

## Patterns

```
pattern kick unit 4 register 2 velocity 105:
  rhythm quarters 4
  notes drum 0 0 0 0

pattern motif unit 4 register 5 transform invert:
  rhythm dotted 0.375 0.125 0.25 0.25
  notes chord 0 1 2 1
```

Rhythm forms:
- `"X x x x"` — mini-notation (quotes required)
- `quarters N` — N equal steps in the unit
- `eighths N`
- `chord` — three simultaneous chord tones at onset 0
- `dotted d1 d2 d3 ...` — explicit normalized durations summing within unit

Notes forms:
- `chord 0 1 2` — chord tone indices
- `drum 0 0 0 0` — fixed pitch classes (for percussion)

## Placement

```
place kick on main track drums
place motif on main[0:3] track lead
place motif_inv on main[3] track lead
```

Slice `[start:end]` selects harmonic span indices from the progression.

## Constraints & envelopes

```
voice_leading pad on main
register keys 55 79
envelope sweep pad filter.cutoff exp 0 16 200 8000
```

## Run

```bash
npx tsx src/run_loop.ts examples/loop/electronic_loop.loop --explain
npm test   # includes DSL golden tests
```

## Not yet in v0

- `placeVarying`, sections, sidechain, multiple keys, inline `placeNote`
