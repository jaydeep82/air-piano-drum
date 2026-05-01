/**
 * Air Piano / Drum Kit — entry point.
 *
 * Phase 1: Scaffold (camera + canvas shells + permission gate +
 * instrument picker + settings). Hand tracking, pinch detection, the
 * piano UI, the drum UI, and Web MIDI all plug into this file in
 * later phases.
 */
import { initWebcam } from "./tracker/webcam.js";
import { createHandTracker } from "./tracker/handTracker.js";
import { createPinchDetector } from "./tracker/pinchDetector.js";
import { createCanvas2D } from "./render/Canvas2D.js";
import { createDebugOverlay } from "./render/DebugOverlay.js";

const $ = (sel) => document.querySelector(sel);

const STATE = Object.freeze({
  BOOTING: "booting",
  PICK_INSTRUMENT: "pick_instrument",
  PLAYING: "playing",
});

const INSTRUMENT = Object.freeze({
  PIANO: "piano",
  DRUMS: "drums",
});

async function boot() {
  const videoEl = $("#webcam");
  const instrumentCanvas = $("#instrument-canvas");
  const debugCanvas = $("#debug-canvas");
  const statusEl = $("#status");
  const modeValEl = $("#mode-val");
  const menuOverlay = $("#permission-overlay");
  const instrumentOverlay = $("#instrument-overlay");

  let state = STATE.BOOTING;
  let instrument = null;

  // --- Camera -----------------------------------------------------------
  statusEl.textContent = "Requesting camera…";
  try {
    await initWebcam(videoEl);
  } catch (err) {
    console.error(err);
    $(".overlay-content").innerHTML = `
      <h1>Camera Blocked</h1>
      <p>${err.message}</p>
      <p class="hint">Allow camera access in your browser settings and reload.</p>
    `;
    return;
  }
  menuOverlay.classList.add("hidden");

  // --- Canvases ---------------------------------------------------------
  const instr = createCanvas2D(instrumentCanvas);
  const debug = createCanvas2D(debugCanvas);
  const debugOverlay = createDebugOverlay({ ctx: debug.ctx });

  // Pinch detector — Phase 4/5 will replace these console logs with
  // real note-on / note-off triggers. Keeping the stubs so the HUD
  // already lights up on pinch and we can see hysteresis working.
  let pinchHudUntil = 0;
  const pinch = createPinchDetector({
    onPinchDown: (slot, hand) => {
      console.log("pinch ↓", slot, hand?.fingertip);
      pinchHudUntil = performance.now() + 500;
    },
    onPinchUp: (slot) => {
      console.log("pinch ↑", slot);
    },
  });

  // --- Hand tracker -----------------------------------------------------
  // Loaded eagerly during boot so the picker overlay covers the model
  // download (~5 MB on first visit). By the time the user picks an
  // instrument, the first detect() call won't stall on model init.
  statusEl.textContent = "Loading hand-tracking model…";
  let tracker;
  try {
    tracker = await createHandTracker({ numHands: 2 });
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Tracker error: ${err.message}`;
    return;
  }

  // --- Instrument picker ------------------------------------------------
  state = STATE.PICK_INSTRUMENT;
  instrumentOverlay.classList.remove("hidden");
  statusEl.textContent = "Pick an instrument.";

  function pick(kind) {
    instrument = kind;
    state = STATE.PLAYING;
    instrumentOverlay.classList.add("hidden");
    modeValEl.textContent = kind === INSTRUMENT.PIANO ? "🎹 Piano" : "🥁 Drums";
    statusEl.textContent =
      "Hands tracked — pinch logic + keys/pads land in Phases 3–5.";
    drawPlaceholder();
  }
  $("#pick-piano-btn").addEventListener("click", () => pick(INSTRUMENT.PIANO));
  $("#pick-drums-btn").addEventListener("click", () => pick(INSTRUMENT.DRUMS));

  // Re-open the picker mid-session — shared between the settings menu
  // and any future "stop / change instrument" affordance.
  $("#switch-instrument-btn").addEventListener("click", () => {
    $("#settings-panel").classList.add("hidden");
    instrumentOverlay.classList.remove("hidden");
    state = STATE.PICK_INSTRUMENT;
    statusEl.textContent = "Pick an instrument.";
  });

  // --- Settings panel ---------------------------------------------------
  $("#settings-toggle").addEventListener("click", () => {
    $("#settings-panel").classList.toggle("hidden");
  });

  // --- Phase 1 placeholder render --------------------------------------
  // Scribbles a label onto the instrument canvas so the user sees that
  // the layer is alive and laid out correctly. Phase 4/5 replace this
  // with real keys / pads.
  function drawPlaceholder() {
    instr.clear();
    const ctx = instr.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.save();
    ctx.fillStyle = "rgba(247, 143, 179, 0.15)";
    ctx.fillRect(40, h * 0.6, w - 80, h * 0.32);
    ctx.strokeStyle = "rgba(247, 143, 179, 0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(40, h * 0.6, w - 80, h * 0.32);
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = "600 24px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      instrument === INSTRUMENT.PIANO
        ? "Piano keys go here (Phase 4)"
        : "Drum pads go here (Phase 5)",
      w / 2,
      h * 0.76,
    );
    ctx.restore();
  }

  // --- Tracker loop -----------------------------------------------------
  // Driven off videoEl.currentTime so we skip duplicate frames the
  // camera hasn't actually delivered yet — saves CPU and matches the
  // pattern used in the other body-tracking projects in this set.
  let lastVideoTime = -1;
  function trackerLoop() {
    if (videoEl.readyState >= 2 && videoEl.currentTime !== lastVideoTime) {
      lastVideoTime = videoEl.currentTime;
      const now = performance.now();
      const detection = tracker.detect(videoEl, now);
      const pinchStates = pinch.update(detection, now);

      // Tracker draws every frame regardless of state — even on the
      // picker overlay it feels good to see the cursor latch onto your
      // hand and react to pinch. Cuts ambiguity about whether the
      // camera is really alive.
      debug.clear();
      debugOverlay.render(detection, pinchStates);

      if (state === STATE.PLAYING) {
        const n = detection.hands.length;
        if (now < pinchHudUntil) {
          statusEl.textContent = "Pinch! 🤏";
        } else {
          statusEl.textContent =
            n === 0 ? "Step into frame." :
            n === 1 ? "1 hand tracked — pinch to test." :
                      "2 hands tracked — pinch either to test.";
        }
      }
    }
    requestAnimationFrame(trackerLoop);
  }
  trackerLoop();

  // --- Resize -----------------------------------------------------------
  window.addEventListener("resize", () => {
    instr.resize();
    debug.resize();
    if (state === STATE.PLAYING) drawPlaceholder();
  });
}

$("#start-btn").addEventListener("click", boot, { once: true });
