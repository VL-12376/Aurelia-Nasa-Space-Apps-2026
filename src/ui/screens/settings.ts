import { h } from "../../core/dom";
import { router } from "../../core/router";
import { store, type Settings } from "../../core/store";
import { audio } from "../../audio/engine";
import { speak, stopSpeaking } from "../../audio/voice";
import { DISCLAIMER, SOURCES } from "../../data/real";

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
        h("div", { class: "field" }, h("label", { for: "set-voice" }, "Crew voices (read aloud by your device's built-in speech, no recordings)"), h("input", { type: "checkbox", id: "set-voice", checked: settings.voice, onchange: (e: Event) => { const on = (e.target as HTMLInputElement).checked; store.updateSettings({ voice: on }); if (on) speak("controller", "All stations, this is Mission Control. Voice check."); else stopSpeaking(); } })),
        slider("set-music", "Music volume", settings.musicVolume, (v) => sound({ musicVolume: v })),
        slider("set-sfx", "Effects volume", settings.sfxVolume, (v) => { sound({ sfxVolume: v }); audio.sfx("confirm"); }),
        h("div", { class: "field" }, h("label", { for: "set-mute" }, "Mute everything"), h("input", { type: "checkbox", id: "set-mute", checked: settings.muted, onchange: (e: Event) => sound({ muted: (e.target as HTMLInputElement).checked }) })),
      ),
      h(
        "div",
        { class: "panel" },
        h("h3", { style: { margin: "0 0 8px" } }, "Data and credits"),
        h("p", { class: "muted small" }, DISCLAIMER),
        h("ul", { class: "muted small", style: { paddingLeft: "18px", margin: "8px 0" } }, ...SOURCES.map((s) => h("li", null, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.name), ` · ${s.use}`))),
        h("p", { class: "muted small" }, "Music and sound effects are synthesised in your browser. Crew voices come from your device's own speech engine. Portraits and artwork are original to AURELIA."),
      ),
    ),
  );
}
