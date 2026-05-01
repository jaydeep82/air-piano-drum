/**
 * Synthesised drum kit — Web Audio, no samples.
 *
 * Each hit is a one-shot: an oscillator (or noise source) wrapped in
 * a short gain envelope, started fresh on every trigger. There's no
 * voice pool or "currently playing" tracking — the audio nodes
 * self-destruct via `osc.stop(t + tail)`, and overlapping hits just
 * sum naturally at the master gain. Drums are the cleanest case for
 * fire-and-forget audio: every strike is a fresh transient, never a
 * sustained note.
 *
 * Why synthesis instead of samples:
 *   - Bundle stays tiny — no asset files, no licence headaches.
 *   - Same trade-off as PianoSynth: a synthesised kit sounds cheap
 *     next to a real sample pack, but it's instantly playable in any
 *     browser with no asset pipeline. Phase 6/post-MVP can swap in
 *     samples behind the same `trigger(name)` interface.
 */

export const DRUM_NAMES = [
  "closed-hat", "open-hat", "crash",     "high-tom",
  "kick",       "snare",    "low-tom",   "mid-tom",
];

export class DrumSynth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  resume() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  }

  trigger(name, velocity = 0.9) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case "kick":       return this._kick(t, velocity);
      case "snare":      return this._snare(t, velocity);
      case "closed-hat": return this._hat(t, velocity, false);
      case "open-hat":   return this._hat(t, velocity, true);
      case "low-tom":    return this._tom(t, velocity, 110, 55);
      case "mid-tom":    return this._tom(t, velocity, 165, 80);
      case "high-tom":   return this._tom(t, velocity, 220, 110);
      case "crash":      return this._crash(t, velocity);
    }
  }

  // --- Hit primitives ---------------------------------------------------

  _kick(t, vel) {
    // Sine drop from 120Hz → 40Hz with a click on top so it punches
    // through the rest of the mix on cheap laptop speakers.
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = env(this.ctx, t, vel, 0.002, 0.28);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.35);

    // Click — short noise burst high-passed for the attack.
    const n = noiseSource(this.ctx, 0.04);
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1500;
    const ng = env(this.ctx, t, vel * 0.4, 0.001, 0.04);
    n.connect(hp).connect(ng).connect(this.master);
    n.start(t);
    n.stop(t + 0.06);
  }

  _snare(t, vel) {
    // Body: tuned sine at 200Hz, very short.
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 200;
    const og = env(this.ctx, t, vel * 0.5, 0.001, 0.12);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);

    // Rattle: band-passed noise.
    const n = noiseSource(this.ctx, 0.25);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 0.6;
    const ng = env(this.ctx, t, vel * 0.7, 0.002, 0.18);
    n.connect(bp).connect(ng).connect(this.master);
    n.start(t);
    n.stop(t + 0.25);
  }

  _hat(t, vel, open) {
    const dur = open ? 0.3 : 0.06;
    const n = noiseSource(this.ctx, dur + 0.05);
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 6000;
    const g = env(this.ctx, t, vel * 0.45, 0.001, dur);
    n.connect(hp).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  _tom(t, vel, fStart, fEnd) {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(fStart, t);
    osc.frequency.exponentialRampToValueAtTime(fEnd, t + 0.18);
    const g = env(this.ctx, t, vel * 0.85, 0.003, 0.4);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  _crash(t, vel) {
    // Long shimmery noise wash. Two band-passes summed give a
    // brighter top end than a single filter would.
    const dur = 1.2;
    const n = noiseSource(this.ctx, dur + 0.1);
    const bp1 = this.ctx.createBiquadFilter();
    bp1.type = "bandpass"; bp1.frequency.value = 5000; bp1.Q.value = 0.8;
    const bp2 = this.ctx.createBiquadFilter();
    bp2.type = "bandpass"; bp2.frequency.value = 9000; bp2.Q.value = 0.6;
    const sum = this.ctx.createGain();
    n.connect(bp1).connect(sum);
    n.connect(bp2).connect(sum);
    const g = env(this.ctx, t, vel * 0.6, 0.005, dur);
    sum.connect(g).connect(this.master);
    n.start(t);
    n.stop(t + dur + 0.1);
  }
}

// --- Helpers ------------------------------------------------------------

function env(ctx, t, peak, attack, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  return g;
}

function noiseSource(ctx, dur) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}
