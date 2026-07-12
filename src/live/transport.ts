/**
 * LiveTransport — plays a solved arrangement through a LivePlayer in
 * real time, with lookahead scheduling and looping.
 *
 * The offline renderer and the transport consume the same solver events;
 * the transport just dispatches them as noteOn/noteOff pairs slightly
 * ahead of the audio clock (the standard Web Audio "tale of two clocks"
 * pattern): a JS timer ticks every `tickMs` and schedules every event
 * whose start falls within the next `lookaheadSec` at sample-accurate
 * context times.
 *
 * On an OfflineAudioContext (tests, bounce-to-disk) there is no wall
 * clock, so play() schedules the requested number of loop iterations
 * upfront instead of ticking.
 */
import type { LivePlayer } from "./player.ts";

export interface TransportNote {
  track: string;             // LivePlayer track name
  midi: number;
  velocity: number;          // 0..1
  startBeat: number;
  durBeats: number;
}

export interface LiveTransportOptions {
  bpm: number;
  /** Repeat the arrangement until stop(). */
  loop?: boolean;
  /** Loop length in beats; defaults to the last note's end, rounded up. */
  loopBeats?: number;
  /** How far ahead of the audio clock to schedule (default 0.3s). */
  lookaheadSec?: number;
  /** Scheduler tick interval (default 50ms). */
  tickMs?: number;
}

export class LiveTransport {
  readonly bpm: number;
  readonly loopBeats: number;
  private readonly player: LivePlayer;
  private readonly ctx: any;
  private readonly notes: TransportNote[];
  private readonly loop: boolean;
  private readonly lookaheadSec: number;
  private readonly tickMs: number;
  private readonly secPerBeat: number;

  private timer: ReturnType<typeof setInterval> | null = null;
  private anchor = 0;        // context time of beat 0, iteration 0
  private idx = 0;           // next note to schedule
  private iteration = 0;
  private playing = false;

  constructor(player: LivePlayer, notes: TransportNote[], opts: LiveTransportOptions) {
    this.player = player;
    this.ctx = player.ctx;
    this.notes = [...notes].sort((a, b) => a.startBeat - b.startBeat);
    this.bpm = opts.bpm;
    this.secPerBeat = 60 / opts.bpm;
    this.loop = opts.loop ?? false;
    this.lookaheadSec = opts.lookaheadSec ?? 0.3;
    this.tickMs = opts.tickMs ?? 50;
    const lastEnd = this.notes.reduce((m, n) => Math.max(m, n.startBeat + n.durBeats), 0);
    this.loopBeats = opts.loopBeats ?? Math.max(1, Math.ceil(lastEnd));
  }

  get isPlaying(): boolean { return this.playing; }

  /** Length of one pass in seconds. */
  get lengthSec(): number { return this.loopBeats * this.secPerBeat; }

  /**
   * Start playback. `when` anchors beat 0 (default: now + 50ms of
   * scheduling headroom). On offline contexts, `iterations` passes are
   * scheduled immediately (default 1).
   */
  play(opts: { when?: number; iterations?: number } = {}): void {
    if (this.playing) return;
    if (this.notes.length === 0) return;
    this.playing = true;
    this.anchor = opts.when ?? this.ctx.currentTime + 0.05;
    this.idx = 0;
    this.iteration = 0;

    const offline = typeof this.ctx.startRendering === "function";
    if (offline) {
      const iterations = opts.iterations ?? 1;
      for (let it = 0; it < iterations; it++) {
        for (const n of this.notes) this.dispatch(n, it);
      }
      this.playing = false;   // everything scheduled — nothing left to do
      return;
    }

    this.tick();
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  /** Stop scheduling and release everything still sounding. */
  stop(when?: number): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (!this.playing) return;
    this.playing = false;
    this.player.allNotesOff(when ?? this.ctx.currentTime);
  }

  private dispatch(n: TransportNote, iteration: number): void {
    const tOn = this.anchor + (n.startBeat + iteration * this.loopBeats) * this.secPerBeat;
    const tOff = tOn + n.durBeats * this.secPerBeat;
    this.player.noteOn(n.track, n.midi, n.velocity, tOn);
    this.player.noteOff(n.track, n.midi, tOff);
  }

  private tick(): void {
    const horizon = this.ctx.currentTime + this.lookaheadSec;
    while (true) {
      if (this.idx >= this.notes.length) {
        if (!this.loop) {
          // Single pass fully scheduled — stop ticking once the clock
          // passes the end (voices/releases are already scheduled).
          if (this.ctx.currentTime > this.anchor + this.lengthSec) {
            if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
            this.playing = false;
          }
          return;
        }
        this.iteration++;
        this.idx = 0;
      }
      const n = this.notes[this.idx];
      const tOn = this.anchor + (n.startBeat + this.iteration * this.loopBeats) * this.secPerBeat;
      if (tOn > horizon) return;
      this.dispatch(n, this.iteration);
      this.idx++;
    }
  }
}
