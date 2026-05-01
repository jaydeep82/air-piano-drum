/**
 * Polyphonic piano synth — Web Audio, no samples.
 *
 * Each voice is two oscillators (sine + triangle) summed at different
 * gains, gated by an ADSR envelope so notes don't click on or off.
 * Sine carries the fundamental; triangle adds a thin layer of harmonics
 * that keeps the tone from sounding like a test signal without going
 * full FM-piano synthesis (which we'd need real samples to do well).
 *
 * Voices are keyed by MIDI note number. Re-triggering an already-held
 * note instantly retriggers the envelope rather than stacking voices,
 * which matches how a real keyboard behaves and prevents two ramps
 * fighting each other on the same gain node.
 *
 * `setMuted` flips the master gain to zero rather than tearing down
 * the audio graph — keeps in-flight envelopes alive so unmuting
 * doesn't cause a click on the next note.
 */
const ATTACK = 0.012;
const DECAY = 0.18;
const SUSTAIN = 0.55;
const RELEASE = 0.45;

export class PianoSynth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    /** @type {Map<number, {osc1:OscillatorNode,osc2:OscillatorNode,gain:GainNode}>} */
    this.voices = new Map();
  }

  /** Must be called from a real user gesture before any noteOn. */
  resume() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
  }

  /**
   * Start (or re-trigger) the given MIDI note. Velocity 0..1 scales
   * the peak envelope level — Phase 6 will derive it from pinch speed.
   */
  noteOn(midi, velocity = 0.85) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = midiToHz(midi);

    // Re-trigger: if a voice for this note already exists, ramp its
    // envelope back up rather than starting a parallel voice.
    const existing = this.voices.get(midi);
    if (existing) {
      existing.gain.gain.cancelScheduledValues(t);
      existing.gain.gain.setValueAtTime(existing.gain.gain.value, t);
      existing.gain.gain.linearRampToValueAtTime(velocity, t + ATTACK);
      existing.gain.gain.linearRampToValueAtTime(velocity * SUSTAIN, t + ATTACK + DECAY);
      return;
    }

    const osc1 = this.ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = freq;
    const osc2 = this.ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = freq;

    const mix = this.ctx.createGain();
    // Sine ~85%, triangle ~25%, gives a soft electric-piano feel.
    const sineG = this.ctx.createGain(); sineG.gain.value = 0.85;
    const triG  = this.ctx.createGain(); triG.gain.value  = 0.25;
    osc1.connect(sineG).connect(mix);
    osc2.connect(triG).connect(mix);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(velocity, t + ATTACK);
    gain.gain.linearRampToValueAtTime(velocity * SUSTAIN, t + ATTACK + DECAY);
    mix.connect(gain).connect(this.master);

    osc1.start(t);
    osc2.start(t);

    this.voices.set(midi, { osc1, osc2, gain });
  }

  noteOff(midi) {
    if (!this.ctx) return;
    const v = this.voices.get(midi);
    if (!v) return;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + RELEASE);
    // Stop the oscillators after the release tail; freeing them
    // immediately would cut the release short.
    v.osc1.stop(t + RELEASE + 0.05);
    v.osc2.stop(t + RELEASE + 0.05);
    this.voices.delete(midi);
  }

  /** Force-release everything — used when the user switches instrument. */
  allNotesOff() {
    for (const midi of [...this.voices.keys()]) this.noteOff(midi);
  }
}

function midiToHz(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}
