/**
 * Small page-wide helpers:
 *   - "Copy" buttons (BibTeX): <button data-copy-target="id"> copies the
 *     text of #id and confirms in place for a moment.
 *   - Back-to-top button: appears once the reader is past the first screen.
 *   - Live Demo video: starts as soon as it scrolls into view, rather than
 *     on page load, so it begins at the start for whoever reaches it.
 *   - Spotlights: while the Video section (softly, Live Demo) sits in the
 *     middle of the viewport, the page behind the panel darkens and shows
 *     through the panel behind that section, rain included.
 */
(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ── Copy buttons ── */

  // navigator.clipboard needs a secure context (https, localhost, file://);
  // the hidden-textarea fallback covers plain http previews.
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }

  document.querySelectorAll("[data-copy-target]").forEach((btn) => {
    const source = document.getElementById(btn.dataset.copyTarget);
    if (!source) return;
    const label = btn.textContent;
    let timer = null;
    btn.addEventListener("click", () => {
      copyText(source.textContent).then(
        () => {
          btn.textContent = "Copied!";
          btn.classList.add("is-copied");
        },
        () => {
          btn.textContent = "Press Ctrl+C";
          // Leave the text selected so the manual copy is one keystroke.
          const range = document.createRange();
          range.selectNodeContents(source);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      );
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.textContent = label;
        btn.classList.remove("is-copied");
      }, 2000);
    });
  });

  /* ── Back to top ── */

  const backToTop = document.querySelector(".back-to-top");
  if (backToTop) {
    backToTop.hidden = false;
    let ticking = false;
    const update = () => {
      ticking = false;
      backToTop.classList.toggle("is-visible", window.scrollY > window.innerHeight);
    };
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
      },
      { passive: true }
    );
    update();

    backToTop.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
      // Move keyboard focus back to the top too, not just the viewport.
      const title = document.querySelector("h1");
      if (title) {
        title.setAttribute("tabindex", "-1");
        title.focus({ preventScroll: true });
      }
    });
  }

  /* ── Live Demo video ──
     Plays as soon as it is at least half in view, in step with the Live
     Demo spotlight, and pauses again when it leaves, so it never runs
     unseen. A reader who pauses it themselves keeps it paused: the observer
     only resumes playback it paused itself. Reduced-motion readers get the
     poster and the controls only. */

  const demo = document.querySelector(".demo-video");
  if (demo && "IntersectionObserver" in window && !reduceMotion.matches) {
    let userPaused = false;
    let autoPausing = false;

    demo.addEventListener("pause", () => {
      if (autoPausing) autoPausing = false;
      else userPaused = true;
    });
    demo.addEventListener("play", () => {
      userPaused = false;
    });

    new IntersectionObserver(
      (entries) => {
        const visible = entries[0].isIntersecting;
        if (visible) {
          if (userPaused) return;
          // play() rejects if the browser refuses autoplay; the controls
          // are still there, so there is nothing else to do about it.
          demo.play().catch(() => {});
        } else if (!demo.paused) {
          autoPausing = true;
          demo.pause();
        }
      },
      { threshold: 0.5 }
    ).observe(demo);
  }

  // The lift while it plays (.is-playing in css/style.css). Outside the
  // block above so it also follows a reduced-motion reader's own clicks.
  if (demo) {
    const setPlaying = () => demo.classList.toggle("is-playing", !demo.paused);
    demo.addEventListener("play", setPlaying);
    demo.addEventListener("pause", setPlaying);
  }

  /* ── Spotlights (Video, and Live Demo's soft one) ──
     .is-lit (styled in css/style.css) is on while any part of a section
     overlaps the middle 30% of the viewport, so the lights go down as the
     video reaches the centre and come back up as the reader moves on.
     While lit, the page background behind the panel changes colour (a
     class on <html>), and the panel's white fades out behind the section,
     so the section shows the page itself, rain and all: .page-shell is
     painted as a vertical gradient of its own colour with one band per
     spotlight, and each band's colour goes to transparent while lit.
     Without IntersectionObserver the sections just stay as they are. */

  const shell = document.querySelector(".page-shell");
  const spotlights = Array.from(document.querySelectorAll(".spotlight"));
  if (shell && spotlights.length && "IntersectionObserver" in window) {
    const panel = getComputedStyle(shell).backgroundColor;
    const bands = spotlights.map((_, i) => "--spot-band-" + i);

    // Registered as colours so they can transition; where registering
    // isn't supported a band just switches in one step.
    if (window.CSS && CSS.registerProperty) {
      bands.forEach((name) => {
        try {
          CSS.registerProperty({
            name: name,
            syntax: "<color>",
            inherits: false,
            initialValue: "transparent",
          });
        } catch (e) {
          // Already registered (script loaded twice): nothing to do.
        }
      });
    }
    bands.forEach((name) => shell.style.setProperty(name, panel));
    if (!reduceMotion.matches) {
      shell.style.transition = bands.map((name) => name + " 0.6s ease").join(", ");
    }

    // Band positions, relative to the panel; redone whenever the panel
    // changes height (late images, the lazy video embed, a resize).
    const layoutBands = () => {
      const origin = shell.getBoundingClientRect().top;
      const stops = [];
      let from = 0;
      spotlights.forEach((section, i) => {
        const r = section.getBoundingClientRect();
        const top = r.top - origin;
        const bottom = r.bottom - origin;
        stops.push(`${panel} ${from}px ${top}px`, `var(${bands[i]}) ${top}px ${bottom}px`);
        from = bottom;
      });
      stops.push(`${panel} ${from}px`);
      shell.style.backgroundColor = "transparent";
      shell.style.backgroundImage = `linear-gradient(${stops.join(", ")})`;
    };
    layoutBands();
    if ("ResizeObserver" in window) new ResizeObserver(layoutBands).observe(shell);
    else window.addEventListener("resize", layoutBands);

    spotlights.forEach((section, i) => {
      // The page background behind the panel changes along with it,
      // softly for a soft spotlight.
      const pageClass = section.classList.contains("spotlight--soft")
        ? "spotlight-soft-on"
        : "spotlight-on";
      new IntersectionObserver(
        (entries) => {
          const lit = entries[0].isIntersecting;
          section.classList.toggle("is-lit", lit);
          document.documentElement.classList.toggle(pageClass, lit);
          shell.style.setProperty(bands[i], lit ? "transparent" : panel);
        },
        { rootMargin: "-35% 0px -35% 0px" }
      ).observe(section);
    });
  }
})();
