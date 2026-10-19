/**
 * Ambient falling-rain background: a fixed canvas layer sitting behind all
 * page content (z-index: -1), the same "faded animated layer" pattern used
 * by canvas-nest.js on other project pages, but drawing rain streaks instead
 * of a particle network -- a fitting backdrop for a deraining paper.
 *
 * Purely decorative: aria-hidden, pointer-events: none, and it freezes into
 * a single still frame for anyone who asked the OS for reduced motion,
 * matching how compare-slider.js and loupe-row.js already behave.
 */
(function () {
  const canvas = document.createElement("canvas");
  canvas.id = "rain-bg";
  canvas.setAttribute("aria-hidden", "true");
  document.body.insertBefore(canvas, document.body.firstChild);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  // Tuned by eye: dense and fast enough to read as a heavy downpour.
  const DENSITY = 1 / 2400; // drops per viewport px^2
  const MIN_LEN = 14;
  const MAX_LEN = 36;
  const MIN_SPEED = 260; // px/s
  const MAX_SPEED = 520; // px/s
  const ANGLE = (12 * Math.PI) / 180; // slight wind lean
  const DX = Math.sin(ANGLE);
  const DY = Math.cos(ANGLE);
  const STROKE = "#c4c8cc"; // light gray

  let width = 0;
  let height = 0;
  let drops = [];
  let frame = null;
  let last = null;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function makeDrop(settleAnywhere) {
    // depth 0 = distant/faint/slow, 1 = close/bold/fast -- ties speed, length,
    // alpha and stroke width together so the layering reads as rain falling
    // at different distances rather than uniform noise.
    const depth = Math.random();
    const len = MIN_LEN + depth * (MAX_LEN - MIN_LEN);
    return {
      x: rand(0, width),
      y: settleAnywhere ? rand(-len, height) : -len,
      len: len,
      speed: MIN_SPEED + depth * (MAX_SPEED - MIN_SPEED),
      alpha: 0.1 + depth * 0.22,
      width: 0.7 + depth * 1.1,
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.round(width * height * DENSITY);
    drops = Array.from({ length: count }, () => makeDrop(true));
  }

  function paint() {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = STROKE;
    ctx.lineCap = "round";
    for (const drop of drops) {
      ctx.globalAlpha = drop.alpha;
      ctx.lineWidth = drop.width;
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - DX * drop.len, drop.y - DY * drop.len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    if (last === null) last = now;
    // Clamp so a backgrounded/stalled tab doesn't leap the drops on return.
    const dt = Math.min(now - last, 50) / 1000;
    last = now;

    for (const drop of drops) {
      drop.x += DX * drop.speed * dt;
      drop.y += DY * drop.speed * dt;
      if (drop.y - drop.len > height || drop.x - drop.len > width) {
        Object.assign(drop, makeDrop(false));
      }
    }

    paint();
    frame = window.requestAnimationFrame(tick);
  }

  function start() {
    if (frame !== null) return;
    last = null;
    frame = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (frame === null) return;
    window.cancelAnimationFrame(frame);
    frame = null;
  }

  function sync() {
    if (reduceMotion.matches) {
      stop();
      paint(); // one still frame -- the layer still reads as rain
    } else if (document.visibilityState !== "hidden") {
      start();
    }
  }

  window.addEventListener("resize", () => {
    resize();
    sync();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stop();
    else sync();
  });

  if (typeof reduceMotion.addEventListener === "function") {
    reduceMotion.addEventListener("change", sync);
  }

  resize();
  sync();
})();
