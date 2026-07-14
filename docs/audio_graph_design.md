# Audio Graph Design Sketch

Status: design proposal, not implementation. Goal: make synthesis first-class
kernel material, not a renderer hack.

## The problem with what we have now

The current Web Audio renderer has hardcoded JavaScript functions like
`voiceSawLead(freq, t, dur, vel, dest)`. Each one is a black box. Consequences:

1. **The graph doesn't know what a synth is.** It just dispatches by track name.
2. **You can't modulate synth internals from the music graph.** An envelope
   targeting "filter cutoff" only hits the track's post-fader filter — not the
   per-note filter inside the synth voice.
3. **You can't define a new synth without writing JavaScript.** Sound design is
   outside the kernel.
4. **You can't share, edit, or serialize a synth.** They're functions in code.
5. **An LLM can't reason about a synth.** It's opaque code, not data.

This violates the kernel philosophy. The architectural answer: **synths are
graph compositions**, the same way pieces are graph compositions. Same primitive
shape, applied one level down.

## The core idea

Add a parallel family of nodes to the kernel: the **audio graph**. It has its
own primitives, its own relationships, its own contexts — but it integrates
cleanly with the music graph via well-defined boundaries.

Two graphs, one kernel:

- **Music graph**: events, envelopes, harmonic spans, patterns. Operates at
  the level of musical intention. Time unit: beats.
- **Audio graph**: oscillators, filters, modulators, signal flow. Operates at
  the level of synthesis. Time unit: seconds, samples, or trigger-based.

They meet at the **Instrument** boundary: a music graph track has an Instrument;
the Instrument is an audio graph fragment with declared input ports (frequency,
velocity, gate) and an output port (audio out).

## Audio primitives

The minimum useful set. ~9 node kinds.

### Sources
- **Oscillator** — periodic wave. Params: wave (sine/saw/square/triangle/custom),
  freq, detune. `wave: "custom"` takes `harmonics: number[]` (additive partial
  magnitudes, rendered as a PeriodicWave) — organs, bells, glassy keys.
  An oscillator's freq param accepts audio-rate modulation from another node,
  which is 2-operator FM (see `fm_epiano`, `fm_bell`).
- **Noise** — broadband noise. Params: color (white/pink). Output: audio.
- **Sampler** — plays a named sample from a host-provided SampleBank.
  Params: sample (bank key), rootMidi, pitched (repitch via playbackRate),
  loop/loopStart/loopEnd. One-shots play to the end of the sample; looped
  samples gate with the note. The kernel owns sample *semantics*; the host
  owns the *bytes* (browser: decode with its AudioContext; Node:
  `loadSample`/`loadSamplesFromDir` from `loophaus/node`).

### Processors
- **Filter** — biquad. Params: type (lp/hp/bp/notch), cutoff, q. In: audio.
  Out: audio.
- **VCA / Amp** — multiplicative amplifier. Params: gain. In: audio. Out: audio.
- **Mixer** — weighted sum of audio inputs. Params: gains[]. In: audio[]. Out: audio.
- **Effect** — per-voice effect processor with wet/dry routing. Implemented
  types and their parameters (all with sensible defaults):
  - `distortion` — amount (drive), mix
  - `delay` — time (sec), feedback (0..0.95), mix
  - `chorus` — rate (Hz), depth (sec), mix
  - `reverb` — duration (sec), decay (shape), mix
  - `compressor` — threshold (dB), ratio, attack, release, knee, makeup

  Effects sit anywhere in an instrument chain (`input:` names the upstream
  node). Time-based effects extend the voice's render tail automatically so
  echoes and reverb ring out fully (see `instrumentTailSec`).

### Modulators (produce control-rate signals)
- **EnvelopeGenerator** — ADSR, AD, AR. Triggered by gate or note-on.
  Output: control signal in [0, 1]. `curve: "exp"` gives exponential
  decay/release for percussive realism (attack stays linear).
- **LFO** — low-frequency oscillator. Params: wave, rate (Hz or beat-synced),
  depth, phase. Output: control signal.

### Math
- **Combinator** — small set of operations on signals: add, multiply, scale,
  divide. Static operands are evaluated once per voice ("this freq is the
  input freq divided by 2"). add/sub/mul with node-ref operands run at audio
  rate — mul of two signals is ring modulation.

### Modulation sources
Any mod-matrix route can use a node name (audio-rate) or a port:
`$vel` contributes `amount × velocity` (velocity → cutoff = accents),
`$freq` contributes `amount × freqHz` (keytracking; amount 1 tracks the
fundamental).

That's it. Everything else (compressors, sidechain, drum synthesis, complex
FM) is composable from these.

## Audio relationships

