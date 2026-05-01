# 🎹🥁 Air Piano / Drum Kit

Play a virtual piano or drum kit in the air — pinch your thumb and index finger to strike the key/pad your fingertip is hovering over. Two-handed by default. Web MIDI output planned for driving external synths and DAWs.

> **Status:** Phase 1 (scaffold) complete. See [`docs/PLAN.md`](docs/PLAN.md) for the phased build.

![status](https://img.shields.io/badge/status-WIP-yellow) ![license](https://img.shields.io/badge/license-MIT-blue)

## Getting started (dev)

```bash
npm install
npm run dev
```

Open the URL Vite prints. Camera access requires **localhost or HTTPS**.

## Tech stack

| Concern | Library |
|---|---|
| Build tool | [Vite](https://vitejs.dev/) |
| Hand tracking | [@mediapipe/tasks-vision](https://developers.google.com/mediapipe) (Phase 2) |
| Audio | Web Audio API (Phase 4–5) |
| MIDI out | Web MIDI API (Phase 6) |

## Privacy

Everything runs locally. The webcam stream is processed inside your browser tab — no uploads, no recording, no analytics.

## License

MIT — see [`LICENSE`](LICENSE).
