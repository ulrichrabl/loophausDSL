/**
 * Example instruments — synths composed as audio graphs.
 *
 * Each is a function that registers an Instrument with the GraphBuilder
 * and returns its Id. The Id is then bound to a track via track({instrument}).
 *
 * These replace the hardcoded voiceXxx() functions in web_audio.ts for
 * tracks that opt in. Existing pieces using GM `program: N` keep working
 * through the legacy renderer path.
 */
import type { GraphBuilder } from "../core/graph.ts";
import type { AudioNode } from "../core/audio_types.ts";

/**
 * Wobble Bass — two detuned saws + sub-sine through a resonant lowpass.
 * Filter envelope on every note for that "wow" pluck character.
 */
export function defineWobbleBass(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    // Two detuned saws + sub
    saw1:   { kind: "audio_node", type: "osc", wave: "saw",  freq: "$freq", detune: -7 },
    saw2:   { kind: "audio_node", type: "osc", wave: "saw",  freq: "$freq", detune: +7 },
    // Sub is one octave down — pre-compute via math node
    subFreq: { kind: "audio_node", type: "math", op: "div", a: "$freq", b: 2 },
    sub:    { kind: "audio_node", type: "osc", wave: "sine", freq: { base: 0, mod: [{ source: "subFreq", amount: 1 }] } },

    // Mix
    mix:    { kind: "audio_node", type: "mixer", inputs: ["saw1", "saw2", "sub"], gains: [0.45, 0.45, 0.65] },

    // Envelopes
    ampEnv:    { kind: "audio_node", type: "env_gen", envType: "adsr",
                 a: 0.005, d: 0.18, s: 0.55, r: 0.2 },
    filterEnv: { kind: "audio_node", type: "env_gen", envType: "ad",
                 a: 0.005, d: 0.32 },

    // Resonant lowpass with envelope on cutoff
    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix",
              cutoff: { base: 180, mod: [{ source: "filterEnv", amount: 3200 }] },
              q: 7 },

    // Final amp with envelope + velocity
    amp:    { kind: "audio_node", type: "amp", input: "filter",
              gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.85 }] } },
  };
  return b.defineInstrument({
    name: "wobble_bass",
    polyphony: 4,
    nodes,
    output: "amp",
  });
}

/**
 * Supersaw Lead — five detuned sawtooths, lowpass with envelope.
 */
export function defineSupersawLead(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    saw1: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: -12 },
    saw2: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: -6 },
    saw3: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 0 },
    saw4: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 6 },
    saw5: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 12 },
    mix:  { kind: "audio_node", type: "mixer", inputs: ["saw1","saw2","saw3","saw4","saw5"],
            gains: [0.2, 0.22, 0.25, 0.22, 0.2] },

    ampEnv:    { kind: "audio_node", type: "env_gen", envType: "adsr",
                 a: 0.008, d: 0.15, s: 0.65, r: 0.18 },
    filterEnv: { kind: "audio_node", type: "env_gen", envType: "ad",
                 a: 0.005, d: 0.25 },

    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix",
              cutoff: { base: 800, mod: [{ source: "filterEnv", amount: 4500 }] },
              q: 4 },

    amp: { kind: "audio_node", type: "amp", input: "filter",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.5 }] } },
  };
  return b.defineInstrument({
    name: "supersaw_lead",
    polyphony: 6,
    nodes,
    output: "amp",
  });
}

/**
 * Warm Pad — stacked detuned saws, slow attack/release, gentle lowpass.
 * Filter cutoff is bindable from outside via piece-level envelope on the
 * pad track's bus filter (existing mechanism in web_audio.ts).
 */
export function defineWarmPad(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    saw1: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: -12 },
    saw2: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: -7 },
    saw3: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 0 },
    saw4: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 7 },
    saw5: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 12 },
    mix:  { kind: "audio_node", type: "mixer", inputs: ["saw1","saw2","saw3","saw4","saw5"],
            gains: [0.18, 0.2, 0.22, 0.2, 0.18] },

    ampEnv: { kind: "audio_node", type: "env_gen", envType: "adsr",
              a: 0.4, d: 0.3, s: 0.7, r: 0.5 },

    // Voice-level filter (broad). Piece-level filter sweeps happen on the bus.
    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix",
              cutoff: 2200, q: 0.7 },

    amp: { kind: "audio_node", type: "amp", input: "filter",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.35 }] } },
  };
  return b.defineInstrument({
    name: "warm_pad",
    polyphony: 8,
    nodes,
    output: "amp",
  });
}

