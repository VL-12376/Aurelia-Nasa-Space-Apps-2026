import { h } from "../../core/dom";
import { router } from "../../core/router";
import { store, type Settings } from "../../core/store";

export function settingsScreen(): HTMLElement {
  const { settings } = store.get();

  const motion = h("input", {
    type: "checkbox",
    id: "set-motion",
    onchange: (e: Event) => store.updateSettings({ reducedMotion: (e.target as HTMLInputElement).checked }),
  });
  motion.checked = settings.reducedMotion;

  const density = h(
    "select",
    {
      id: "set-density",
      onchange: (e: Event) => store.updateSettings({ starDensity: (e.target as HTMLSelectElement).value as Settings["starDensity"] }),
    },
    ...(["low", "medium", "high"] as const).map((v) => h("option", { value: v, selected: v === settings.starDensity }, v[0].toUpperCase() + v.slice(1))),
  );

  return h(
    "main",
    { class: "screen" },
    h(
      "div",
      { class: "mode-grid", style: { maxWidth: "640px" } },
      h("div", { class: "back-row" }, h("button", { class: "btn ghost small", onclick: () => router.navigate("menu") }, "Back"), h("h2", null, "Settings")),
      h(
        "div",
        { class: "panel" },
        h("div", { class: "field" }, h("label", { for: "set-motion" }, "Reduce motion (stops background animation and transitions)"), motion),
        h("div", { class: "field" }, h("label", { for: "set-density" }, "Starfield density"), density),
      ),
    ),
  );
}
