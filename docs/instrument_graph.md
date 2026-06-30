# Instrument graph (implemented subset)

Status: **implemented** for library instruments in `src/instruments/library.ts`.

Synths are declarative audio graphs — not hardcoded `voiceXxx()` functions. Each instrument is a map of nodes rendered by `src/midi/audio_renderer.ts`.

## Node kinds in use

| Type | Role |
|------|------|
| `osc` | sine / saw / square — `$freq`, optional detune |
| `math` | e.g. `$freq / 2` for sub-oscillator |
| `mixer` | sum detuned sources |
| `env_gen` | ADSR or AD envelopes |
| `filter` | lowpass / bandpass with modulated cutoff |
| `amp` | VCA with envelope on gain |
| `effect` | distortion (broken_signal_lead) |

## Modulation shape

Any parameter can be:

- a constant number
- a port: `$freq`, `$vel`, `$gate`
- another node name (audio-rate)
- `{ base, mod: [{ source, amount }] }`

Example (wobble bass filter):

```
filter.cutoff: base 180 + filterEnv × 3200
```

## Standalone testing (Phase 2)

No score piece required:

```bash
npx tsx src/demos/synth_sweep.ts wobble_bass --explain
npm test   # includes instrument explain + render smoke tests
```

Programmatic API:

```typescript
import { buildInstrument } from "./instruments/registry.ts";
import { explainInstrument } from "./core/explain_instrument.ts";
import { renderInstrumentNote } from "./midi/render_instrument.ts";

const { instrument } = buildInstrument("wobble_bass");
console.log(explainInstrument(instrument));
const buffer = await renderInstrumentNote(instrument, { midi: 36, durationSec: 0.8 });
```

## Not yet implemented

- Music-graph envelopes modulating instrument-internal parameters
- LFO nodes in library presets
- Browser / realtime path
- Retiring legacy pitched voices in `web_audio.ts` (Phase 3)

See also: `docs/audio_graph_design.md` (full vision).

**Phase 3 (`bridge_demo`):** 8-bar piece where every pitched track uses `instrument:` — no hardcoded pitched voices in the renderer.
