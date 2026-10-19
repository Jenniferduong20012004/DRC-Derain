/**
 * Highlights the .tabs-nav link for whichever section currently sits just
 * below the (sticky) nav bar, as the reader scrolls -- so the bar always
 * shows where they are, not just where a click would take them.
 *
 * Approach: on scroll/resize, probe a single line a bit below the nav and
 * pick the last section whose top has crossed it (see update()).
 */
(function () {
  const nav = document.querySelector(".tabs-nav");
  if (!nav) return;

  const links = Array.from(nav.querySelectorAll("a[href^='#']"));
  const sections = links
    .map((a) => {
      const id = a.getAttribute("href").slice(1);
      const section = document.getElementById(id);
      return section ? { link: a, section } : null;
    })
    .filter(Boolean);
  if (!sections.length) return;

  function setActive(section) {
    for (const { link, section: s } of sections) {
      link.classList.toggle("is-active", s === section);
    }
  }

  function update() {
    // The probe sits a fraction of the way down the visible area (below the
    // nav), not right at the nav's edge: a section's top padding/border puts
    // its heading well below its box top, so a probe hugging the nav would
    // still land in the *previous* section while the new heading is already
    // on screen. The active section is the last one whose top has reached the
    // probe, which also leaves no gaps between sections.
    const navBottom = nav.getBoundingClientRect().bottom;
    const probeY = navBottom + (window.innerHeight - navBottom) * 0.3;
    let current = null;
    for (const entry of sections) {
      if (entry.section.getBoundingClientRect().top <= probeY) {
        current = entry.section;
      } else {
        break;
      }
    }
    // Scrolled to the very bottom of the page: the last section may be too
    // short to ever reach the probe, so select it explicitly.
    const atBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 2;
    if (atBottom) current = sections[sections.length - 1].section;
    setActive(current);
  }

  let ticking = false;
  function onScrollOrResize() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize);
  update();
})();
