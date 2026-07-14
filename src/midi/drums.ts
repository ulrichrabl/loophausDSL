/**
 * Procedural drum voice synthesis — kick, snare, hats, crash, clap.
 *
 * Context-agnostic (browser or Node, offline or real-time): every voice is
 * a short self-terminating node graph triggered at an absolute context
 * time, so both the offline renderer and the live transport share them.
 *
 * The drum track multiplexes — kick, snare, hat all share the track.
 * We disambiguate by MIDI note number:
 *   36 = kick, 38 = snare, 39 = clap, 42 = closed hat, 46 = open hat, 49 = crash
 */

export type DrumSound =
  | "kick" | "snare" | "closed_hat" | "open_hat" | "crash" | "clap";

export function soundForDrumNote(midi: number): DrumSound {
  if (midi === 36) return "kick";
  if (midi === 38) return "snare";
  if (midi === 39) return "clap";
  if (midi === 42) return "closed_hat";
  if (midi === 46) return "open_hat";
  if (midi === 49) return "crash";
  return "kick"; // fallback
}

export function triggerDrumVoice(
  ctx: any,
  sound: DrumSound,
  freq: number,
  t: number,
  dur: number,
  vel: number,
  dest: any,
) {
  switch (sound) {
    case "kick":       return voiceKick(ctx, t, vel, dest);
    case "snare":      return voiceSnare(ctx, t, vel, dest);
    case "closed_hat": return voiceClosedHat(ctx, t, vel, dest);
    case "open_hat":   return voiceOpenHat(ctx, t, vel, dest);
    case "crash":      return voiceCrash(ctx, t, vel, dest);
    case "clap":       return voiceClap(ctx, t, vel, dest);
  }
}

function voiceKick(ctx: any, t: number, vel: number, dest: any) {
  // Sine with pitch sweep and click. 808-style.
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel * 1.1, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

  osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + 0.4);

  // Click transient — high-passed noise burst for impact
  const noise = makeNoise(ctx, 0.01);
  const click = ctx.createBiquadFilter();
  click.type = "highpass";
  click.frequency.value = 3000;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(vel * 0.4, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
  noise.connect(click);
  click.connect(clickGain);
  clickGain.connect(dest);
  noise.start(t);
  noise.stop(t + 0.02);
}

function voiceSnare(ctx: any, t: number, vel: number, dest: any) {
  // Noise + a 180 Hz body tone.
  const noise = makeNoise(ctx, 0.25);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1500;
  const ngain = ctx.createGain();
  ngain.gain.setValueAtTime(0, t);
  ngain.gain.linearRampToValueAtTime(vel * 0.7, t + 0.002);
  ngain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  noise.connect(hp);
  hp.connect(ngain);
  ngain.connect(dest);
  noise.start(t);
  noise.stop(t + 0.25);

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.value = 180;
  const bgain = ctx.createGain();
  bgain.gain.setValueAtTime(0, t);
  bgain.gain.linearRampToValueAtTime(vel * 0.35, t + 0.002);
  bgain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  body.connect(bgain);
  bgain.connect(dest);
  body.start(t);
  body.stop(t + 0.1);
}

function voiceClosedHat(ctx: any, t: number, vel: number, dest: any) {
  const noise = makeNoise(ctx, 0.06);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel * 0.3, t + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  noise.connect(hp);
  hp.connect(gain);
  gain.connect(dest);
  noise.start(t);
  noise.stop(t + 0.06);
}

function voiceOpenHat(ctx: any, t: number, vel: number, dest: any) {
  const noise = makeNoise(ctx, 0.4);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel * 0.35, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  noise.connect(hp);
  hp.connect(gain);
  gain.connect(dest);
  noise.start(t);
  noise.stop(t + 0.4);
}

function voiceCrash(ctx: any, t: number, vel: number, dest: any) {
  const noise = makeNoise(ctx, 2.0);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel * 0.5, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
  noise.connect(hp);
  hp.connect(gain);
  gain.connect(dest);
  noise.start(t);
  noise.stop(t + 2.0);
}

function voiceClap(ctx: any, t: number, vel: number, dest: any) {
  // Three quick noise bursts ~10ms apart, then a slower tail.
  for (let i = 0; i < 3; i++) {
    const tt = t + i * 0.012;
    const noise = makeNoise(ctx, 0.03);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 1.0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(vel * 0.45, tt + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, tt + 0.03);
    noise.connect(bp);
    bp.connect(g);
    g.connect(dest);
    noise.start(tt);
    noise.stop(tt + 0.04);
  }
}

function makeNoise(ctx: any, durSec: number): any {
  const sr = ctx.sampleRate;
  const length = Math.ceil(sr * durSec);
  const buf = ctx.createBuffer(1, length, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}
