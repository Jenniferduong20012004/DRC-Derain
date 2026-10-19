/**
 * Draggable before/after image comparison slider.
 * Left side of handle = derained (clean), right side = rainy input.
 *
 * Add data-auto="true" to a .compare element to make it sweep back and
 * forth on its own (a "GIF-like" auto slider). It pauses while the pointer
 * is over it, while the user drags or keyboards it, while it is scrolled
 * out of view, and when the OS asks for reduced motion.
 *
 * Optional tuning attributes on the .compare element:
 *   data-auto-duration="4200"  one full left->right->left sweep, in ms
 *   data-auto-min="8"          leftmost position of the sweep, in %
 *   data-auto-max="92"         rightmost position of the sweep, in %
 *   data-auto-hint="true"      styling hook only (see css/style.css): draws a
 *                              "Drag to compare" pill over the slider. The
 *                              sweep itself is unchanged -- it keeps running.
 *   data-auto-group="cmp"      keep every slider in this group in lockstep:
 *                              they share one clock and pause/resume together,
 *                              so a head-to-head comparison is always read at
 *                              the same handle position.
 *
 * Every slider also gets a hover magnifier ("loupe"). Opt one out with
 * data-loupe="false", or tune it with:
 *   data-loupe-size="112"      lens diameter, in px
 *   data-loupe-zoom="2.5"      magnification
 */
