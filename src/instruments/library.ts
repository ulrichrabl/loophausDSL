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

/**
 * Echo Pluck — tight square/saw pluck into a feedback delay.
 *
 * The delay sits AFTER the amp envelope: the envelope gates the dry note,
 * but the wet path keeps ringing, so each pluck trails echoes. Delay time
 * 0.28s ≈ dotted eighth at 160 BPM.
 */
export function defineEchoPluck(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    sq:  { kind: "audio_node", type: "osc", wave: "square", freq: "$freq" },
    saw: { kind: "audio_node", type: "osc", wave: "saw",    freq: "$freq", detune: 5 },
    mix: { kind: "audio_node", type: "mixer", inputs: ["sq", "saw"], gains: [0.5, 0.35] },

    ampEnv:    { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.002, d: 0.22 },
    filterEnv: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.002, d: 0.12 },

    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix",
              cutoff: { base: 600, mod: [{ source: "filterEnv", amount: 2800 }] },
              q: 2 },

    amp:  { kind: "audio_node", type: "amp", input: "filter",
            gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.6 }] } },

    echo: { kind: "audio_node", type: "effect", effectType: "delay",
            input: "amp", params: { time: 0.28, feedback: 0.45, mix: 0.4 } },
  };
  return b.defineInstrument({
    name: "echo_pluck",
    polyphony: 6,
    nodes,
    output: "echo",
  });
}

/**
 * Shimmer Pad — detuned saws through chorus into a long reverb.
 * Chorus widens/blurs the detune; the reverb tail carries chords between
 * changes. Both effects are post-envelope so releases bloom into the verb.
 */
export function defineShimmerPad(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    saw1: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: -9 },
    saw2: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 0 },
    saw3: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 9 },
    mix:  { kind: "audio_node", type: "mixer", inputs: ["saw1", "saw2", "saw3"],
            gains: [0.25, 0.3, 0.25] },

    ampEnv: { kind: "audio_node", type: "env_gen", envType: "adsr",
              a: 0.5, d: 0.4, s: 0.7, r: 0.9 },

    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix", cutoff: 1800, q: 0.6 },

    amp: { kind: "audio_node", type: "amp", input: "filter",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.3 }] } },

    chorus: { kind: "audio_node", type: "effect", effectType: "chorus",
              input: "amp", params: { rate: 0.6, depth: 0.006, mix: 0.5 } },
    verb:   { kind: "audio_node", type: "effect", effectType: "reverb",
              input: "chorus", params: { duration: 2.4, decay: 0.5, mix: 0.35 } },
  };
  return b.defineInstrument({
    name: "shimmer_pad",
    polyphony: 8,
    nodes,
    output: "verb",
  });
}

/**
 * Pressed Bass — detuned saws + sub, mild drive, then a compressor for
 * glue. Distortion is pre-amp (part of the tone); the compressor is last
 * in the chain to even out level across the register.
 */
export function definePressedBass(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    saw1: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: -5 },
    saw2: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: +5 },
    subFreq: { kind: "audio_node", type: "math", op: "div", a: "$freq", b: 2 },
    sub:  { kind: "audio_node", type: "osc", wave: "sine",
            freq: { base: 0, mod: [{ source: "subFreq", amount: 1 }] } },
    mix:  { kind: "audio_node", type: "mixer", inputs: ["saw1", "saw2", "sub"],
            gains: [0.4, 0.4, 0.6] },

    ampEnv:    { kind: "audio_node", type: "env_gen", envType: "adsr",
                 a: 0.004, d: 0.12, s: 0.6, r: 0.15 },
    filterEnv: { kind: "audio_node", type: "env_gen", envType: "ad",
                 a: 0.004, d: 0.2 },

    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix",
              cutoff: { base: 150, mod: [{ source: "filterEnv", amount: 2200 }] },
              q: 5 },

    drive: { kind: "audio_node", type: "effect", effectType: "distortion",
             input: "filter", params: { amount: 2.5, mix: 0.8 } },

    amp:  { kind: "audio_node", type: "amp", input: "drive",
            gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.8 }] } },

    comp: { kind: "audio_node", type: "effect", effectType: "compressor",
            input: "amp",
            params: { threshold: -20, ratio: 5, attack: 0.005, release: 0.15, makeup: 1.2 } },
  };
  return b.defineInstrument({
    name: "pressed_bass",
    polyphony: 4,
    nodes,
    output: "comp",
  });
}

/**
 * FM E-Piano — two-operator FM, DX7-style. The modulator runs at 1:1 with
 * the carrier; its envelope decays faster than the amp so notes start
 * bright and mellow out. A 14th-partial "tine" adds the attack ping.
 */
