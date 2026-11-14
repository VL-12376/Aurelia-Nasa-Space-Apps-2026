import { store } from "../core/store";

/** Screen-wide sci-fi effects: scanlines, a slow scan beam and a vignette. All pure CSS, switched off by Reduce motion. */
export function installFx(): void {
  const overlay = document.createElement("div");
  overlay.className = "fx-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.append(Object.assign(document.createElement("div"), { className: "fx-beam" }));
  document.body.append(overlay);
  const apply = () => overlay.classList.toggle("off", store.get().settings.reducedMotion);
  apply();
  store.subscribe(apply);
}

/** Tilts a card toward the pointer in 3D and moves a glare highlight with it. */
export function tilt(el: HTMLElement, max = 9): void {
  const reduced = () => store.get().settings.reducedMotion;
  el.addEventListener("pointermove", (e) => {
    if (reduced()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-(y - 0.5) * 2 * max).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
  });
  el.addEventListener("pointerleave", () => {
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  });
}

/** Counts a number up to its value so key figures feel live when a screen opens. */
export function countUp(el: HTMLElement, to: number, format: (n: number) => string, ms = 900): void {
  if (store.get().settings.reducedMotion || to === 0) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = format(to * eased);
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
    else el.textContent = format(to);
  };
  requestAnimationFrame(step);
}
