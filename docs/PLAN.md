# Air Piano / Drum Kit — Implementation Plan

A browser-based instrument played with hand gestures. Your thumb–index
**pinch** acts as the strike; whichever virtual key/pad your fingertip is
hovering over fires. Two instruments share the same gesture engine: a
**Piano** (rolling keyboard with white/black keys) and a **Drum Kit**
(grid of pads). Web MIDI output is wired up so the rig can drive an
external synth or DAW for free.

## Core gameplay loop

1. User picks an instrument on launch — Piano or Drum Kit.
2. T-pose-style "hands up" calibration captures a baseline pinch
   distance (so users with different hand sizes get the same response).
3. Each frame the tracker reports up to two hands (21 landmarks each).
   For each hand:
   - Compute the thumb (4) ↔ index-tip (8) distance, normalised by the
     baseline.
   - Apply hysteresis: cross **PINCH_ON** to start a strike, **PINCH_OFF**
     to release. Stops single-frame jitter from machine-gunning notes.
   - Identify which on-screen key/pad the index fingertip is over.
4. On pinch-down → fire the note (Web Audio synth + optional MIDI Note
   On). On pinch-up → MIDI Note Off (piano sustains until release).
5. Visual feedback: key glows under the cursor; ripple on strike;
   per-hand cursor colour so two-handed play is legible.

## Tech stack

- **Vite** — same vanilla template as the prior projects.
- **three.js** — *optional*, used only if we want a 3D camera-tilt on the
  keyboard later. Phase 1–6 are 2D HUD canvases over the mirrored
  webcam, which is plenty.
- **@mediapipe/tasks-vision** — `HandLandmarker` (2 hands).
- **Web Audio API** — synthesised piano (sine + soft attack envelope) and
  drum kit (filtered noise + pitched body for kick/tom).
- **Web MIDI API** — optional output. Bonus feature, gated behind a
  settings checkbox so the app still runs in browsers without it
  (Safari historically lacked Web MIDI without a flag).

## Phase plan

### Phase 1 — Scaffold *(starting point)*
Vite project; permission gate; mirrored webcam; transparent canvas above;
HUD with status; settings gear (centred at top, matching the house style
across the other camera-game projects). Mode-pick overlay shell — the
two buttons exist but route nowhere yet.

### Phase 2 — Hand tracking
Wrap `HandLandmarker` (2 hands, GPU/VIDEO mode). Draw the skeleton + a
fat coloured dot on each index fingertip on the debug canvas. Two-hand
play means each hand needs its own colour — left = teal, right = pink.

### Phase 3 — Pinch detection
Per-hand pinch state machine with hysteresis. A short calibration step
asks both hands to pinch open and closed once so we set a baseline pinch
distance. State transitions emit `pinchDown(handIdx, fingertip)` and
`pinchUp(handIdx)` events.

### Phase 4 — Piano mode
White-key strip across the bottom of the screen with black keys on top,
two octaves visible by default, scrollable horizontally with shoulder
position (lean left/right to scroll). Web Audio synth: sine + triangle
mix, ADSR envelope, polyphonic. Cursor sticks to whichever key the
fingertip is over; pinch fires; sustain until pinch-up.

### Phase 5 — Drum Kit mode
4×2 pad grid (kick, snare, closed-hat, open-hat, low-tom, mid-tom,
high-tom, crash). Pads are momentary — pinch-down triggers the sample
once, no sustain. Each pad has its own synthesised hit:
- Kick: pitched sine drop + body click.
- Snare: noise burst + tuned sine body.
- Hats: high-passed noise, short or long depending on closed/open.
- Toms: pitched sine drops at three frequencies.
- Crash: long noise washed through a band-pass with slow decay.

Mode-pick overlay routes each button to one of these.

### Phase 6 — Polish + Web MIDI
- Web MIDI output: detect available outputs, list them in settings,
  send Note On / Note Off / Velocity (mapped from pinch speed).
- Octave shift buttons in settings (piano).
- Per-hand colour key + small pinch-strength indicator.
- Sustain pedal alternative: hold-down with the off-hand pinches all
  notes (piano only).

### Phase 7 — Ship
- `vite.config.js` with `VITE_BASE` fallback to `./`.
- README with how-to-play, MIDI setup notes, privacy.
- `.github/workflows/deploy.yml` for GitHub Pages.

## Out of scope (post-MVP)

- Sample-based piano (realistic tone) — would balloon the bundle.
- Recording / loop-back.
- Multi-user duet.
- DAW integration beyond raw MIDI out.