export function defineFmEpiano(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    modOsc: { kind: "audio_node", type: "osc", wave: "sine", freq: "$freq" },
    modEnv: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.002, d: 0.5, curve: "exp" },
    modAmp: { kind: "audio_node", type: "amp", input: "modOsc",
              gain: { base: 0, mod: [{ source: "modEnv", amount: 1 }] } },
    // Frequency deviation = index × fundamental, so the modulation index
    // (brightness) is constant across the keyboard. $freq amount 4 = index 4
    // at the attack peak, decaying with modEnv to a mellow sustain.
    fmDepth: { kind: "audio_node", type: "amp", input: "modAmp",
               gain: { base: 0, mod: [{ source: "$freq", amount: 4 }] } },
    carrier: { kind: "audio_node", type: "osc", wave: "sine",
               freq: { base: 0, mod: [{ source: "$freq", amount: 1 }, { source: "fmDepth", amount: 1 }] } },

    // Tine ping — 14th partial, fast decay
    tineFreq: { kind: "audio_node", type: "math", op: "mul", a: "$freq", b: 14 },
    tine: { kind: "audio_node", type: "osc", wave: "sine",
            freq: { base: 0, mod: [{ source: "tineFreq", amount: 1 }] } },
    tineEnv: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.001, d: 0.08, curve: "exp" },
    tineAmp: { kind: "audio_node", type: "amp", input: "tine",
               gain: { base: 0, mod: [{ source: "tineEnv", amount: 0.2 }] } },

    mix: { kind: "audio_node", type: "mixer", inputs: ["carrier", "tineAmp"], gains: [0.8, 1] },
    ampEnv: { kind: "audio_node", type: "env_gen", envType: "adsr",
              a: 0.002, d: 0.9, s: 0.3, r: 0.25, curve: "exp" },
    amp: { kind: "audio_node", type: "amp", input: "mix",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.5 }, { source: "$vel", amount: 0.15 }] } },
  };
  return b.defineInstrument({ name: "fm_epiano", polyphony: 8, nodes, output: "amp" });
}

/**
 * FM Bell — inharmonic 3.5:1 modulator ratio, long exponential decay into
 * reverb. The modulation index decays over the note so the spectrum
 * simplifies as it rings, like a struck bell.
 */
export function defineFmBell(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    modFreq: { kind: "audio_node", type: "math", op: "mul", a: "$freq", b: 3.5 },
    modOsc: { kind: "audio_node", type: "osc", wave: "sine",
              freq: { base: 0, mod: [{ source: "modFreq", amount: 1 }] } },
    modEnv: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.001, d: 1.2, curve: "exp" },
    modAmp: { kind: "audio_node", type: "amp", input: "modOsc",
              gain: { base: 0, mod: [{ source: "modEnv", amount: 1 }] } },
    // Deviation keytracked at index 3 for a bright inharmonic clang
    fmDepth: { kind: "audio_node", type: "amp", input: "modAmp",
               gain: { base: 0, mod: [{ source: "$freq", amount: 3 }] } },
    carrier: { kind: "audio_node", type: "osc", wave: "sine",
               freq: { base: 0, mod: [{ source: "$freq", amount: 1 }, { source: "fmDepth", amount: 1 }] } },

    ampEnv: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.001, d: 2.2, curve: "exp" },
    amp: { kind: "audio_node", type: "amp", input: "carrier",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.45 }] } },
    verb: { kind: "audio_node", type: "effect", effectType: "reverb",
            input: "amp", params: { duration: 2.0, decay: 0.5, mix: 0.3 } },
  };
  return b.defineInstrument({ name: "fm_bell", polyphony: 8, nodes, output: "verb" });
}

/**
 * Drawbar Organ — additive spectrum via PeriodicWave (Hammond-ish drawbar
 * ratios), instant on/off envelope, fast shallow chorus for Leslie shimmer.
 */
export function defineDrawbarOrgan(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    tone: { kind: "audio_node", type: "osc", wave: "custom", freq: "$freq",
            harmonics: [1, 0.85, 0.6, 0.5, 0, 0.4, 0, 0.35] },
    sub:  { kind: "audio_node", type: "osc", wave: "sine", freq: "$freq", detune: -1200 },
    mix:  { kind: "audio_node", type: "mixer", inputs: ["tone", "sub"], gains: [0.5, 0.3] },

    ampEnv: { kind: "audio_node", type: "env_gen", envType: "adsr",
              a: 0.005, d: 0.01, s: 1, r: 0.06 },
    amp: { kind: "audio_node", type: "amp", input: "mix",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.4 }] } },
    leslie: { kind: "audio_node", type: "effect", effectType: "chorus",
              input: "amp", params: { rate: 5.5, depth: 0.0015, mix: 0.4 } },
  };
  return b.defineInstrument({ name: "drawbar_organ", polyphony: 8, nodes, output: "leslie" });
}

