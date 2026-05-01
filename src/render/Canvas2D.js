/**
 * Tiny helper that owns one full-screen 2D canvas with DPR-aware sizing.
 *
 * Both the instrument-canvas and the debug-canvas use the same setup —
 * full-window, devicePixelRatio scaled, transparent — so we share one
 * factory instead of duplicating boilerplate in two render modules.
 */
export function createCanvas2D(canvas) {
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  function clear() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  return { canvas, ctx, resize, clear };
}
