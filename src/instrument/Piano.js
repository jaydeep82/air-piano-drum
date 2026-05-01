/**
 * Piano keyboard layout, hover detection, and rendering.
 *
 * Layout: 14 white keys (two octaves of C-D-E-F-G-A-B), with 10 black
 * keys overlaid on top. The keyboard fills the bottom 32% of the
 * screen, leaving the upper viewport free for the webcam image and
 * any future combo / score HUD.
 *
 * Note numbering starts at MIDI 48 (C3) so the visible octaves are
 * C3 → B4 — comfortable middle-of-the-piano range with no extreme
 * highs that fight Web Audio's softer sine timbre.
 *
 * Hit testing: the cursor (index fingertip) is tested against the
 * black keys first because they're stacked on top and visually obscure
 * the upper part of the white keys beneath them. Only if no black key
 * matches do we fall back to white-key hit testing.
 *
 * Per-slot state (one entry per tracked hand) lives on the `hands`
 * map. We carry both `hoveredKey` (for the always-on hover glow) and
 * `pressedKey` (the key locked in by pinch-down). Locking the pressed
 * key on pinch-down means moving the fingertip while pinched can't
 * accidentally jump to a neighbouring note — the player committed to
 * that key when they pinched.
 */

const FIRST_MIDI = 48; // C3
const OCTAVES = 2;

// White-key MIDI offsets within an octave. Black keys are derived
// from the gaps between these.
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
// Indices into the *white-key array* between which each black key sits.
// e.g. C# sits between white keys 0 (C) and 1 (D); F# between 3 (F)
// and 4 (G); A# between 5 (A) and 6 (B).
const BLACK_BETWEEN = [
  { afterWhiteIdx: 0, offset: 1 },  // C#
  { afterWhiteIdx: 1, offset: 3 },  // D#
  { afterWhiteIdx: 3, offset: 6 },  // F#
  { afterWhiteIdx: 4, offset: 8 },  // G#
  { afterWhiteIdx: 5, offset: 10 }, // A#
];

const WHITE_NAMES = ["C", "D", "E", "F", "G", "A", "B"];

export class Piano {
  constructor() {
    this.keys = []; // flat list of all keys (white + black), z-ordered for draw
    this.hands = new Map(); // detection-slot -> { hoveredKey, pressedKey }
    // Cached layout dimensions so resize-driven recompute is one call.
    this._layout = null;
    // Octave shift in semitones — settings panel writes ±12, ±24.
    // Keys keep their on-screen positions; only the MIDI numbers and
    // labels change. Easier UX than a scrolling keyboard, and good
    // enough for two-octave reach.
    this.octaveShift = 0;
  }

  setOctaveShift(semitones) {
    this.octaveShift = semitones;
    if (this._layout) this.resize(this._layout.width, this._layout.height);
  }

  resize(width, height) {
    const totalWhites = WHITE_OFFSETS.length * OCTAVES;
    const margin = Math.max(24, width * 0.02);
    const top = height * 0.62;
    const bottom = height - margin;
    const keyboardW = width - margin * 2;
    const whiteW = keyboardW / totalWhites;
    const whiteH = bottom - top;
    const blackW = whiteW * 0.62;
    const blackH = whiteH * 0.62;

    this.keys = [];
    const baseMidi = FIRST_MIDI + this.octaveShift;
    // White keys first so they sit underneath when we draw in array order.
    for (let oct = 0; oct < OCTAVES; oct++) {
      for (let i = 0; i < WHITE_OFFSETS.length; i++) {
        const whiteIdx = oct * WHITE_OFFSETS.length + i;
        const x = margin + whiteIdx * whiteW;
        const midi = baseMidi + oct * 12 + WHITE_OFFSETS[i];
        this.keys.push({
          kind: "white",
          midi,
          name: midiName(midi),
          x, y: top, w: whiteW, h: whiteH,
        });
      }
    }
    // Black keys on top.
    for (let oct = 0; oct < OCTAVES; oct++) {
      for (const b of BLACK_BETWEEN) {
        const whiteIdx = oct * WHITE_OFFSETS.length + b.afterWhiteIdx;
        const xCentre = margin + (whiteIdx + 1) * whiteW;
        this.keys.push({
          kind: "black",
          midi: baseMidi + oct * 12 + b.offset,
          name: null,
          x: xCentre - blackW / 2,
          y: top,
          w: blackW,
          h: blackH,
        });
      }
    }

    this._layout = {
      top, bottom, keyboardW, whiteW, whiteH, blackW, blackH,
      width, height,
    };
  }

