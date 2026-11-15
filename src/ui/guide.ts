import { h } from "../core/dom";
import { router, type ScreenId } from "../core/router";
import type { GameState } from "../core/gameState";
import { nextStep } from "./guideLogic";

export { nextStep };

let dismissed = false;

/** A slim banner that tells a new player what to do next, and why. */
export function guideBanner(g: GameState | null, active: ScreenId): HTMLElement | null {
  if (!g || dismissed) return null;
  const step = nextStep(g);
  if (!step) return null;
  const learned = g.achievements.some((a) => a.startsWith("Academy:"));
  let open = false;
  const why = h("p", { class: "guide-detail", hidden: true }, step.detail);
  const toggle = h("button", { class: "guide-link", "aria-expanded": "false", onclick: () => { open = !open; why.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); toggle.textContent = open ? "Hide" : "Why?"; } }, "Why?");
  return h(
    "div",
    { class: "guide", role: "region", "aria-label": "Next step" },
    h("div", { class: "guide-row" },
      h("span", { class: "guide-tag mono" }, `NEXT STEP · LEVEL ${step.cml}`),
      h("strong", null, step.title),
      h("span", { class: "guide-why" }, step.why),
      toggle,
      active === step.screen ? h("span", { class: "guide-here mono" }, "You are here") : h("button", { class: "btn small", onclick: () => router.navigate(step.screen) }, step.action),
      !learned && active !== "academy" ? h("button", { class: "guide-link", onclick: () => router.navigate("academy") }, "New to this? Mission Academy") : null,
      h("button", { class: "guide-x", "aria-label": "Hide hints for now", title: "Hide hints", onclick: (e: MouseEvent) => { dismissed = true; (e.currentTarget as HTMLElement).closest(".guide")?.remove(); } }, "×"),
    ),
    why,
  );
}
