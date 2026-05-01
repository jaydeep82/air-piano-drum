/**
 * Web MIDI output — optional, gracefully degrades.
 *
 * `init()` requests MIDI access (a real prompt the user can deny);
 * everything keeps working with internal Web Audio synthesis even if
 * MIDI is denied or unsupported. The settings UI shows a select with
 * available outputs plus an "Off" option.
 *
 * Channel layout follows GM convention so the rig can drive a stock
 * synth or DAW without remapping:
 *   - Piano notes go out on channel 0 (MIDI ch 1).
 *   - Drum hits go out on channel 9 (MIDI ch 10), using the GM
 *     percussion note numbers below.
 *
 * Note On / Note Off use status bytes 0x9n / 0x8n where n is the
 * channel. Velocity is mapped from 0..1 → 1..127; we floor at 1
 * because GM treats velocity 0 as Note Off, which would silently
 * discard the strike.
 */

// General MIDI percussion key numbers — channel 10 (index 9).
const GM_DRUM = {
  "kick": 36,        // Bass Drum 1
  "snare": 38,       // Acoustic Snare
  "closed-hat": 42,  // Closed Hi-Hat
  "open-hat": 46,    // Open Hi-Hat
  "low-tom": 41,     // Low Floor Tom
  "mid-tom": 47,     // Low-Mid Tom
  "high-tom": 50,    // High Tom
  "crash": 49,       // Crash Cymbal 1
};

const PIANO_CH = 0;
const DRUM_CH = 9;

export class MidiOut {
  constructor() {
    this.access = null;
    this.outputs = []; // [{ id, name }]
    this.activeId = null; // null = "off"
    this.onChange = () => {};
  }

  /**
   * Try to get MIDI access. Resolves to `true` on success, `false` if
   * the API isn't available or permission was denied — the caller
   * uses that to decide whether to show the output dropdown at all.
   */
  async init() {
    if (!navigator.requestMIDIAccess) return false;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      return false;
    }
    this._refresh();
    // Re-list outputs whenever a device is plugged in or unplugged.
    this.access.onstatechange = () => this._refresh();
    return true;
  }

  _refresh() {
    const list = [];
    this.access.outputs.forEach((o) => list.push({ id: o.id, name: o.name }));
    this.outputs = list;
    // If our active output disappeared, fall back to "off".
    if (this.activeId && !list.find((o) => o.id === this.activeId)) {
      this.activeId = null;
    }
    this.onChange(list);
  }

  /** Select an output by id, or pass `null` to disable MIDI out. */
  setOutput(id) {
    this.activeId = id || null;
  }

  _send(bytes) {
    if (!this.activeId || !this.access) return;
    const out = this.access.outputs.get(this.activeId);
    if (!out) return;
    out.send(bytes);
  }

  pianoNoteOn(midi, velocity = 0.85) {
    this._send([0x90 | PIANO_CH, midi & 0x7f, vel127(velocity)]);
  }

  pianoNoteOff(midi) {
    // Velocity 0 on Note Off is conventional and works on every synth.
    this._send([0x80 | PIANO_CH, midi & 0x7f, 0]);
  }

  /**
   * Drums fire a Note On then a Note Off ~30 ms later. GM percussion
   * voices are one-shot inside the receiving synth, but most DAWs
   * still expect the matching Note Off to keep the channel clean.
   */
  drumHit(name, velocity = 0.9) {
    const note = GM_DRUM[name];
    if (note == null) return;
    const v = vel127(velocity);
    this._send([0x90 | DRUM_CH, note, v]);
    setTimeout(() => this._send([0x80 | DRUM_CH, note, 0]), 30);
  }
}

function vel127(v) {
  // Clamp + scale 0..1 → 1..127. We floor at 1, not 0, because GM
  // treats velocity 0 on a Note On as a silent Note Off — which would
  // make a soft strike eat the note instead of playing it quietly.
  const clamped = Math.max(0, Math.min(1, v));
  return Math.max(1, Math.round(clamped * 127));
}
