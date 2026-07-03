# Human + AI collaboration loop

How to iterate on Loophaus with a partner (human or agent) without flying blind.

## Two layers, same habit

| Layer | Edit | Review | Listen |
|-------|------|--------|--------|
| **Score (A)** | `src/examples/*.ts`, `play.ts` | `explain(g, r)` | `npx tsx src/run.ts <piece>` |
| **Synth (B)** | `src/instruments/library.ts` | `explainInstrument(inst)` | `npm run synth:sweep -- wobble_bass` |

Structure first, ears last.

## Standard workflow

```
1. INTENT     — write or update examples/intent/<piece>.intent.json
2. EDIT       — change graph (score) and/or instrument (sound)
3. TEST       — npm run test:unit   (fast)  or  npm test   (full + explain snapshots)
4. REVIEW     — read explain output; npm run explain:check catches drift
5. LISTEN     — render WAV only when structure looks right
6. LOCK       — if intentional, npm run explain:update
```

## Commands

| Command | When |
|---------|------|
| `npm run test:unit` | After every edit (no slow WAV renders) |
| `npm test` | Before commit (includes integration render + explain snapshots) |
| `npm run explain:check` | Verify score explain text unchanged |
| `npm run synth:sweep -- <inst> --explain` | Review synth graph after sound-design edits |
| `npm run intent:check` | Verify intent specs match graphs |

## Intent files

`examples/intent/*.intent.json` describe **structural** expectations (mode shifts, sections, bar ranges) — not “sounds good”.

Example checks:
- bridge section uses Dorian at beats 64–96 (`halflight`)
- all pitched tracks declare `instrument:` (`bridge_demo`)

Add an intent file when a piece encodes a feature you never want to regress.

## What to automate vs what to judge by ear

**Automate:** event counts, degrees, mode at bar range, instrument binding, explain snapshots, render smoke (non-empty WAV).

**Human/agent:** groove, mix balance, emotional arc, “does the bridge land?”

## Suggested agent prompt

> Change [X] in `bridge_demo`. Run `npm run test:unit`. Show me the `explain()` diff for harmonic progression and any `explainInstrument()` changes. Only render WAV if tests pass.

## Milestone pieces

| Piece | Role |
|-------|------|
| `minor_vamp` | Kernel basics (CI golden) |
| `electronic_loop` | Drums + envelope (CI golden) |
| `halflight` | Sections + mode shift (CI golden + intent) |
| `bridge_demo` | A+B integration (8 bars, all instruments) |

Portfolio pieces (`helios`, `threshold`, …) are demos — not CI gates unless promoted.
