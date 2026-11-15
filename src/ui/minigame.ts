import { h } from "../core/dom";
import { markerAt, roundScore, ROUNDS, zoneFor } from "./minigameLogic";

export interface MiniGameOptions {
  title: string;
  hint: string;
  onDone(score: number): void;
}

/**
 * A short timing challenge: stop the sweeping marker inside the green band, three times. Players who
 * cannot or would rather not play can take an average result with the skip button.
 */
export function miniGame(o: MiniGameOptions): { el: HTMLElement; stop(): void } {
  let round = 0;
  let total = 0;
  let raf = 0;
  let zone = zoneFor(0, Math.random);
  let start = performance.now();
  let done = false;

  const band = h("div", { class: "mg-zone" });
  const marker = h("div", { class: "mg-marker" });
  const track = h("div", { class: "mg-track" }, band, marker);
  const roundEl = h("div", { class: "mg-round mono" });
  const result = h("div", { class: "mg-result mono", "aria-live": "polite" });
  const place = () => {
    band.style.left = `${zone.start * 100}%`;
    band.style.width = `${zone.width * 100}%`;
    roundEl.textContent = `ATTEMPT ${round + 1} OF ${ROUNDS}`;
  };
  place();

  const tick = (now: number) => {
    if (done) return;
    marker.style.left = `${markerAt(now - start, round) * 100}%`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const finish = (score: number) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    o.onDone(score);
  };

  const press = () => {
    if (done) return;
    const pos = markerAt(performance.now() - start, round);
    const s = roundScore(pos, zone);
    total += s;
    result.textContent = s === 1 ? "Hit" : s > 0 ? "Close" : "Miss";
    result.dataset.tone = s === 1 ? "ok" : s > 0 ? "warn" : "bad";
    round++;
    if (round >= ROUNDS) {
      finish(total / ROUNDS);
      return;
    }
    zone = zoneFor(round, Math.random);
    start = performance.now();
    place();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.key === "Enter") {
      e.preventDefault();
      press();
    }
  };
  window.addEventListener("keydown", onKey);

  const el = h(
    "div",
    { class: "mg" },
    h("div", { class: "mc-modal-tag mono" }, "MANUAL CONTROL"),
    h("h2", null, o.title),
    h("p", { class: "muted" }, o.hint),
    track,
    h("div", { class: "mg-meta" }, roundEl, result),
    h(
      "div",
      { class: "mg-actions" },
      h("button", { class: "btn", onclick: press }, "NOW  (Space)"),
      h("button", { class: "btn ghost small", title: "Use an average result instead of playing", onclick: () => finish(0.5) }, "Skip: average result"),
    ),
  );
  return {
    el,
    stop: () => {
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    },
  };
}
