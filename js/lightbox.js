/**
 * Click-to-enlarge viewer for figures.
 *
 * Two kinds of trigger:
 *   - <img data-lightbox="name">: a one-off figure (the architecture diagram).
 *     data-full="..." points at a larger file to show instead of the inline
 *     one, and makes the image toggle between fit-to-screen and actual size
 *     on click, so the diagram's small labels can be read. data-caption sets
 *     the caption.
 *   - Every image in a .qual-row (Comparison): each row is one scene, opened
 *     as a group. Arrow keys, swipe, the side buttons or the method strip flip
 *     between methods in place -- same position, same size -- which is the
 *     fastest way to see what one method changed against another.
 *
 * Built on <dialog>: showModal() gives focus trapping, Esc to close, and
 * focus restored to the trigger, for free. Browsers without it simply keep
 * the images inline.
 */
(function () {
  if (typeof HTMLDialogElement !== "function") return;

  const SWIPE_MIN = 50; // px of horizontal travel that counts as a swipe

  /* ── Collect groups ── */

  const groups = [];

  const explicit = new Map();
  document.querySelectorAll("img[data-lightbox]").forEach((img) => {
    const name = img.dataset.lightbox;
    if (!explicit.has(name)) {
      explicit.set(name, []);
      groups.push(explicit.get(name));
    }
    explicit.get(name).push({
      trigger: img,
      src: img.dataset.full || img.currentSrc || img.src,
      alt: img.alt,
      title: img.dataset.caption || img.alt,
      detail: "",
      zoomable: !!img.dataset.full,
    });
  });

  // Comparison grid: column labels come from the head row, the detail line is
  // the row's position ("Image 1", "Image 2", ...), not the source dataset's
  // scene ids, which mean nothing to a reader.
  const heads = Array.from(document.querySelectorAll(".qual-head > *")).map((el) =>
    el.textContent.trim()
  );
  document.querySelectorAll(".qual-row").forEach((row, rowIndex) => {
    const items = Array.from(row.querySelectorAll("img")).map((img, i) => {
      return {
        trigger: img,
        src: img.currentSrc || img.src,
        alt: img.alt,
        title: heads[i] || img.alt,
        detail: "Image " + (rowIndex + 1),
        zoomable: false,
      };
    });
    if (items.length) groups.push(items);
  });

  if (!groups.length) return;

  /* ── Viewer ── */

  const dialog = document.createElement("dialog");
  dialog.className = "lightbox";
  dialog.setAttribute("aria-label", "Image viewer");
  dialog.innerHTML =
    '<div class="lightbox__body">' +
    '<div class="lightbox__stage"><img class="lightbox__img" alt=""></div>' +
    '<p class="lightbox__caption" aria-live="polite"></p>' +
    '<div class="lightbox__strip" role="group" aria-label="Methods for this scene"></div>' +
    "</div>" +
    '<button type="button" class="lightbox__btn lightbox__prev" aria-label="Previous image">&#8249;</button>' +
    '<button type="button" class="lightbox__btn lightbox__next" aria-label="Next image">&#8250;</button>' +
    '<button type="button" class="lightbox__btn lightbox__close" aria-label="Close">&times;</button>';
  document.body.appendChild(dialog);

  const body = dialog.querySelector(".lightbox__body");
  const stage = dialog.querySelector(".lightbox__stage");
  const view = dialog.querySelector(".lightbox__img");
  const caption = dialog.querySelector(".lightbox__caption");
  const strip = dialog.querySelector(".lightbox__strip");
  const prevBtn = dialog.querySelector(".lightbox__prev");
  const nextBtn = dialog.querySelector(".lightbox__next");
  const closeBtn = dialog.querySelector(".lightbox__close");

  let group = null;
  let index = 0;

  function setActual(on, clientX, clientY) {
    dialog.classList.toggle("is-actual", on);
    if (!on) return;
    // Land on the point that was clicked, not on the top-left corner.
    const rect = view.getBoundingClientRect();
    const fx = rect.width ? (clientX - rect.left) / rect.width : 0.5;
    const fy = rect.height ? (clientY - rect.top) / rect.height : 0.5;
    requestAnimationFrame(() => {
      stage.scrollLeft = fx * view.offsetWidth - stage.clientWidth / 2;
      stage.scrollTop = fy * view.offsetHeight - stage.clientHeight / 2;
    });
  }

  function show(i) {
    index = (i + group.length) % group.length;
    const item = group[index];
    setActual(false);
    dialog.classList.toggle("can-zoom", item.zoomable);
    view.src = item.src;
    view.alt = item.alt;

    caption.textContent = "";
    const title = document.createElement("strong");
    title.textContent = item.title;
    caption.appendChild(title);
    const parts = [];
    if (item.detail) parts.push(item.detail);
    if (group.length > 1) parts.push(index + 1 + " / " + group.length);
    if (item.zoomable) parts.push("Click the image to toggle actual size");
    if (parts.length) {
      const small = document.createElement("small");
      small.textContent = parts.join(" · ");
      caption.appendChild(small);
    }

    strip.querySelectorAll(".lightbox__thumb").forEach((b, n) => {
      b.setAttribute("aria-current", n === index ? "true" : "false");
      if (n === index) b.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  function open(g, i) {
    group = g;
    const multi = group.length > 1;
    prevBtn.hidden = !multi;
    nextBtn.hidden = !multi;
    strip.hidden = !multi;
    strip.textContent = "";
    if (multi) {
      group.forEach((item, n) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "lightbox__thumb";
        const t = document.createElement("img");
        t.src = item.src;
        t.alt = "";
        b.appendChild(t);
        b.appendChild(document.createTextNode(item.title));
        b.addEventListener("click", () => show(n));
        strip.appendChild(b);
      });
    }
    document.documentElement.classList.add("lightbox-open");
    dialog.showModal();
    show(i);
    closeBtn.focus();
  }

  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("lightbox-open");
    view.removeAttribute("src");
    group = null;
  });

  prevBtn.addEventListener("click", () => show(index - 1));
  nextBtn.addEventListener("click", () => show(index + 1));
  closeBtn.addEventListener("click", () => dialog.close());

  dialog.addEventListener("keydown", (e) => {
    if (!group) return;
    if (e.key === "ArrowLeft") {
      show(index - 1);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      show(index + 1);
      e.preventDefault();
    }
  });

  // A click on the dark area around the image closes; on the image itself it
  // toggles actual size (diagram only).
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target === body || e.target === stage) {
      dialog.close();
    }
  });
  view.addEventListener("click", (e) => {
    if (!group || !group[index].zoomable) return;
    setActual(!dialog.classList.contains("is-actual"), e.clientX, e.clientY);
  });

  // Swipe to flip on touch screens. Ignored in actual-size mode, where a
  // horizontal drag is panning the diagram.
  let swipeX = null;
  let swipeY = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    swipeX = e.clientX;
    swipeY = e.clientY;
  });
  stage.addEventListener("pointerup", (e) => {
    if (swipeX === null || !group || group.length < 2) return;
    if (dialog.classList.contains("is-actual")) return;
    const dx = e.clientX - swipeX;
    const dy = e.clientY - swipeY;
    swipeX = null;
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      show(index + (dx < 0 ? 1 : -1));
    }
  });

  /* ── Wire the triggers ── */

  groups.forEach((g) => {
    g.forEach((item, i) => {
      const img = item.trigger;
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", "Enlarge: " + item.alt);
      img.addEventListener("click", () => open(g, i));
      img.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(g, i);
        }
      });
    });
  });
})();
