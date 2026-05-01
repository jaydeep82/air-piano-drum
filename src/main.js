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
import { Piano } from "./instrument/Piano.js";
import { PianoSynth } from "./audio/PianoSynth.js";
import { Drums } from "./instrument/Drums.js";
import { DrumSynth } from "./audio/DrumSynth.js";

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

  // --- Instruments ------------------------------------------------------
  const piano = new Piano();
  piano.resize(window.innerWidth, window.innerHeight);
  const pianoSynth = new PianoSynth();
  const drums = new Drums();
  drums.resize(window.innerWidth, window.innerHeight);
  const drumSynth = new DrumSynth();

  // Pinch → instrument router. We look up the *current* hover key at
  // pinch-down time and lock it in for that slot until pinch-up.
  // Locking matters because the tracker keeps reporting cursor
  // movement while the user is pinched; if we re-evaluated each
  // frame, dragging the fingertip would walk the note up the
  // keyboard like a glissando, which is rarely what the player
  // intended (and isn't expressive enough to be worth the surprise).
  const SLOT_COLORS = ["#4ecdc4", "#f78fb3"];
  const pinch = createPinchDetector({
    onPinchDown: (slot, hand) => {
      pianoSynth.resume();
      drumSynth.resume();
      if (instrument === INSTRUMENT.PIANO) {
        const hovered = piano.hands.get(slot)?.hoveredKey;
        if (!hovered) return;
        piano.pressKey(slot, hovered);
        pianoSynth.noteOn(hovered.midi);
      } else if (instrument === INSTRUMENT.DRUMS) {
        // Drums are one-shots: pinch-down strikes, pinch-up does
        // nothing. No need to remember which pad fired — the synth
        // and the on-pad flash both decay on their own.
        const padName = drums.strike(slot);
        if (padName) drumSynth.trigger(padName);
      }
    },
    onPinchUp: (slot) => {
      if (instrument === INSTRUMENT.PIANO) {
        const released = piano.releaseKey(slot);
        if (released) pianoSynth.noteOff(released.midi);
      }
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
      kind === INSTRUMENT.PIANO
        ? "Pinch over a key to play."
        : "Pinch over a pad to hit it.";
    // Resume both audio contexts — the picker click is a user
    // gesture, so this primes whichever browser demands one before
    // any context creation.
    pianoSynth.resume();
    drumSynth.resume();
    // Force-clear any sustained piano notes whenever we leave or
    // re-enter the piano. Drums are one-shots so don't need this.
    pianoSynth.allNotesOff();
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
  $("#sound-toggle").addEventListener("change", (e) => {
    const muted = !e.target.checked;
    pianoSynth.setMuted(muted);
    drumSynth.setMuted(muted);
  });

  /**
   * Map a video-pixel landmark to CSS pixels using the same
   * object-fit:cover math the browser applies to the <video> element.
   * Same routine the debug overlay uses internally — kept here so
   * Piano can reason in viewport coords without importing render code.
   */
  function videoToScreen(lm, vw, vh) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = Math.max(w / vw, h / vh);
    const offX = (w - vw * s) / 2;
    const offY = (h - vh * s) / 2;
    return { x: offX + lm.x * s, y: offY + lm.y * s };
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

      // Project fingertips into CSS pixel space — keys live in
      // viewport coordinates, so we need the cursor in matching
      // units before hover detection.
      const screenCursors = detection.hands.map((hand) =>
        videoToScreen(hand.fingertip, detection.width, detection.height),
      );

      // Hover update first so onPinchDown can read the latest hover.
      if (state === STATE.PLAYING) {
        if (instrument === INSTRUMENT.PIANO) piano.update(screenCursors);
        else if (instrument === INSTRUMENT.DRUMS) drums.update(screenCursors);
      }

      const pinchStates = pinch.update(detection, now);

      // --- Render -----------------------------------------------------
      instr.clear();
      if (state === STATE.PLAYING) {
        if (instrument === INSTRUMENT.PIANO) {
          piano.draw(instr.ctx, SLOT_COLORS);
        } else if (instrument === INSTRUMENT.DRUMS) {
          drums.draw(instr.ctx, SLOT_COLORS, now);
        }
      }

      debug.clear();
      debugOverlay.render(detection, pinchStates);

      if (state === STATE.PLAYING) {
        const n = detection.hands.length;
        statusEl.textContent =
          n === 0 ? "Step into frame." :
          n === 1 ? "1 hand tracked — pinch over a key." :
                    "2 hands tracked — play with both.";
      }
    }
    requestAnimationFrame(trackerLoop);
  }
  trackerLoop();

  // --- Resize -----------------------------------------------------------
  window.addEventListener("resize", () => {
    instr.resize();
    debug.resize();
    piano.resize(window.innerWidth, window.innerHeight);
    drums.resize(window.innerWidth, window.innerHeight);
  });
}

$("#start-btn").addEventListener("click", boot, { once: true });
