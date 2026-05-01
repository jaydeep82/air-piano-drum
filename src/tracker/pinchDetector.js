/**
 * Per-hand pinch state machine.
 *
 * "Pinch" = thumb tip (landmark 4) close to index tip (landmark 8).
 * The raw distance is useless on its own because it depends on how far
 * the hand is from the camera — a relaxed hand 30 cm away has a smaller
 * thumb-index distance than a pinched hand 60 cm away. We normalise by
 * a per-hand "scale" (wrist → index-MCP distance, landmarks 0 → 5),
 * which gives a roughly scale-invariant ratio:
 *
 *   ratio = distance(4, 8) / distance(0, 5)
 *
 * Empirically:
 *   - relaxed open hand:  ratio ≈ 0.7 – 1.0
 *   - light pinch:        ratio ≈ 0.3 – 0.5
 *   - tight pinch:        ratio ≈ 0.05 – 0.2
 *
 * Hysteresis stops single-frame jitter from machine-gunning notes:
 *   ratio < PINCH_ON  → pinch starts (only if not already pinching)
 *   ratio > PINCH_OFF → pinch ends   (only if currently pinching)
 *
 * The thresholds are wide apart on purpose — slow finger drift won't
 * accidentally cross both in a frame, and momentary measurement noise
 * inside the dead-band is ignored.
 *
 * Tracker identity: we key per-hand state on the *detection index*
 * (0 / 1) returned by MediaPipe, which can swap between frames as the
 * tracker loses and re-acquires hands. That can briefly confuse pinch
 * state (a hand entering as index 1 and assuming a slot that recently
 * fired pinchDown will be considered "still pinching"). For our use
 * case — short discrete strikes — this is harmless: a stale "pinching"
 * slot will just emit pinchUp the next frame ratio crosses PINCH_OFF.
 */

const PINCH_ON = 0.30;
const PINCH_OFF = 0.45;

export function createPinchDetector({ onPinchDown, onPinchUp } = {}) {
  // Slot 0 / 1 / ... matches detection index. Each entry tracks
  // whether that hand-slot is currently considered pinched.
  const slots = [];

  function ensureSlot(i) {
    while (slots.length <= i) {
      slots.push({ pinching: false, ratio: 1, history: [] });
    }
    return slots[i];
  }

  /**
   * Estimate strike velocity at pinch-down by looking at how fast the
   * pinch ratio collapsed in the recent history window. A snappy
   * close drops ratio fast; a deliberate squeeze drops it slowly.
   *
   * Result is mapped to [0..1] with a usable floor so even a slow
   * pinch is audible — without the floor, a contemplative player
   * would get notes that effectively don't sound.
   */
  function velocityFrom(history, current) {
    if (history.length < 2) return 0.7;
    const oldest = history[0];
    const dt = (current.t - oldest.t) / 1000;
    if (dt <= 0.001) return 0.7;
    const dr = oldest.ratio - current.ratio; // positive when closing
    const speed = dr / dt; // ratio units per second
    // Empirical mapping: a brisk pinch closes ~0.4 ratio in 0.1 s ≈ 4/s
    // and should land near 1.0; a slow squeeze ~0.4/s should land at
    // the floor.
    const v = 0.4 + speed * 0.15;
    return Math.max(0.4, Math.min(1, v));
  }

  /**
   * Feed a fresh detection. Returns an array of per-hand status
   * (`{ pinching, ratio }`) so the debug overlay can render pinch
   * intensity without re-running the math.
   */
  function update(detection, now = performance.now()) {
    const seenSlots = new Set();
    const out = [];

    detection.hands.forEach((hand, i) => {
      seenSlots.add(i);
      const slot = ensureSlot(i);
      const ratio = pinchRatio(hand);
      slot.ratio = ratio;

      // Maintain a short history window for the velocity estimate.
      // ~150 ms is long enough to capture a brisk pinch (~80 ms close)
      // without including stale samples from before the gesture
      // started.
      slot.history.push({ t: now, ratio });
      while (slot.history.length && now - slot.history[0].t > 150) {
        slot.history.shift();
      }

      if (!slot.pinching && ratio < PINCH_ON) {
        slot.pinching = true;
        const velocity = velocityFrom(slot.history, { t: now, ratio });
        onPinchDown?.(i, hand, { now, velocity });
      } else if (slot.pinching && ratio > PINCH_OFF) {
        slot.pinching = false;
        onPinchUp?.(i, hand, { now });
      }
      out.push({ pinching: slot.pinching, ratio });
    });

    // Any slot that wasn't reported this frame has effectively lost
    // its hand — fire pinchUp once so a held note doesn't dangle when
    // the user moves their hand out of frame mid-pinch.
    for (let i = 0; i < slots.length; i++) {
      if (seenSlots.has(i)) continue;
      const slot = slots[i];
      if (slot.pinching) {
        slot.pinching = false;
        onPinchUp?.(i, null, { now });
      }
    }

    return out;
  }

  function reset() {
    slots.length = 0;
  }

  return { update, reset };
}

function pinchRatio(hand) {
  const lm = hand.landmarks;
  const tip = lm[4], idx = lm[8];
  const wrist = lm[0], mcp = lm[5];
  const pinch = Math.hypot(tip.x - idx.x, tip.y - idx.y);
  const scale = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
  if (scale < 1e-3) return 1; // degenerate frame — treat as open
  return pinch / scale;
}
