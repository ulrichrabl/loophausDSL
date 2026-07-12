/**
 * LivePlayer — multitimbral real-time playback of instrument graphs.
 *
 * Several instruments play at once, each on its own track bus with an
 * optional shared effect chain, summed through a master limiter:
 *
 *   voices -> track gain -> [bus effects] -> master gain -> limiter -> out
 *
 * Browser-safe: pass any AudioContext (a DAW's, a browser's, or
 * node-web-audio-api's real-time context; OfflineAudioContext works for
 * deterministic tests). The host calls noteOn/noteOff — exactly the
 * interface a DAW or a MIDI keyboard handler wants.
 *
 *   const player = new LivePlayer(ctx, { samples });
 *   player.addTrack("keys", buildInstrument("fm_epiano").instrument);
 *   player.addTrack("bass", buildInstrument("acid_bass").instrument, {
 *     gain: 0.9,
 *     effects: [{ kind: "audio_node", type: "effect", effectType: "delay",
 *                 input: "", params: { time: 0.3, feedback: 0.4, mix: 0.25 } }],
 *   });
 *   player.noteOn("keys", 64);        // hold...
 *   player.noteOff("keys", 64);       // ...release
 */
import type { EffectNode, Instrument, SampleBank } from "../core/audio_types.ts";
import { midiToHz } from "../core/theory.ts";
import { buildEffectBus, startLiveVoice, type LiveVoice } from "../midi/audio_renderer.ts";
import { soundForDrumNote, triggerDrumVoice } from "../midi/drums.ts";

export interface LivePlayerOptions {
  samples?: SampleBank;
  masterGain?: number;       // default 0.8
  /** Disable the master limiter (DynamicsCompressor safety net). */
  noLimiter?: boolean;
}

export interface LiveTrackOptions {
  gain?: number;             // track bus level (default 0.8)
  /** Shared effect chain on the track bus (EffectNode.input is ignored). */
  effects?: EffectNode[];
  /** Max simultaneous voices; defaults to the instrument's polyphony. */
  polyphony?: number;
}

interface ActiveVoice {
  voice: LiveVoice;
  midi: number;
}

interface Track {
  /** Undefined for drum tracks — hits are procedural, keyed by MIDI note. */
  instrument?: Instrument;
  input: any;                // where voices connect
  gainNode: any;
  polyphony: number;
  voices: ActiveVoice[];
}

export class LivePlayer {
  readonly ctx: any;
  private readonly samples?: SampleBank;
  private readonly tracks = new Map<string, Track>();
  readonly master: any;

  constructor(ctx: any, opts: LivePlayerOptions = {}) {
    this.ctx = ctx;
    this.samples = opts.samples;
    this.master = ctx.createGain();
    this.master.gain.value = opts.masterGain ?? 0.8;
    if (opts.noLimiter) {
      this.master.connect(ctx.destination);
    } else {
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 4;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.15;
      this.master.connect(limiter);
      limiter.connect(ctx.destination);
    }
  }

  addTrack(name: string, instrument: Instrument, opts: LiveTrackOptions = {}): void {
    this.addBus(name, instrument, opts);
  }

  /**
   * Percussion track: noteOn triggers self-terminating procedural drum
   * voices keyed by MIDI note (36 kick, 38 snare, 42/46 hats, 49 crash,
   * 39 clap); noteOff is a no-op.
   */
  addDrumTrack(name: string, opts: Omit<LiveTrackOptions, "polyphony"> = {}): void {
    this.addBus(name, undefined, opts);
  }

  private addBus(name: string, instrument: Instrument | undefined, opts: LiveTrackOptions): void {
    if (this.tracks.has(name)) throw new Error(`Track "${name}" already exists`);
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = opts.gain ?? 0.8;
    let input = gainNode;
    if (opts.effects?.length) {
      const bus = buildEffectBus(this.ctx, opts.effects, this.ctx.currentTime);
      gainNode.connect(bus.input);
      bus.output.connect(this.master);
      input = gainNode;
    } else {
      gainNode.connect(this.master);
    }
    this.tracks.set(name, {
      instrument,
      input,
      gainNode,
      polyphony: opts.polyphony ?? instrument?.polyphony ?? 8,
      voices: [],
    });
  }

  /** Start a note. Steals the oldest voice when the track is at polyphony. */
  noteOn(track: string, midi: number, velocity = 0.8, when?: number): void {
    const t = this.getTrack(track);
    if (!t.instrument) {
      const at = when ?? this.ctx.currentTime;
      triggerDrumVoice(this.ctx, soundForDrumNote(midi), midiToHz(midi), at, 0.5, velocity, t.input);
      return;
    }
    t.voices = t.voices.filter(v => v.voice.active);
    while (t.voices.length >= t.polyphony) {
      const oldest = t.voices.shift()!;
      oldest.voice.noteOff(when);
    }
    const voice = startLiveVoice(t.instrument, {
      ctx: this.ctx,
      destination: t.input,
      freqHz: midiToHz(midi),
      velocity,
      when,
      samples: this.samples,
    });
    t.voices.push({ voice, midi });
  }

  /** Release all active voices playing `midi` on the track. */
  noteOff(track: string, midi: number, when?: number): void {
    const t = this.getTrack(track);
    for (const v of t.voices) {
      if (v.midi === midi && v.voice.active) v.voice.noteOff(when);
    }
    t.voices = t.voices.filter(v => v.voice.active);
  }

  /** Number of currently sounding (gate-open) voices on a track. */
  activeVoices(track: string): number {
    const t = this.getTrack(track);
    return t.voices.filter(v => v.voice.active).length;
  }

  setTrackGain(track: string, value: number, when?: number): void {
    const t = this.getTrack(track);
    t.gainNode.gain.setValueAtTime(value, when ?? this.ctx.currentTime);
  }

  allNotesOff(when?: number): void {
    for (const t of this.tracks.values()) {
      for (const v of t.voices) {
        if (v.voice.active) v.voice.noteOff(when);
      }
      t.voices = [];
    }
  }

  trackNames(): string[] {
    return [...this.tracks.keys()];
  }

  private getTrack(name: string): Track {
    const t = this.tracks.get(name);
    if (!t) throw new Error(`Unknown track "${name}" — addTrack() first (have: ${[...this.tracks.keys()].join(", ") || "none"})`);
    return t;
  }
}
