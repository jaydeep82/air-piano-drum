/**
 * Debug overlay — hand skeleton + a fat fingertip cursor per hand.
 *
 * Built on top of Canvas2D's helper. The cursor is the visible
 * "where am I pointing" puck the player aims at keys/pads — Phase 3
 * will recolour it to indicate pinch state, and Phase 4/5 will use
 * its position for hover detection on the keys.
 *
 * Per-hand colour: the *first* hand the tracker reports is teal, the
 * second is pink. We deliberately don't key colour off MediaPipe's
 * handedness label — handedness can flip mid-session as hands
 * occlude each other or briefly leave frame, and a flickering cursor
 * is more confusing than a stable per-hand-index colour.
 */
import { HAND_EDGES } from "../tracker/handTracker.js";

const HAND_COLORS = ["#4ecdc4", "#f78fb3"]; // by detection index

export function createDebugOverlay({ ctx }) {
  /**
   * Map a video-pixel landmark to CSS pixels using the same
   * object-fit:cover math the browser applies to the <video>.
   */
  function videoToScreen(lm, vw, vh) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = Math.max(w / vw, h / vh);
    const offX = (w - vw * s) / 2;
    const offY = (h - vh * s) / 2;
    return { x: offX + lm.x * s, y: offY + lm.y * s };
  }

  /**
   * Draw the live hand state. `cursors` is an optional array of extra
   * info per hand provided by Phase 3 (pinch state); for now it's just
   * passed through and treated as null.
   */
  function render(detection, cursors = null) {
    if (!detection || !detection.hands.length) return;
    const { hands, width: vw, height: vh } = detection;

    hands.forEach((hand, i) => {
      const color = HAND_COLORS[i % HAND_COLORS.length];
      const points = hand.landmarks.map((lm) => videoToScreen(lm, vw, vh));

      // --- Skeleton ---------------------------------------------------
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.strokeStyle = withAlpha(color, 0.85);
      ctx.shadowBlur = 6;
      ctx.shadowColor = withAlpha(color, 0.5);
      ctx.beginPath();
      for (const [a, b] of HAND_EDGES) {
        ctx.moveTo(points[a].x, points[a].y);
        ctx.lineTo(points[b].x, points[b].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // --- Joints -----------------------------------------------------
      ctx.fillStyle = "#fff";
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- Cursor (index fingertip puck) ------------------------------
      const tip = points[8];
      const pinching = cursors?.[i]?.pinching ?? false;
      const cursorRadius = pinching ? 18 : 14;
      // Halo
      ctx.fillStyle = withAlpha(color, pinching ? 0.55 : 0.3);
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, cursorRadius + 8, 0, Math.PI * 2);
      ctx.fill();
      // Solid centre
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, cursorRadius, 0, Math.PI * 2);
      ctx.fill();
      // White rim — keeps the puck legible against bright webcam
      // backgrounds (a teal puck against a teal shirt would vanish).
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, cursorRadius, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  return { render };
}

function withAlpha(hex, a) {
  // Tiny inline hex → rgba so callers can pass design hex literals.
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
