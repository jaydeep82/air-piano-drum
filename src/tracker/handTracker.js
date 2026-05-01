/**
 * MediaPipe `HandLandmarker` wrapper — up to two hands, 21 landmarks each.
 *
 * Returns landmarks already mirrored to match the on-screen mirrored
 * webcam (CSS `scaleX(-1)`). MediaPipe sees the un-mirrored frame, so
 * its "left hand" comes back on the right side of the display. Flipping
 * x once here means the rest of the codebase reasons in screen space
 * without that constant mental gymnastic.
 *
 * Per detected hand we expose:
 *   - `landmarks[0..20]` — { x, y } in *video pixels* (already mirrored).
 *   - `handedness` — "Left" / "Right" as MediaPipe reports it. Note this
 *     refers to the *user's* hand, which after mirroring already lines
 *     up with which side of the screen the hand appears on.
 *   - `score` — handedness confidence (0..1).
 *   - `fingertip` — convenience accessor for landmark 8 (index tip),
 *     the cursor we use for hover detection in piano/drums.
 */
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

export async function createHandTracker({ numHands = 2 } = {}) {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  function detect(videoEl, tsMs) {
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (!w || !h) return { hands: [], width: 0, height: 0 };

    const result = landmarker.detectForVideo(videoEl, tsMs);
    const handsRaw = result.landmarks ?? [];
    const handedness = result.handedness ?? [];

    const hands = handsRaw.map((lm, i) => {
      const mirrored = lm.map((p) => ({
        x: (1 - p.x) * w,
        y: p.y * h,
        z: -p.z, // mirror depth too
      }));
      // MediaPipe reports handedness as the *anatomical* hand. After
      // mirroring on screen, the left hand appears on the screen-left,
      // so the label still matches what the user sees. Score is the
      // model's confidence in that classification.
      const handInfo = handedness[i]?.[0] ?? { categoryName: "Unknown", score: 0 };
      return {
        landmarks: mirrored,
        handedness: handInfo.categoryName,
        score: handInfo.score,
        fingertip: mirrored[8], // index tip — our cursor
        thumbTip: mirrored[4],  // for Phase 3 pinch distance
      };
    });

    return { hands, width: w, height: h };
  }

  return { detect, close: () => landmarker.close() };
}

/**
 * 21-landmark hand skeleton. Drawn by DebugOverlay; also reused by
 * Phase 3's pinch indicator (the thumb–index segment is highlighted
 * when the pinch is closed).
 */
export const HAND_EDGES = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [5, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [9, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [13, 17], [17, 18], [18, 19], [19, 20],
  // Palm closure
  [0, 17],
];