/**
 * String Machine — 70s ensemble strings: wide detuned saws, slow attack,
 * deep slow chorus doing the heavy lifting, gentle top-end rolloff.
 */
export function defineStringMachine(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    saw1: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: -14 },
    saw2: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: -4 },
    saw3: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 6 },
    saw4: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 15 },
    mix:  { kind: "audio_node", type: "mixer", inputs: ["saw1", "saw2", "saw3", "saw4"],
            gains: [0.22, 0.25, 0.25, 0.22] },

    ampEnv: { kind: "audio_node", type: "env_gen", envType: "adsr",
              a: 0.3, d: 0.2, s: 0.85, r: 0.5 },
    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix", cutoff: 2600, q: 0.5 },
    amp: { kind: "audio_node", type: "amp", input: "filter",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.32 }] } },
    ensemble: { kind: "audio_node", type: "effect", effectType: "chorus",
                input: "amp", params: { rate: 0.45, depth: 0.009, mix: 0.6 } },
  };
  return b.defineInstrument({ name: "string_machine", polyphony: 8, nodes, output: "ensemble" });
}

/**
 * Acid Bass — 303-style: single saw, screaming resonant lowpass, exponential
 * envelopes. Velocity drives the cutoff, so accented steps squeal — the
 * first library instrument to use $vel modulation.
 */
export function defineAcidBass(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    saw: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq" },

    ampEnv:    { kind: "audio_node", type: "env_gen", envType: "adsr",
                 a: 0.003, d: 0.1, s: 0.4, r: 0.08, curve: "exp" },
    filterEnv: { kind: "audio_node", type: "env_gen", envType: "ad",
                 a: 0.003, d: 0.18, curve: "exp" },

    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "saw",
              cutoff: { base: 120, mod: [
                { source: "filterEnv", amount: 1400 },
                { source: "$vel", amount: 2800 },   // accent: hard hits open the filter
              ] },
              q: 14 },
    drive: { kind: "audio_node", type: "effect", effectType: "distortion",
             input: "filter", params: { amount: 2, mix: 0.7 } },
    amp: { kind: "audio_node", type: "amp", input: "drive",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.7 }] } },
  };
  return b.defineInstrument({ name: "acid_bass", polyphony: 2, nodes, output: "amp" });
}

/**
 * Hoover Lead — rave stab: saws an octave apart plus a nasty detuned square,
 * chorus smear, drive. The classic Alpha Juno "what time is love" shape.
 */
export function defineHooverLead(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    saw1: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: -10 },
    saw2: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 10 },
    sawLoFreq: { kind: "audio_node", type: "math", op: "div", a: "$freq", b: 2 },
    sawLo: { kind: "audio_node", type: "osc", wave: "saw",
             freq: { base: 0, mod: [{ source: "sawLoFreq", amount: 1 }] }, detune: 5 },
    sq: { kind: "audio_node", type: "osc", wave: "square", freq: "$freq", detune: -25 },
    mix: { kind: "audio_node", type: "mixer", inputs: ["saw1", "saw2", "sawLo", "sq"],
           gains: [0.3, 0.3, 0.35, 0.2] },

    ampEnv:    { kind: "audio_node", type: "env_gen", envType: "adsr",
                 a: 0.01, d: 0.1, s: 0.8, r: 0.2 },
    filterEnv: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.01, d: 0.3 },
    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix",
              cutoff: { base: 900, mod: [{ source: "filterEnv", amount: 2500 }] },
              q: 2 },
    smear: { kind: "audio_node", type: "effect", effectType: "chorus",
             input: "filter", params: { rate: 1.1, depth: 0.006, mix: 0.5 } },
    drive: { kind: "audio_node", type: "effect", effectType: "distortion",
             input: "smear", params: { amount: 2, mix: 0.6 } },
    amp: { kind: "audio_node", type: "amp", input: "drive",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.4 }] } },
  };
  return b.defineInstrument({ name: "hoover_lead", polyphony: 5, nodes, output: "amp" });
}

/**
 * Soft Brass — saw section with slow filter swell (the "hhaaah" onset),
 * keytracked cutoff so high notes keep their shine.
 */