/**
 * Felt Synth — soft, vocal-like, warm. Sine dominant with subtle saw harmonics.
 * Slow attack, long release. The kind of voice that suggests breath, not bite.
 */
export function defineFeltSynth(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    // Sine carries the body; tiny saw adds breath
    sine: { kind: "audio_node", type: "osc", wave: "sine", freq: "$freq" },
    saw:  { kind: "audio_node", type: "osc", wave: "saw",  freq: "$freq", detune: 4 },
    // Sub-octave sine for warmth
    subFreq: { kind: "audio_node", type: "math", op: "div", a: "$freq", b: 2 },
    sub:  { kind: "audio_node", type: "osc", wave: "sine",
            freq: { base: 0, mod: [{ source: "subFreq", amount: 1 }] } },

    mix:  { kind: "audio_node", type: "mixer", inputs: ["sine", "saw", "sub"],
            gains: [0.6, 0.18, 0.3] },

    // Slow vocal-style envelope — breath in, breath out
    ampEnv: { kind: "audio_node", type: "env_gen", envType: "adsr",
              a: 0.08, d: 0.2, s: 0.7, r: 0.6 },

    // Warm lowpass — kills high harmonics so the saw doesn't bite
    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix",
              cutoff: 1100, q: 0.5 },

    amp: { kind: "audio_node", type: "amp", input: "filter",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.4 }] } },
  };
  return b.defineInstrument({
    name: "felt_synth",
    polyphony: 6,
    nodes,
    output: "amp",
  });
}

/**
 * Broken Signal Lead — 70s sci-fi distress beacon.
 *
 * Square + saw stack through hard waveshaper distortion, fast aggressive
 * filter envelope, slight detune for analog instability. The lead from
 * a dying spacecraft transmission.
 */
export function defineBrokenSignalLead(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    // Square wave + sawtooth, slightly detuned for VHS-warble
    sq:   { kind: "audio_node", type: "osc", wave: "square", freq: "$freq", detune: -8 },
    saw:  { kind: "audio_node", type: "osc", wave: "saw",    freq: "$freq", detune: +8 },
    // Sub octave for body
    subFreq: { kind: "audio_node", type: "math", op: "div", a: "$freq", b: 2 },
    sub:  { kind: "audio_node", type: "osc", wave: "square",
            freq: { base: 0, mod: [{ source: "subFreq", amount: 1 }] } },

    mix:  { kind: "audio_node", type: "mixer", inputs: ["sq", "saw", "sub"],
            gains: [0.45, 0.4, 0.35] },

    // Envelopes — fast, aggressive
    ampEnv:    { kind: "audio_node", type: "env_gen", envType: "adsr",
                 a: 0.003, d: 0.08, s: 0.45, r: 0.12 },
    filterEnv: { kind: "audio_node", type: "env_gen", envType: "ad",
                 a: 0.002, d: 0.15 },

    // Resonant lowpass with sharper Q
    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix",
              cutoff: { base: 300, mod: [{ source: "filterEnv", amount: 5500 }] },
              q: 12 },

    // Distortion — the punk character
    distortion: { kind: "audio_node", type: "effect", effectType: "distortion",
                  input: "filter", params: { amount: 4 } },

    amp: { kind: "audio_node", type: "amp", input: "distortion",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.55 }] } },
  };
  return b.defineInstrument({
    name: "broken_signal_lead",
    polyphony: 4,
    nodes,
    output: "amp",
  });
}

export function defineClavinetStab(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    sq1: { kind: "audio_node", type: "osc", wave: "square", freq: "$freq", detune: -3 },
    sq2: { kind: "audio_node", type: "osc", wave: "square", freq: "$freq", detune: +3 },
    mix: { kind: "audio_node", type: "mixer", inputs: ["sq1", "sq2"], gains: [0.5, 0.5] },

    ampEnv:    { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.003, d: 0.18 },
    filterEnv: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.003, d: 0.08 },

    // Bandpass that sweeps down — characteristic clavinet "tonk"
    filter: { kind: "audio_node", type: "filter", filterType: "bandpass",
              input: "mix",
              cutoff: { base: 800, mod: [{ source: "filterEnv", amount: 2500 }] },
              q: 3 },

    amp: { kind: "audio_node", type: "amp", input: "filter",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.7 }] } },
  };
  return b.defineInstrument({
    name: "clavinet_stab",
    polyphony: 6,
    nodes,
    output: "amp",
  });
}
