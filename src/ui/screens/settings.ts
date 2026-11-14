import { h } from "../../core/dom";
import { router } from "../../core/router";
import { store, type Settings } from "../../core/store";
import { audio } from "../../audio/engine";

function slider(id: string, label: string, value: number, onInput: (v: number) => void): HTMLElement {
  const input = h("input", { type: "range", id, min: 0, max: 100, step: 1, value: Math.round(value * 100), "aria-label": label, oninput: (e: Event) => onInput(Number((e.target as HTMLInputElement).value) / 100) });
  return h("div", { class: "field" }, h("label", { for: id }, label), input);
}

export function settingsScreen(): HTMLElement {
  const sound = (patch: Partial<Settings>) => {
    store.updateSettings(patch);
    audio.start();
    audio.applySettings();
  };
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
        h("h3", { style: { margin: "18px 0 8px" } }, "Sound"),
        h("p", { class: "muted small" }, "All music and effects are generated live in your browser, so nothing is downloaded and there are no copyright restrictions."),
        slider("set-music", "Music volume", settings.musicVolume, (v) => sound({ musicVolume: v })),
        slider("set-sfx", "Effects volume", settings.sfxVolume, (v) => { sound({ sfxVolume: v }); audio.sfx("confirm"); }),
        h("div", { class: "field" }, h("label", { for: "set-mute" }, "Mute everything"), h("input", { type: "checkbox", id: "set-mute", checked: settings.muted, onchange: (e: Event) => sound({ muted: (e.target as HTMLInputElement).checked }) })),
      ),
    ),
  );
}