export function defineSoftBrass(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    saw1: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: -6 },
    saw2: { kind: "audio_node", type: "osc", wave: "saw", freq: "$freq", detune: 6 },
    mix:  { kind: "audio_node", type: "mixer", inputs: ["saw1", "saw2"], gains: [0.45, 0.45] },

    ampEnv:    { kind: "audio_node", type: "env_gen", envType: "adsr",
                 a: 0.07, d: 0.25, s: 0.8, r: 0.25 },
    filterEnv: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.12, d: 0.5 },
    filter: { kind: "audio_node", type: "filter", filterType: "lowpass",
              input: "mix",
              // Keytracked base (amount 3 = 3× fundamental) + swell
              cutoff: { base: 300, mod: [
                { source: "$freq", amount: 3 },
                { source: "filterEnv", amount: 1800 },
              ] },
              q: 1.2 },
    amp: { kind: "audio_node", type: "amp", input: "filter",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.4 }] } },
  };
  return b.defineInstrument({ name: "soft_brass", polyphony: 6, nodes, output: "amp" });
}

/**
 * Glass Keys — sparse odd-harmonic spectrum (custom wave), exponential
 * decay, chorus + reverb. Glassy mallet keys for ambient work.
 */
export function defineGlassKeys(b: GraphBuilder) {
  const nodes: Record<string, AudioNode> = {
    tone: { kind: "audio_node", type: "osc", wave: "custom", freq: "$freq",
            harmonics: [1, 0, 0.4, 0, 0.25, 0, 0, 0, 0.12] },
    shimmerFreq: { kind: "audio_node", type: "math", op: "mul", a: "$freq", b: 4 },
    shimmer: { kind: "audio_node", type: "osc", wave: "sine",
               freq: { base: 0, mod: [{ source: "shimmerFreq", amount: 1 }] } },
    shimmerEnv: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.001, d: 0.25, curve: "exp" },
    shimmerAmp: { kind: "audio_node", type: "amp", input: "shimmer",
                  gain: { base: 0, mod: [{ source: "shimmerEnv", amount: 0.1 }] } },

    mix: { kind: "audio_node", type: "mixer", inputs: ["tone", "shimmerAmp"], gains: [0.6, 1] },
    ampEnv: { kind: "audio_node", type: "env_gen", envType: "ad", a: 0.002, d: 1.6, curve: "exp" },
    amp: { kind: "audio_node", type: "amp", input: "mix",
           gain: { base: 0, mod: [{ source: "ampEnv", amount: 0.45 }, { source: "$vel", amount: 0.1 }] } },
    chorus: { kind: "audio_node", type: "effect", effectType: "chorus",
              input: "amp", params: { rate: 0.7, depth: 0.004, mix: 0.4 } },
    verb: { kind: "audio_node", type: "effect", effectType: "reverb",
            input: "chorus", params: { duration: 2.2, decay: 0.45, mix: 0.35 } },
  };
  return b.defineInstrument({ name: "glass_keys", polyphony: 8, nodes, output: "verb" });
}

/**
 * Sampler instrument factory — wraps a named sample in a playable voice:
 * repitched from rootMidi, gated by an ADSR, optionally filtered.
 *
 * Sample *bytes* come from the host at render time (SampleBank); the graph
 * only declares which sample and how to play it, so a .loop piece using a
 * sampler stays portable across DAW and Node renders.
 */
export interface SamplerInstrumentOptions {
  name: string;
  sample: string;            // SampleBank key
  rootMidi?: number;         // default 60 (C4)
  pitched?: boolean;         // default true
  loop?: boolean;            // loop while the note is held (default false)
  gain?: number;             // output level (default 0.8)
  adsr?: { a: number; d: number; s: number; r: number; curve?: "linear" | "exp" };
  cutoff?: number;           // optional lowpass, e.g. to tame bright samples
  polyphony?: number;
}

export function defineSampler(b: GraphBuilder, opts: SamplerInstrumentOptions) {
  const env = opts.adsr ?? { a: 0.003, d: 0.05, s: 1, r: 0.15 };
  const nodes: Record<string, AudioNode> = {
    smp: { kind: "audio_node", type: "sampler", sample: opts.sample,
           rootMidi: opts.rootMidi, pitched: opts.pitched, loop: opts.loop },
    ampEnv: { kind: "audio_node", type: "env_gen", envType: "adsr",
              a: env.a, d: env.d, s: env.s, r: env.r, curve: env.curve },
  };
  let ampInput = "smp";
  if (opts.cutoff !== undefined) {
    nodes.filter = { kind: "audio_node", type: "filter", filterType: "lowpass",
                     input: "smp", cutoff: opts.cutoff, q: 0.7 };
    ampInput = "filter";
  }
  nodes.amp = { kind: "audio_node", type: "amp", input: ampInput,
                gain: { base: 0, mod: [{ source: "ampEnv", amount: opts.gain ?? 0.8 }] } };
  return b.defineInstrument({
    name: opts.name,
    polyphony: opts.polyphony ?? 8,
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
