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

  const list = nav.querySelector("ul");
  const links = Array.from(nav.querySelectorAll("a[href^='#']"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sections = links
    .map((a) => {
      const id = a.getAttribute("href").slice(1);
      const section = document.getElementById(id);
      return section ? { link: a, section } : null;
    })
    .filter(Boolean);
  if (!sections.length) return;

  // On narrow screens the tab row scrolls sideways instead of wrapping (see
  // .tabs-nav in style.css). Fade whichever edge still hides tabs, so the
  // row visibly continues past the screen edge.
  function updateFades() {
    const max = list.scrollWidth - list.clientWidth;
    list.classList.toggle("fade-left", list.scrollLeft > 1);
    list.classList.toggle("fade-right", list.scrollLeft < max - 1);
  }

  // Scrolls the tab row (only the row, never the page -- scrollIntoView
  // would also move the page vertically) so the active tab sits centered.
  function revealTab(link) {
    if (list.scrollWidth <= list.clientWidth) return;
    // Measured from rendered boxes, not offsetLeft: each <li> carries a
    // filter (for its drop shadow), which makes it the link's offsetParent
    // and pins offsetLeft at 0.
    const linkBox = link.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    const target =
      list.scrollLeft +
      (linkBox.left - listBox.left) -
      (list.clientWidth - linkBox.width) / 2;
    list.scrollTo({
      left: target,
      behavior: reduceMotion.matches ? "auto" : "smooth",
    });
  }

  let activeSection;
  function setActive(section) {
    if (section === activeSection) return;
    activeSection = section;
    for (const { link, section: s } of sections) {
      const on = s === section;
      link.classList.toggle("is-active", on);
      if (on) {
        link.setAttribute("aria-current", "location");
        revealTab(link);
      } else {
        link.removeAttribute("aria-current");
      }
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
  window.addEventListener("resize", () => {
    onScrollOrResize();
    updateFades();
  });
  list.addEventListener("scroll", updateFades, { passive: true });
  update();
  updateFades();
})();