(function () {
  const AUTO_DEFAULTS = { duration: 4200, min: 8, max: 92 };
  // Matches loupe-row.js. Every result tile on the page now renders the same
  // 256 px source at the same size, so the two magnifiers have no honest
  // reason to disagree about how far to zoom or how big the lens should be.
  const LOUPE_DEFAULTS = { size: 112, zoom: 2.5 };

  function num(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * Auto-sweep groups. Every slider sharing a data-auto-group name runs off one
   * clock and one set of pause reasons, so grouped sliders never drift apart.
   * A slider with no group name gets a private group of its own.
   */
  const groups = new Map();
  let anonGroupId = 0;

  function getGroup(name, duration) {
    const key = name || "__anon" + anonGroupId++;
    let group = groups.get(key);
    if (!group) {
      group = {
        duration: duration,
        members: [],
        holds: new Set(),
        hidden: new Set(),
        frame: null,
        elapsed: 0,
        last: null, // null = no previous frame yet; 0 is a valid timestamp
        reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)"),
      };

      group.shouldRun = () =>
        group.members.length > 0 &&
        group.holds.size === 0 &&
        group.hidden.size < group.members.length &&
        !group.reduceMotion.matches;

      group.tick = (now) => {
        // Re-check before doing anything: a hold can land between the frame
        // being queued and it running, and this must not depend on
        // cancelAnimationFrame having taken effect in time.
        if (!group.shouldRun()) {
          group.frame = null;
          group.last = null;
          return;
        }
        if (group.last !== null) {
          group.elapsed = (group.elapsed + (now - group.last)) % group.duration;
        }
        group.last = now;
        // 0 -> 1 -> 0 triangle, smoothed into an ease-in-out sweep.
        const tri = 1 - Math.abs((group.elapsed / group.duration) * 2 - 1);
        const eased = tri * tri * (3 - 2 * tri);
        group.members.forEach((member) => member(eased));
        group.frame = window.requestAnimationFrame(group.tick);
      };

      group.refresh = () => {
        const shouldRun = group.shouldRun();
        if (shouldRun && group.frame === null) {
          group.frame = window.requestAnimationFrame(group.tick);
        } else if (!shouldRun && group.frame !== null) {
          window.cancelAnimationFrame(group.frame);
          group.frame = null;
          group.last = null;
        }
      };

      group.hold = (reason) => {
        group.holds.add(reason);
        group.refresh();
      };
      group.release = (reason) => {
        group.holds.delete(reason);
        group.refresh();
      };

      if (typeof group.reduceMotion.addEventListener === "function") {
        group.reduceMotion.addEventListener("change", group.refresh);
      }
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) group.hold("tab");
        else group.release("tab");
      });

      groups.set(key, group);
    }
    return group;
  }

  /** Wire one slider into its auto-sweep group. Returns {hold, release}. */
  function initAutoSweep(compare, apply) {
    const min = num(compare.dataset.autoMin, AUTO_DEFAULTS.min);
    const max = num(compare.dataset.autoMax, AUTO_DEFAULTS.max);
    const group = getGroup(
      compare.dataset.autoGroup,
      num(compare.dataset.autoDuration, AUTO_DEFAULTS.duration)
    );
    const id = "member" + group.members.length;

    group.members.push((eased) => apply(min + (max - min) * eased));

    // Only hover-capable pointers pause on enter — on touch, pointerleave
    // may never fire, which would leave the sweep stuck.
    compare.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") group.hold("pointer");
    });
    compare.addEventListener("pointerleave", () => group.release("pointer"));
    compare.addEventListener("focusin", () => group.hold("focus"));
    compare.addEventListener("focusout", () => group.release("focus"));

    if (typeof IntersectionObserver === "function") {
      new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) group.hidden.delete(id);
          else group.hidden.add(id);
          group.refresh();
        },
        { threshold: 0.15 }
      ).observe(compare);
    }

    group.refresh();
    return { hold: group.hold, release: group.release };
  }

  /**
   * Hover magnifier. A circular lens follows the pointer and shows the same
   * region at 2x -- still split by the handle, so the derained result and the
   * rainy input are read side by side at the *same* pixel rather than from
   * memory. That is the comparison a deraining reviewer actually needs:
   * residual streaks and over-smoothed texture only show up magnified.
   *
   * getPosition() is the live handle position, not compare.dataset.position:
   * the auto sweep deliberately never writes that attribute.
   *
   * Returns {move, hide}, or null when this environment should not have a
   * lens at all -- notably on touch, where the finger both covers the lens and
   * is already spoken for by the drag gesture.
   */
  function initLoupe(compare, getPosition) {
    if (compare.dataset.loupe === "false") return null;
    if (typeof document.createElement !== "function") return null;
    if (typeof compare.appendChild !== "function") return null;
    if (typeof window.matchMedia !== "function") return null;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return null;

    const baseImg = compare.querySelector(".compare__img--base");
    const overlayImg = compare.querySelector(".compare__overlay img");
    if (!baseImg || !overlayImg) return null;

    const size = num(compare.dataset.loupeSize, LOUPE_DEFAULTS.size);
    const zoom = num(compare.dataset.loupeZoom, LOUPE_DEFAULTS.zoom);
    const radius = size / 2;

    const lens = document.createElement("div");
    lens.className = "compare__loupe";
    lens.setAttribute("aria-hidden", "true"); // purely a pointing aid
    lens.style.width = size + "px";
    lens.style.height = size + "px";

    // Bottom layer: the rainy input, filling the whole lens.
    const under = document.createElement("div");
    under.className = "compare__loupe-layer";
    under.style.backgroundImage = 'url("' + baseImg.src + '")';

    // Top layer: our result, clipped at the handle exactly like the main
    // overlay. Its width is pinned in px because its parent is the clip box.
    const clip = document.createElement("div");
    clip.className = "compare__loupe-clip";
    const over = document.createElement("div");
    over.className = "compare__loupe-layer";
    over.style.width = size + "px";
    over.style.backgroundImage = 'url("' + overlayImg.src + '")';
    clip.appendChild(over);

    const split = document.createElement("div");
    split.className = "compare__loupe-split";

    lens.appendChild(under);
    lens.appendChild(clip);
    lens.appendChild(split);
    compare.appendChild(lens);

    const hide = () => {
      compare.classList.remove("has-loupe");
    };

    /**
     * Where the base image actually lands inside the box. The images are
     * square in a square box today, so this is the identity -- but the base
     * <img> is object-fit:cover, and if a pair is ever not square the lens
     * must crop the same way the image does, or it magnifies the wrong pixel.
     */
    const coverFit = (rect) => {
      const nw = baseImg.naturalWidth || 0;
      const nh = baseImg.naturalHeight || 0;
      if (!nw || !nh) return { w: rect.width, h: rect.height, x: 0, y: 0 };
      const scale = Math.max(rect.width / nw, rect.height / nh);
      const w = nw * scale;
      const h = nh * scale;
      return { w: w, h: h, x: (rect.width - w) / 2, y: (rect.height - h) / 2 };
    };

    const move = (clientX, clientY) => {
      const rect = compare.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        hide();
        return;
      }

      lens.style.left = x - radius + "px";
      lens.style.top = y - radius + "px";

      // Magnify about the pointer: the sampled point lands on the lens centre.
      const fit = coverFit(rect);
      const bgSize = fit.w * zoom + "px " + fit.h * zoom + "px";
      const bgPos =
        radius - (x - fit.x) * zoom + "px " + (radius - (y - fit.y) * zoom) + "px";
      under.style.backgroundSize = bgSize;
      under.style.backgroundPosition = bgPos;
      over.style.backgroundSize = bgSize;
      over.style.backgroundPosition = bgPos;

      // The handle's split line in lens coordinates. Clamping to the lens
      // makes it disappear cleanly once the handle is outside the circle.
      const cut = Math.max(
        0,
        Math.min(size, (getPosition() / 100) * rect.width - (x - radius))
      );
      clip.style.width = cut + "px";
      split.style.left = cut + "px";
      split.style.display = cut > 0 && cut < size ? "block" : "none";

      compare.classList.add("has-loupe");
    };

    return { move: move, hide: hide };
  }

  function initCompare(compare) {
    const overlay = compare.querySelector(".compare__overlay");
    const handle = compare.querySelector(".compare__handle");
    const overlayImg = compare.querySelector(".compare__overlay img");
    if (!overlay || !handle || !overlayImg) return;

    // Position lives here rather than being read back from the DOM, so the auto
    // sweep can skip its attribute writes without the keyboard handler reading
    // a stale value.
    let position = num(compare.dataset.position, 50);
    let dragging = false;

    /**
     * Match the clipped overlay image to the base image's rendered size.
     * Uses the fractional rect width, not offsetWidth: grid tracks are often
     * fractional (a 3-up row of 1fr lands on ~276.67px) and rounding to an
     * integer scales the two layers differently, which shows up as a seam
     * along the handle — exactly the artefact a deraining comparison must not
     * introduce.
     */
    const syncOverlayWidth = () => {
      overlayImg.style.width = compare.getBoundingClientRect().width + "px";
    };

    /**
     * announce=false skips the dataset/aria writes. The auto sweep runs at
     * 60 fps; writing aria-valuenow every frame makes screen readers chatter
     * about a purely decorative animation, and churns attributes for nothing.
     */
    const render = (pct, announce) => {
      position = Math.max(0, Math.min(100, pct));
      overlay.style.width = position + "%";
      handle.style.left = position + "%";
      if (announce) {
        compare.dataset.position = String(position);
        handle.setAttribute("aria-valuenow", String(Math.round(position)));
      }
    };

    render(position, true);
    syncOverlayWidth();

    const auto =
      compare.dataset.auto !== undefined && compare.dataset.auto !== "false"
        ? initAutoSweep(compare, (pct) => render(pct, false))
        : null;

    const onMove = (clientX) => {
      const rect = compare.getBoundingClientRect();
      render(((clientX - rect.left) / rect.width) * 100, true);
    };

    const onPointerDown = (e) => {
      dragging = true;
      compare.classList.add("is-dragging");
      if (auto) auto.hold("drag");
      handle.setPointerCapture(e.pointerId);
      onMove(e.clientX);
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      onMove(e.clientX);
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      compare.classList.remove("is-dragging");
      if (auto) auto.release("drag");
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    };

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);

    compare.addEventListener("pointerdown", (e) => {
      if (e.target === handle || handle.contains(e.target)) return;
      onMove(e.clientX);
    });

    // Hover magnifier. Reads `position` live, so on an auto-sweeping slider
    // the lens split always matches the handle it is drawn under.
    const loupe = initLoupe(compare, () => position);
    if (loupe) {
      const track = (e) => {
        if (e.pointerType === "touch" || dragging) return;
        loupe.move(e.clientX, e.clientY);
      };
      compare.addEventListener("pointerenter", track);
      compare.addEventListener("pointermove", track);
      compare.addEventListener("pointerleave", loupe.hide);
      // While the handle is being dragged the lens would sit on top of it and
      // obscure the very edge the user is placing; it comes back on release.
      compare.addEventListener("pointerdown", loupe.hide);
      compare.addEventListener("pointerup", track);
    }

    handle.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        render(position - step, true);
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        render(position + step, true);
        e.preventDefault();
      } else if (e.key === "Home") {
        render(0, true);
        e.preventDefault();
      } else if (e.key === "End") {
        render(100, true);
        e.preventDefault();
      }
    });

    // ResizeObserver catches grid-track changes that fire no window resize
    // event — a scrollbar appearing, or a webfont settling.
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(syncOverlayWidth).observe(compare);
    } else {
      window.addEventListener("resize", syncOverlayWidth);
    }

    // A cached image can already be complete before the load listener attaches.
    if (overlayImg.complete) syncOverlayWidth();
    else overlayImg.addEventListener("load", syncOverlayWidth);
  }

  function init() {
    document.querySelectorAll(".compare").forEach(initCompare);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