Two kinds of connections in the audio graph:

### AudioConnection
Signal flows from one node's audio output to another node's audio input.
Sample-rate, continuous.

```
saw1 -> mixer
filter -> amp
amp -> output
```

### ModulationConnection
A control-rate signal targets a node's parameter, with a base value and a
modulation amount.

```
{ target: filter.cutoff,
  base: 200,                       # baseline in Hz
  modulations: [
    { source: filterEnv, amount: 4000 },     # envelope adds up to 4000 Hz
    { source: lfo, amount: 500 },            # LFO sweeps ±500 Hz
  ] }
```

This unifies the modulation matrix that every modular synth has. Any control
source can modulate any parameter, with stacked modulations summing.

Important: this is *the same primitive* as Envelope binding in the music graph.
A music-graph Envelope ("filter sweeps from 200Hz to 4000Hz over bars 5-16")
binds to the *base value* of a modulatable parameter, even one inside a synth.
So a music-level envelope can drive a per-instrument parameter.

## The Instrument

An Instrument is a named, encapsulated audio sub-graph. It declares:

```typescript
{
  name: "wobble_bass",
  polyphony: 4,                          // max simultaneous voices

  // Input ports — what the music graph provides per note
  ports: {
    freq: PerNoteFrequency,              // pitch as Hz
    vel:  PerNoteVelocity,               // 0..1
    gate: PerNoteGate,                   // on/off, with note-on time + duration
  },

  // Internal nodes
  nodes: { ... },

  // Internal connections (audio + modulation)
  connections: { ... },

  // Output port
  output: NodeRef,                       // which internal node feeds the track bus
}
```

When a music-graph event fires on a track bound to this Instrument:

1. A voice of this Instrument is allocated (subject to polyphony limit).
2. The freq, velocity, and gate ports get set for this voice.
3. The voice runs the audio graph and outputs to the track bus.
4. After the gate goes low and the release completes, the voice deallocates.

**Voice-stealing**: when polyphony is reached and a new note arrives, the
oldest still-sounding voice is stolen. Configurable strategies later.

**Monophonic synths**: polyphony = 1. New notes retrigger the existing voice
(with optional portamento — gliding the freq port instead of jumping).

## How the music graph and audio graph meet

Currently in the kernel:

```typescript
const bassTrack = b.track("bass", channel: 2, program: 38);
```

After this change:

```typescript
const wobbleBass = b.defineInstrument({ name: "wobble_bass", ... });

const bassTrack = b.track("bass", channel: 2, instrument: wobbleBass);
```

The `program: 38` (MIDI GM) goes away. The Instrument *is* the sound source.
GM-based rendering becomes a fallback when no Instrument is specified, for
backward compatibility with the MIDI export path.

**Envelope bindings** in the music graph can now target three things:

1. **Track gain** — global volume (existing)
2. **Track filter cutoff** — post-fader filter on the bus (existing)
3. **Instrument parameter** — e.g. "the base cutoff of every voice of the wobble bass"
   This means a piece-wide filter sweep can drive a synth parameter, not just a
   post-fader filter on the bus.

Example:

```typescript
// A music-graph envelope drives a parameter inside an instrument
const filterOpens = b.envelope({
  parameter: "synth.filter.cutoff",
  startBeats: 0, endBeats: 64,
  from: 200, to: 3000, curve: "exp",
});
b.bindEnvelope({
  envelope: filterOpens,
  targetEntity: wobbleBass,
  targetParameter: "filter.cutoff.base",   // dotted path into the instrument
});
```

Now every voice of `wobble_bass` has its baseline filter cutoff sweep from 200
to 3000 Hz over bars 1-16. *In addition to* whatever per-note envelopes the
instrument itself has internally. They sum.

This is the parametric music power applied to synthesis. The same envelope
primitive that controls macro-level dynamics controls micro-level sound design.

## Concrete example: defining the wobble bass

