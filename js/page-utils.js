/**
 * Small page-wide helpers:
 *   - "Copy" buttons (BibTeX): <button data-copy-target="id"> copies the
 *     text of #id and confirms in place for a moment.
 *   - Back-to-top button: appears once the reader is past the first screen.
 *   - Live Demo video: starts a second after it scrolls into view, rather
 *     than on page load, so it begins at the start for whoever reaches it.
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
     Plays once it has sat at least half in view for DEMO_DELAY_MS, and pauses
     again when it leaves, so it never runs unseen. A reader who pauses it
     themselves keeps it paused: the observer only resumes playback it paused
     itself. Reduced-motion readers get the poster and the controls only. */

  const DEMO_DELAY_MS = 1000;
  const demo = document.querySelector(".demo-video");
  if (demo && "IntersectionObserver" in window && !reduceMotion.matches) {
    let timer = null;
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
        clearTimeout(timer);
        if (visible) {
          if (userPaused) return;
          timer = setTimeout(() => {
            // play() rejects if the browser refuses autoplay; the controls
            // are still there, so there is nothing else to do about it.
            demo.play().catch(() => {});
          }, DEMO_DELAY_MS);
        } else if (!demo.paused) {
          autoPausing = true;
          demo.pause();
        }
      },
      { threshold: 0.5 }
    ).observe(demo);
  }
})();
