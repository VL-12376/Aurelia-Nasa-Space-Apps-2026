import gsap from "gsap";
import { h } from "../core/dom";
import { router, type ScreenId } from "../core/router";
import { store } from "../core/store";

const NAV: { id: ScreenId; label: string }[] = [
  { id: "hq", label: "Headquarters" },
  { id: "map", label: "Solar System" },
  { id: "briefing", label: "Missions" },
  { id: "hangar", label: "Hangar" },
  { id: "research", label: "Research" },
  { id: "profile", label: "Profile" },
];

/** Wraps a screen's content with the in-game top bar and navigation. */
export function gameShell(active: ScreenId, content: HTMLElement, opts: { fill?: boolean } = {}): HTMLElement {
  const nav = h(
    "nav",
    { class: "nav", "aria-label": "Game navigation" },
    ...NAV.map((item) =>
      h("button", { class: item.id === active ? "active" : "", "aria-current": item.id === active ? "page" : null, onclick: () => router.navigate(item.id) }, item.label),
    ),
  );

  const clock = h("span", { class: "mono clock" }, "");
  const tick = () => {
    clock.textContent = `UTC ${new Date().toISOString().slice(0, 10)} ${new Date().toISOString().slice(11, 19)}`;
  };
  tick();
  const timer = window.setInterval(tick, 1000);
  router.onLeave(() => clearInterval(timer));

  const el = h(
    "main",
    { class: `screen${opts.fill ? " fill" : ""}` },
    h(
      "div",
      { class: "hq" },
      h(
        "header",
        { class: "topbar" },
        h("span", { class: "brand" }, "AURELIA"),
        nav,
        h("span", { class: "live mono" }, h("span", { class: "led" }), "LIVE"),
        clock,
        h("button", { class: "btn ghost small", onclick: () => router.navigate("menu") }, "Menu"),
      ),
      content,
    ),
  );

  if (!store.get().settings.reducedMotion) {
    // Panels slide in one after another so each screen feels like it is powering up.
    requestAnimationFrame(() => {
      const panels = el.querySelectorAll(".hud, .panel");
      if (panels.length) gsap.from(panels, { opacity: 0, y: 16, duration: 0.55, stagger: 0.05, ease: "power2.out", clearProps: "opacity,transform" });
    });
  }
  return el;
}

export function placeholderScreen(active: ScreenId, title: string, phase: number, blurb: string, planned: string[]): HTMLElement {
  return gameShell(
    active,
    h(
      "div",
      { class: "grid" },
      h("h2", null, title),
      h("p", { class: "muted" }, blurb),
      h(
        "div",
        { class: "notice" },
        `Not built yet: this screen is scheduled for Phase ${phase}. Nothing here is interactive, so no buttons are shown.`,
      ),
      h("div", { class: "panel" }, h("h3", null, "Planned"), h("ul", { class: "list" }, ...planned.map((p) => h("li", null, p)))),
    ),
  );
}