```typescript
const wobbleBass = b.defineInstrument({
  name: "wobble_bass",
  polyphony: 4,

  // (a) Define the input ports
  ports: {
    freq: { kind: "freq" },
    vel:  { kind: "vel"  },
    gate: { kind: "gate" },
  },

  // (b) Define the internal nodes
  nodes: ($) => ({
    // Two detuned saws and a sub
    saw1: b.osc({ wave: "saw", freq: $.freq, detune: -7 }),
    saw2: b.osc({ wave: "saw", freq: $.freq, detune: +7 }),
    sub:  b.osc({ wave: "sine", freq: b.div($.freq, 2) }),

    // Mix them
    mix:  b.mixer({ inputs: ["saw1", "saw2", "sub"], gains: [0.4, 0.4, 0.6] }),

    // Amplitude envelope (ADSR triggered by gate)
    ampEnv: b.envGen({ type: "adsr", a: 0.005, d: 0.15, s: 0.7, r: 0.2, gate: $.gate }),

    // Filter envelope (AD triggered by gate)
    filterEnv: b.envGen({ type: "ad", a: 0.001, d: 0.3, trigger: $.gate }),

    // Resonant lowpass — cutoff base + envelope modulation
    filter: b.filter({
      type: "lowpass",
      input: "mix",
      cutoff: { base: 200, modulations: [{ source: "filterEnv", amount: 4000 }] },
      q: 8,
    }),

    // Final amp, driven by velocity * env
    amp: b.vca({
      input: "filter",
      gain: b.mul("$.vel", "ampEnv"),
    }),
  }),

  // (c) Declare the output node
  output: "amp",
});
```

This is verbose by design — the GraphBuilder syntax. A textual DSL would compress
it dramatically. But notice: *the entire synth is data*. It can be saved,
shared, edited, serialized to JSON, read by an LLM.

## What this enables

Things you couldn't do before, that follow automatically:

1. **Modulate any synth parameter from the music graph.**
   "The lead's filter opens over the whole verse" is one envelope binding.

2. **Build instruments parametrically.**
   `b.makeBass({ filterQ: 8, subAmount: 0.6 })` — a function that returns
   an instrument graph with the parameters substituted. Variations as code.

3. **Same synth, different settings on different tracks.**
   Two tracks both use `wobble_bass` but with different `filter.cutoff.base`
   bindings. Re-using sound design, not copying it.

4. **Share instrument libraries.**
   `b.loadInstruments("./instruments/dark-techno/*.json")` — community-extended
   sound libraries become trivial. This is the Grasshopper plugin ecosystem.

5. **LLM-readable synth design.**
   An LLM can read "two detuned saws + sub through resonant lowpass with envelope
   on cutoff" and reason about it. Currently the synth is opaque JS.

6. **Live-coding sound design.**
   Edit the instrument file, watch-mode re-renders. Sculpt while you compose.

## Open questions I want to think harder about

1. **Voice allocation semantics.** When a polyphony limit is hit, voice-stealing
   has subtle behavior. Last-note vs oldest vs loudest. Defaults matter.

2. **Sub-audio vs control rate.** Some modulation is audio-rate (FM, AM, ring
   mod); some is control-rate (slow envelopes, LFOs). The graph needs to know
   which is which, partly for efficiency and partly for correctness.

3. **Instrument inheritance / variation.** "Make a darker version of wobble_bass"
   — should the kernel support inheriting an instrument and overriding parameters?
   Or does that belong at the GraphBuilder layer?

4. **How does Effect (reverb, delay) compose?** Effects are different from
   voice-internal nodes — they're typically post-voice, on the bus. But sometimes
   you want a chorus inside a voice (per-note). Need to be clear about where
   they can live.

5. **Backwards compatibility.** Existing pieces use `program: 38` (GM). They
   should keep working. Migration path: GM patches become a built-in family of
   simple Instruments that wrap GM rendering.

6. **Drum synthesis.** Drums in the current renderer are special — kick has a
   pitch sweep, snare has noise+body, etc. With audio-graph synths, drums are
   just Instruments with no `freq` port (or with `freq` set per-drum). Need to
   confirm this works cleanly.

7. **Per-voice CPU budget.** Real synths cost CPU per voice. With unlimited
   polyphony, complex pieces could overrun. The kernel should expose this so
   the user knows what they're spending.

8. **Renderer abstraction.** The web_audio.ts renderer needs to be rebuilt to
   walk an audio graph. But other renderers (offline DSP, native, AudioWorklet,
   future: real DAW VST host) should be possible from the same graph. The
   audio graph must be backend-agnostic.

## Estimated scope

- Audio primitive types: 1-2 days
- Renderer rewrite to walk the audio graph: 4-6 days
- Modulation routing implementation: 2-3 days
- 8-10 example instruments designed from scratch: 2-3 days
- Migration of existing examples to use new Instruments: 1 day
- Tests and documentation: 2-3 days

**Total: roughly 2.5-3.5 weeks of focused work.** Not a session.

## Decision point

Before any code: does the design above match what you want?

Specifically, does this match your meaning of "real, manipulatable synths":

- Synths as graph compositions, not preset patches
- Every parameter modulatable from anywhere
- Music-graph envelopes can drive synth internals
- Instruments are data — saveable, shareable, LLM-readable
- A composable modulation matrix (any source → any parameter)

If yes: we proceed to implement, starting with the primitive types and a single
test instrument. If no: tell me where it diverges from what you have in mind,
and we re-design before writing code.
