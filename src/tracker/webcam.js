/**
 * Camera bring-up.
 *
 * `getUserMedia` requires a secure context (https or localhost). We ask
 * for a 720p front-facing stream and resolve once the video element has
 * loaded enough metadata to expose `videoWidth` / `videoHeight` — the
 * hand tracker reads those dimensions on first detect.
 */
export async function initWebcam(videoEl) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API not available in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
    audio: false,
  });
  videoEl.srcObject = stream;
  await new Promise((resolve) => {
    if (videoEl.readyState >= 2) return resolve();
    videoEl.onloadedmetadata = () => resolve();
  });
  await videoEl.play().catch(() => {});
  return stream;
}
