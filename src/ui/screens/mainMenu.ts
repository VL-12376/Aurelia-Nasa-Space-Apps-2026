import { h, toast } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";

export function mainMenu(): HTMLElement {
  const hasSave = store.hasSave();
  return h(
    "main",
    { class: "screen menu" },
    h("div", { class: "logo-frame" }, h("img", { src: `${import.meta.env.BASE_URL}aurelia-logo.jpg`, alt: "AURELIA logo: a silver stylised A emblem with the tagline Embarking on a Radiant Tomorrow." })),
    h(
      "div",
      { class: "actions" },
      h("button", { class: "btn", onclick: () => router.navigate("mode") }, "New Game"),
      h(
        "button",
        {
          class: "btn",
          disabled: !hasSave,
          title: hasSave ? "" : "No saved game found",
          onclick: () => {
            if (store.continueGame()) router.navigate("hq");
            else toast("No saved game found.");
          },
        },
        "Continue",
      ),
      h("button", { class: "btn", onclick: () => router.navigate("multiplayer") }, "Multiplayer"),
      h("button", { class: "btn ghost", onclick: () => router.navigate("settings") }, "Settings"),
    ),
  );
}