  /** Return the key under (x, y), or null. Black keys win on overlap. */
  findKeyAt(x, y) {
    // Iterate black keys first (they're appended last, so loop reverse).
    for (let i = this.keys.length - 1; i >= 0; i--) {
      const k = this.keys[i];
      if (k.kind !== "black") break; // whites are stored before blacks
      if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return k;
    }
    for (const k of this.keys) {
      if (k.kind !== "white") continue;
      if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) return k;
    }
    return null;
  }

  /**
   * Update per-slot hover from the latest cursors. `cursors` is an
   * array (one entry per tracked hand) of `{ x, y, pinching }`.
   * Returns the same data with `hoveredKey` filled in so the caller
   * can route pinch-down to the right note.
   */
  update(cursors) {
    const out = [];
    cursors.forEach((c, slot) => {
      const hand = this._handState(slot);
      hand.hoveredKey = c ? this.findKeyAt(c.x, c.y) : null;
      out.push({
        slot,
        cursor: c,
        hoveredKey: hand.hoveredKey,
        pressedKey: hand.pressedKey,
      });
    });
    return out;
  }

  pressKey(slot, key) {
    const hand = this._handState(slot);
    hand.pressedKey = key;
  }

  releaseKey(slot) {
    const hand = this._handState(slot);
    const key = hand.pressedKey;
    hand.pressedKey = null;
    return key;
  }

  /** Set of MIDI notes currently held by any hand. */
  pressedMidis() {
    const s = new Set();
    for (const h of this.hands.values()) {
      if (h.pressedKey) s.add(h.pressedKey.midi);
    }
    return s;
  }

  _handState(slot) {
    let h = this.hands.get(slot);
    if (!h) {
      h = { hoveredKey: null, pressedKey: null };
      this.hands.set(slot, h);
    }
    return h;
  }

  /**
   * Render the keyboard. `cursors` is the same array passed to update;
   * we use it to decide hover-glow per slot. Per-slot colour is passed
   * in via `slotColors` so the keyboard hover ring matches the cursor.
   */
  draw(ctx, slotColors) {
    if (!this._layout) return;
    const pressedMidis = this.pressedMidis();
    const hoveredMidisBySlot = new Map();
    for (const [slot, h] of this.hands.entries()) {
      if (h.hoveredKey) hoveredMidisBySlot.set(h.hoveredKey.midi, slot);
    }

    // Whites first, then blacks on top.
    for (const k of this.keys) {
      const pressed = pressedMidis.has(k.midi);
      const hoverSlot = hoveredMidisBySlot.get(k.midi);
      const hoverColor = hoverSlot != null ? slotColors[hoverSlot % slotColors.length] : null;
      drawKey(ctx, k, { pressed, hoverColor });
    }
  }
}

function drawKey(ctx, k, { pressed, hoverColor }) {
  const r = 6;

  // Body fill
  if (k.kind === "white") {
    const grad = ctx.createLinearGradient(0, k.y, 0, k.y + k.h);
    if (pressed) {
      grad.addColorStop(0, "#ffe7f3");
      grad.addColorStop(1, "#f78fb3");
    } else {
      grad.addColorStop(0, "rgba(255,255,255,0.96)");
      grad.addColorStop(1, "rgba(220,220,220,0.92)");
    }
    ctx.fillStyle = grad;
  } else {
    // Black key
    const grad = ctx.createLinearGradient(0, k.y, 0, k.y + k.h);
    if (pressed) {
      grad.addColorStop(0, "#f78fb3");
      grad.addColorStop(1, "#7a3a55");
    } else {
      grad.addColorStop(0, "#2a2d34");
      grad.addColorStop(1, "#0e1014");
    }
    ctx.fillStyle = grad;
  }

  roundRect(ctx, k.x, k.y, k.w, k.h, r);
  ctx.fill();

  // Hover glow ring — drawn just inside the key edge so it reads as a
  // halo, regardless of black/white key.
  if (hoverColor) {
    ctx.save();
    ctx.strokeStyle = hoverColor;
    ctx.lineWidth = 4;
    ctx.shadowBlur = 14;
    ctx.shadowColor = hoverColor;
    roundRect(ctx, k.x + 2, k.y + 2, k.w - 4, k.h - 4, r);
    ctx.stroke();
    ctx.restore();
  }

  // Subtle border for readability.
  ctx.strokeStyle = k.kind === "white" ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1;
  roundRect(ctx, k.x, k.y, k.w, k.h, r);
  ctx.stroke();

  // Label C-octave white keys so users orient quickly.
  if (k.kind === "white" && k.name?.startsWith("C")) {
    ctx.fillStyle = "rgba(60,60,60,0.7)";
    ctx.font = "600 12px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(k.name, k.x + k.w / 2, k.y + k.h - 8);
  }
}

function midiName(midi) {
  // White-key letters only — we just need stable C-octave labels for
  // orientation. (The label drawer filters to startsWith("C").)
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return `${NAMES[midi % 12]}${octave}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
