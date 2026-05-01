# 🎹🥁 Air Piano / Drum Kit

Play a virtual piano or drum kit in the air — pinch your thumb and index finger to strike the key/pad your fingertip is hovering over. Two-handed by default. Optional Web MIDI output drives external synths and DAWs. 100 % browser, no installs, video never leaves your device.

> **Status:** MVP complete (Phases 1–7). Ship-ready.

![status](https://img.shields.io/badge/status-MVP-success) ![license](https://img.shields.io/badge/license-MIT-blue)

## How to play

1. Open the site, click **Enable Camera & Play**, grant camera access.
2. Pick **Piano** or **Drum Kit** — you can switch later from the gear menu.
3. Move your hand so the cursor (the coloured puck on your index fingertip) sits over a key or pad.
4. **Pinch** your thumb and index finger together to strike. Sustain on piano holds the note until you release the pinch; drums are momentary.
5. Pinch *fast* for a hard hit, *slow* for a soft one — strike velocity is derived from how quickly your finger and thumb close.
6. Two hands work independently — the **first detected hand is teal, the second pink**, with matching hover rings on the keys/pads.

## Web MIDI out (optional)

If your browser supports Web MIDI (Chrome / Edge), the settings panel reveals a **MIDI out** dropdown. Pick a connected device — a hardware synth, an IAC bus on macOS, `loopMIDI` on Windows, etc. — and notes will be sent there alongside the internal synth.

| Channel | Use | Notes |
|---|---|---|
| ch 1  | Piano | sends raw MIDI note numbers, velocity from pinch speed |
| ch 10 | Drums | General MIDI percussion mapping (kick 36, snare 38, hats 42/46, toms 41/47/50, crash 49) |

Safari historically required an experimental flag for Web MIDI; the dropdown silently stays hidden if access fails.

## Getting started (dev)

```bash
npm install
npm run dev
```

Open the URL Vite prints. Camera access requires **localhost or HTTPS**. Vite 5 needs **Node ≥ 18**.

## Build & deploy

```bash
npm run build        # outputs dist/
npm run preview      # serves dist/ locally
```

The `dist/` folder is a static site — deploy it anywhere.

### Option A: GitHub Pages (zero-config)

This repo includes `.github/workflows/deploy.yml`. Push to `main`, enable Pages via **Settings → Pages → Source: GitHub Actions**, and every push will publish to `https://<user>.github.io/<repo>/`. The workflow passes the repo name as `VITE_BASE` so asset URLs resolve under the subpath.

### Option B: Vercel / Netlify / Cloudflare Pages

Import the repo, set the build command to `npm run build` and the output directory to `dist`. No env vars needed — `vite.config.js` falls back to relative asset paths.

## Controls & settings

| Where | What |
|---|---|
| Gear icon (top-centre) | Open settings panel |
| Sound toggle | Mute / unmute internal synth |
| MIDI out | Pick an output device (hidden if Web MIDI unavailable) |
| Octave (piano) | ±2 octaves; clears any sustained notes on shift |
| Switch Instrument | Re-open the picker overlay |

## How it works

- **Hand tracking:** MediaPipe `HandLandmarker` (lite, GPU, VIDEO mode), 2 hands × 21 landmarks, mirrored once at the source so screen coords match the on-screen flipped video.
- **Pinch detection:** `distance(thumb-tip, index-tip) / distance(wrist, index-MCP)` — scale-invariant ratio with hysteresis (`<0.30` starts, `>0.45` ends). Wide dead-band stops jitter from machine-gunning notes.
- **Velocity:** ratio history over the last 150 ms; closing speed maps to velocity in [0.4, 1.0]. The 0.4 floor keeps slow squeezes audible.
- **Synthesis:** sine + triangle through an ADSR for piano voices; one-shot oscillator/noise + envelopes for each drum hit. No sample files — the bundle stays tiny.
- **Note locking:** the piano locks the pressed key on pinch-down. Sliding the fingertip while pinched does *not* glissando across keys — players commit to one key the moment they pinch.

## Browser requirements

- **Chrome / Edge / Safari 14+** for camera and audio.
- **Web MIDI** — Chrome / Edge only (Safari needs an experimental flag).
- Hardware-accelerated WebGL is *not* required (pure 2D canvas).
- WebAssembly (for MediaPipe's `HandLandmarker`).

## Privacy

Everything runs locally. The webcam stream is processed inside MediaPipe's WebAssembly model in your browser — no uploads, no recording, no analytics. The first run downloads the WASM + hand model (~5 MB) from Google's CDN; subsequent loads are cached.

## Architecture

```
src/
├── main.js                # entry point + top-level wiring
├── tracker/
│   ├── webcam.js          # getUserMedia
│   ├── handTracker.js     # MediaPipe HandLandmarker wrapper
│   └── pinchDetector.js   # per-hand pinch state + velocity
├── instrument/
│   ├── Piano.js           # white/black key layout, hover, octave shift
│   └── Drums.js           # 4×2 pad grid, momentary flash
├── audio/
│   ├── PianoSynth.js      # polyphonic Web Audio piano
│   └── DrumSynth.js       # synthesised kick / snare / hats / toms / crash
├── midi/
│   └── midiOut.js         # optional Web MIDI output
├── render/
│   ├── Canvas2D.js        # DPR-aware full-window canvas helper
│   └── DebugOverlay.js    # hand skeleton + fingertip cursor
└── styles.css
```

See [`docs/PLAN.md`](docs/PLAN.md) for the original phase-by-phase plan and rationale.

## Tech stack

| Concern | Library |
|---|---|
| Build tool | [Vite](https://vitejs.dev/) |
| Hand tracking | [@mediapipe/tasks-vision](https://developers.google.com/mediapipe) (`HandLandmarker`) |
| Audio | Web Audio API (no asset files) |
| MIDI out | Web MIDI API |

No backend. No analytics. No telemetry.

## Roadmap

- [x] Phase 1 — Scaffold (camera + canvas shells + picker)
- [x] Phase 2 — Hand tracking + per-hand cursors
- [x] Phase 3 — Pinch detection with hysteresis
- [x] Phase 4 — Piano mode (keys + Web Audio synth + sustain)
- [x] Phase 5 — Drum Kit mode (pads + synthesised hits)
- [x] Phase 6 — Web MIDI out + velocity from pinch speed + octave shift
- [x] Phase 7 — Ship (README + GH Pages workflow)

### Post-MVP ideas

- Sample-based piano + sample drum kit (swap behind the existing `noteOn` / `trigger` interfaces)
- Loop recording / overdub
- Custom MIDI mappings per instrument
- Two-player duet (each user gets one octave / one half of the pad grid)
- Chord assist (auto-fill triad on pinch)

## License

MIT — see [`LICENSE`](LICENSE).
