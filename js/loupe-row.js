/**
 * Synced magnifier for a row of side-by-side result images.
 *
 * Hovering anywhere over any tile in a .zoom-row puts a lens on *every* tile
 * in that row, all at the same normalised point. That is the comparison a
 * four-way figure (Input / GT / CSUD / Ours) is actually for: the reader picks
 * one streak and sees what each method did to it, instead of eyeballing four
 * thumbnails and trying to hold a crop in memory.
 *
 * Zoom is otherwise an invisible feature -- nothing in a still row of images
 * announces it -- so a row marked data-zoom-auto="true" demonstrates itself:
 * its lenses drift along a slow path with a ghost cursor drawn on the FIRST
 * tile only. That is meant for a dedicated one-tile demo row, not for a row of
 * results: four result images twitching on their own is a distraction, and the
 * hint only has to be given once. The tour pauses while a real pointer is in
 * the row, while the row is off-screen, while the tab is hidden, and under
 * prefers-reduced-motion.
 *
 * Deliberately a separate file from compare-slider.js: these are plain images,
 * not sliders, and the slider's own loupe must not be disturbed by them.
 *
 * Markup:
 *   <div class="zoom-row">
 *     <figure class="zoom-item">
 *       <div class="zoom-tile"><img src="..." alt="..."></div>
 *       <figcaption>Input</figcaption>
 *     </figure>
 *     ...
 *   </div>
 *
 * Optional tuning attributes on the .zoom-row element:
 *   data-zoom="false"          disable the lens for this row entirely
 *   data-zoom-size="112"       lens diameter, in px
 *   data-zoom-factor="2.5"     magnification
 *   data-zoom-auto="true"      self-demonstrate: drift the lens with a ghost
 *                              cursor until a real pointer arrives (off by
 *                              default -- meant for a one-tile demo row)
 *   data-zoom-path="figure8"   "figure8" (default) or "sweep"
 *   data-zoom-duration="9000"  one full loop of the path, in ms
 *   data-zoom-spread="0.30"    how far the path reaches horizontally, 0..0.5
 *   data-zoom-rise="0.20"      ...and vertically
 */
