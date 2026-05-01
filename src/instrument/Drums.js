/**
 * Drum-pad layout, hit detection, and rendering.
 *
 * Eight pads in a 4×2 grid laid across the bottom 40 % of the screen.
 * The grid order is:
 *
 *   closed-hat | open-hat | crash    | high-tom
 *   kick       | snare    | low-tom  | mid-tom
 *
 * Cymbals and hats live on the top row, body drums on the bottom —
 * mirrors how a physical kit reads from above (cymbals are the high
 * stuff way up overhead). The kick is bottom-left because that's
 * where most players reach with their dominant hand by reflex.
 *
 * Pads are momentary: pinch-down triggers the hit and starts a
 * decaying "flash" overlay; we don't track sustain or release. Each
 * pad's `hitAt` timestamp drives the flash alpha so players see
 * which pads they just struck even after their cursor has moved on.
 *
 * Hover detection mirrors Piano: per-slot `hoveredPad` updated each
 * frame; the cursor's slot colour glows around the hovered pad.
 */

import { DRUM_NAMES } from "../audio/DrumSynth.js";

const FLASH_MS = 320;

// Visual labels — short for cymbals, full for body drums.
const LABELS = {
  "closed-hat": "Hat",
  "open-hat":   "Open Hat",
  "crash":      "Crash",
  "high-tom":   "Hi Tom",
  "kick":       "Kick",
  "snare":      "Snare",
  "low-tom":    "Lo Tom",
  "mid-tom":    "Mid Tom",
};

// Per-pad accent colour. Cymbals lean amber, drums teal — cheap visual
// grouping cue without leaning on extra UI chrome.
const COLORS = {
  "closed-hat": "#ffd166",
  "open-hat":   "#ffb454",
  "crash":      "#ff8c42",
  "high-tom":   "#9bf6ff",
  "kick":       "#4ecdc4",
  "snare":      "#a0e7e5",
  "low-tom":    "#56cfe1",
  "mid-tom":    "#72ddf7",
};

export class Drums {
  constructor() {
    this.pads = [];
    this.hands = new Map(); // slot -> { hoveredPad }
    this._layout = null;
  }

  resize(width, height) {
    const cols = 4, rows = 2;
    const margin = Math.max(24, width * 0.02);
    const top = height * 0.58;
    const bottom = height - margin;
    const gridW = width - margin * 2;
    const gridH = bottom - top;
    const gap = Math.max(10, gridW * 0.012);
    const padW = (gridW - gap * (cols - 1)) / cols;
    const padH = (gridH - gap * (rows - 1)) / rows;

    this.pads = DRUM_NAMES.map((name, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        name,
        label: LABELS[name],
        color: COLORS[name],
        x: margin + col * (padW + gap),
        y: top + row * (padH + gap),
        w: padW,
        h: padH,
        hitAt: 0,
      };
    });

    this._layout = { padW, padH };
  }

  findPadAt(x, y) {
    for (const p of this.pads) {
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return p;
    }
    return null;
  }

  /** Update per-slot hover from the latest cursors. */
  update(cursors) {
    cursors.forEach((c, slot) => {
      const hand = this._handState(slot);
      hand.hoveredPad = c ? this.findPadAt(c.x, c.y) : null;
    });
  }

  /**
   * Mark a pad struck. Returns the pad name (for synth routing) or
   * null if no pad was under the cursor at strike time.
   */
  strike(slot, now = performance.now()) {
    const hand = this._handState(slot);
    const pad = hand.hoveredPad;
    if (!pad) return null;
    pad.hitAt = now;
    return pad.name;
  }

  _handState(slot) {
    let h = this.hands.get(slot);
    if (!h) { h = { hoveredPad: null }; this.hands.set(slot, h); }
    return h;
  }

  draw(ctx, slotColors, now = performance.now()) {
    if (!this._layout) return;
    const hoveredBySlot = new Map();
    for (const [slot, h] of this.hands.entries()) {
      if (h.hoveredPad) hoveredBySlot.set(h.hoveredPad.name, slot);
    }

    for (const p of this.pads) {
      const flashAge = now - p.hitAt;
      const flashAmt = Math.max(0, 1 - flashAge / FLASH_MS);
      const hoverSlot = hoveredBySlot.get(p.name);
      const hoverColor = hoverSlot != null
        ? slotColors[hoverSlot % slotColors.length]
        : null;
      drawPad(ctx, p, flashAmt, hoverColor);
    }
  }
}

function drawPad(ctx, p, flashAmt, hoverColor) {
  const r = 14;

  // Body — base gradient gets brighter while flashAmt > 0.
  const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
  if (flashAmt > 0) {
    // Flash blend: lerp from the resting colour stops up to white.
    grad.addColorStop(0, mix("#ffffff", "#1a1d24", flashAmt * 0.85));
    grad.addColorStop(1, mix(p.color, "#0f1116", flashAmt * 0.7));
  } else {
    grad.addColorStop(0, "rgba(40,44,52,0.92)");
    grad.addColorStop(1, "rgba(20,22,28,0.92)");
  }
  ctx.fillStyle = grad;
  roundRect(ctx, p.x, p.y, p.w, p.h, r);
  ctx.fill();

  // Pad accent stripe along the bottom — keeps the colour cue visible
  // even when the pad isn't flashing.
  ctx.save();
  ctx.fillStyle = withAlpha(p.color, 0.85);
  ctx.beginPath();
  ctx.rect(p.x + 12, p.y + p.h - 6, p.w - 24, 3);
  ctx.fill();
  ctx.restore();

  // Hover ring — drawn just inside the pad edge, matches cursor colour.
  if (hoverColor) {
    ctx.save();
    ctx.strokeStyle = hoverColor;
    ctx.lineWidth = 4;
    ctx.shadowBlur = 18;
    ctx.shadowColor = hoverColor;
    roundRect(ctx, p.x + 3, p.y + 3, p.w - 6, p.h - 6, r);
    ctx.stroke();
    ctx.restore();
  }

  // Border
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  roundRect(ctx, p.x, p.y, p.w, p.h, r);
  ctx.stroke();

  // Label
  ctx.fillStyle = flashAmt > 0.4
    ? "rgba(20,20,20,0.9)"
    : "rgba(255,255,255,0.92)";
  ctx.font = "700 18px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(p.label, p.x + p.w / 2, p.y + p.h / 2);
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

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function mix(hexA, hexB, t) {
  // t = 0 → A, t = 1 → B. Used to lerp the resting pad colour toward
  // a flash overlay without premultiplying alpha bookkeeping.
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar * (1 - t) + br * t);
  const g = Math.round(ag * (1 - t) + bg * t);
  const bl = Math.round(ab * (1 - t) + bb * t);
  return `rgb(${r},${g},${bl})`;
}
