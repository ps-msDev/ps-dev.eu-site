(() => {
  "use strict";

  // The switch is a plain link to the other version; script only lets the knob slide first.
  const link = document.querySelector(".version-switch");
  if (!link) return;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  link.addEventListener("click", event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    link.dataset.version = link.dataset.current === "2" ? "1" : "2";
    setTimeout(() => { location.href = link.href; }, reducedMotion.matches ? 0 : 280);
  });

  // Back/forward cache restores the page as it was left, knob already moved.
  addEventListener("pageshow", event => {
    if (event.persisted) link.dataset.version = link.dataset.current;
  });
})();