(function () {
  const DEFAULTS = { size: 112, zoom: 2.5 };
  const AUTO_DEFAULTS = { duration: 9000, spread: 0.3, rise: 0.2, path: "figure8" };
  const RESUME_DELAY = 320;

  /**
   * Paths take progress 0..1 and return a normalised point.
   *
   * figure8 reads as someone scanning the image rather than as a machine
   * sliding a box: it is closed (no seam when it loops), it covers area in
   * both axes, and it never reaches the tile edges where a lens is half
   * clipped and says nothing.
   *
   * sweep is the plainer alternative — straight across the middle, eased at
   * the turns — for when the drift should not draw the eye at all.
   */
  const PATHS = {
    figure8: (p, spread, rise) => {
      const t = p * Math.PI * 2;
      return { u: 0.5 + spread * Math.sin(t), v: 0.5 + rise * Math.sin(2 * t) };
    },
    sweep: (p, spread) => {
      const tri = 1 - Math.abs(p * 2 - 1);
      const eased = tri * tri * (3 - 2 * tri);
      return { u: 0.5 + spread * (eased * 2 - 1), v: 0.5 };
    },
  };

  function num(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * Build the lens for one tile. Returns a place(u, v) taking a normalised
   * point, so every tile in the row is driven from one pair of numbers and
   * they cannot drift apart even if a tile is sized differently.
   */
  function makeLens(tile, size, zoom) {
    const img = tile.querySelector("img");
    if (!img) return null;

    const radius = size / 2;
    const lens = document.createElement("div");
    lens.className = "zoom-tile__lens";
    lens.setAttribute("aria-hidden", "true"); // a pointing aid, not content
    lens.style.width = size + "px";
    lens.style.height = size + "px";
    lens.style.backgroundImage = 'url("' + img.src + '")';
    tile.appendChild(lens);

    return function place(u, v) {
      const rect = tile.getBoundingClientRect();
      const x = u * rect.width;
      const y = v * rect.height;

      // Where the image actually lands inside the tile. The <img> is
      // object-fit:cover, so if a pair is ever not square the lens has to crop
      // the same way the image does or it magnifies the wrong pixel — in a
      // scientific figure that is a silent lie, not a cosmetic bug.
      const nw = img.naturalWidth || 0;
      const nh = img.naturalHeight || 0;
      let w = rect.width;
      let h = rect.height;
      let ox = 0;
      let oy = 0;
      if (nw && nh) {
        const scale = Math.max(rect.width / nw, rect.height / nh);
        w = nw * scale;
        h = nh * scale;
        ox = (rect.width - w) / 2;
        oy = (rect.height - h) / 2;
      }

      lens.style.left = x - radius + "px";
      lens.style.top = y - radius + "px";
      lens.style.backgroundSize = w * zoom + "px " + h * zoom + "px";
      // Magnify about the sampled point: it lands on the lens centre.
      lens.style.backgroundPosition =
        radius - (x - ox) * zoom + "px " + (radius - (y - oy) * zoom) + "px";
    };
  }

  /**
   * The ghost cursor, drawn on one tile only. A real reader has one mouse, so
   * four of these would say the opposite of what the row does; one arrow next
   * to four moving lenses says "this pointer drives all of them".
   */
  function makeGhost(tile) {
    if (typeof tile.appendChild !== "function") return null;
    const ghost = document.createElement("div");
    ghost.className = "zoom-ghost";
    ghost.setAttribute("aria-hidden", "true");
    tile.appendChild(ghost);
    return function place(u, v) {
      const rect = tile.getBoundingClientRect();
      // The arrow's clip-path puts its tip at (0, 0), so no hotspot offset.
      ghost.style.left = u * rect.width + "px";
      ghost.style.top = v * rect.height + "px";
    };
  }

  /**
   * The self-demonstrating drift. Same discipline as the slider's auto sweep:
   * a hold is a reason to stop, and every frame re-checks before doing
   * anything, because a hold can land between a frame being queued and it
   * running. Returns {hold, release} or null when it must not run at all.
   */
  function initAutoTour(row, drive) {
    if (row.dataset.zoomAuto !== "true") return null;
    if (typeof window.requestAnimationFrame !== "function") return null;
    if (typeof window.matchMedia !== "function") return null;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const duration = num(row.dataset.zoomDuration, AUTO_DEFAULTS.duration);
    const spread = num(row.dataset.zoomSpread, AUTO_DEFAULTS.spread);
    const rise = num(row.dataset.zoomRise, AUTO_DEFAULTS.rise);
    const path = PATHS[row.dataset.zoomPath] || PATHS[AUTO_DEFAULTS.path];

    const holds = new Set();
    let frame = null;
    let elapsed = 0;
    let last = null;

    const shouldRun = () => holds.size === 0 && !reduceMotion.matches;

    const tick = (now) => {
      if (!shouldRun()) {
        frame = null;
        last = null;
        return;
      }
      if (last !== null) elapsed = (elapsed + (now - last)) % duration;
      last = now;
      const point = path(elapsed / duration, spread, rise);
      drive(point.u, point.v);
      frame = window.requestAnimationFrame(tick);
    };

    const refresh = () => {
      if (shouldRun() && frame === null) {
        frame = window.requestAnimationFrame(tick);
      } else if (!shouldRun() && frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
        last = null;
      }
    };

    const hold = (reason) => {
      holds.add(reason);
      refresh();
    };
    const release = (reason) => {
      holds.delete(reason);
      refresh();
    };

    if (typeof reduceMotion.addEventListener === "function") {
      reduceMotion.addEventListener("change", refresh);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hold("tab");
      else release("tab");
    });
    if (typeof IntersectionObserver === "function") {
      new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) release("offscreen");
          else hold("offscreen");
        },
        { threshold: 0.2 }
      ).observe(row);
    }

    refresh();
    return { hold: hold, release: release };
  }

  function initRow(row) {
    if (row.dataset.zoom === "false") return;
    // Same gate as the slider loupe: on touch the finger covers the lens, and
    // there is no hover state to leave, so the row would stay stuck zoomed.
    if (typeof document.createElement !== "function") return;
    if (typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const tiles = Array.prototype.slice.call(row.querySelectorAll(".zoom-tile"));
    if (tiles.length === 0) return;

    const size = num(row.dataset.zoomSize, DEFAULTS.size);
    const zoom = num(row.dataset.zoomFactor, DEFAULTS.zoom);

    const lenses = [];
    tiles.forEach((tile) => {
      if (typeof tile.appendChild !== "function") return;
      const place = makeLens(tile, size, zoom);
      if (place) lenses.push(place);
    });
    if (lenses.length === 0) return;

    // Assigned below, once it is known whether anything will drive it. Safe to
    // close over first: drive() only ever runs from a rAF callback, never
    // during initAutoTour's synchronous setup.
    let ghost = null;

    const render = (u, v) => {
      lenses.forEach((place) => place(u, v));
      if (ghost) ghost(u, v);
      row.classList.add("is-zooming");
    };

    const auto = initAutoTour(row, (u, v) => {
      render(u, v);
      row.classList.add("is-auto"); // reveals the ghost cursor
    });

    // No tour, no ghost: a results row must not carry an invisible arrow it
    // will never show.
    if (auto) ghost = makeGhost(tiles[0]);

    let resumeTimer = null;
    const clearResume = () => {
      if (resumeTimer !== null && typeof window.clearTimeout === "function") {
        window.clearTimeout(resumeTimer);
      }
      resumeTimer = null;
    };

    const takeOver = (tile, clientX, clientY) => {
      const rect = tile.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const u = (clientX - rect.left) / rect.width;
      const v = (clientY - rect.top) / rect.height;
      if (u < 0 || v < 0 || u > 1 || v > 1) return;
      clearResume();
      if (auto) auto.hold("pointer");
      // Two cursors on screen is worse than none.
      row.classList.remove("is-auto");
      render(u, v);
    };

    tiles.forEach((tile) => {
      const track = (e) => {
        if (e.pointerType === "touch") return;
        takeOver(tile, e.clientX, e.clientY);
      };
      tile.addEventListener("pointerenter", track);
      tile.addEventListener("pointermove", track);
    });

    // Leaving is watched on the row, not per tile: crossing the gap from one
    // tile to the next would otherwise fire leave-then-enter and flicker all
    // four lenses. Over the gap the row simply holds the last point.
    row.addEventListener("pointerleave", () => {
      row.classList.remove("is-zooming");
      row.classList.remove("is-auto");
      if (!auto) return;
      // Hand back only once the lenses have faded. The tour is nowhere near
      // where the reader left the pointer, and teleporting four circles across
      // the row reads as a glitch rather than as a resumption.
      if (typeof window.setTimeout !== "function") {
        auto.release("pointer");
        return;
      }
      clearResume();
      resumeTimer = window.setTimeout(() => {
        resumeTimer = null;
        auto.release("pointer");
      }, RESUME_DELAY);
    });
  }

  function init() {
    document.querySelectorAll(".zoom-row").forEach(initRow);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
