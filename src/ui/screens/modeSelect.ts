import { h } from "../../core/dom";
import { router } from "../../core/router";
import { SEASONS } from "../../campaign/seasons";
import { session } from "../session";

export function modeSelect(): HTMLElement {
  let selectedSeason = 1;
  const seasonButtons: HTMLButtonElement[] = [];

  const startSingle = () => {
    session.pendingSeason = selectedSeason;
    router.navigate("roles");
  };

  const seasonCards = SEASONS.map((s) => {
    const unlocked = s.id === 1;
    const btn = h(
      "button",
      {
        class: `panel card season${unlocked ? "" : " locked"}`,
        disabled: !unlocked,
        "aria-pressed": s.id === selectedSeason ? "true" : "false",
        onclick: () => {
          selectedSeason = s.id;
          seasonButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(SEASONS[i].id === selectedSeason)));
        },
      },
      h("div", { class: "num" }, `SEASON ${s.id}`),
      h("h3", null, s.name),
      h("p", { class: "muted" }, s.summary),
      unlocked ? null : h("span", { class: "tag" }, "Locked: finish the previous season"),
    );
    seasonButtons.push(btn);
    return btn;
  });

  return h(
    "main",
    { class: "screen" },
    h(
      "div",
      { class: "mode-grid" },
      h("div", { class: "back-row" }, h("button", { class: "btn ghost small", onclick: () => router.navigate("menu") }, "Back"), h("h2", null, "Select Game Mode")),
      h(
        "div",
        { class: "grid cols-2" },
        h(
          "div",
          { class: "panel mode-card" },
          h("h2", null, "Single-player"),
          h("p", { class: "muted" }, "Run an entire AURELIA exploration programme: budget, spacecraft, missions and research."),
          h("button", { class: "btn", onclick: startSingle }, "Start Campaign"),
        ),
        h(
          "div",
          { class: "panel mode-card" },
          h("h2", null, "Cooperative multiplayer"),
          h("p", { class: "muted" }, "Up to four players share one spacecraft and one mission, each in a specialist role. Needs the multiplayer server (npm run server)."),
          h("button", { class: "btn ghost", onclick: () => router.navigate("multiplayer") }, "Create or join a room"),
        ),
      ),
      h("div", { style: { height: "24px" } }),
      h("h3", { style: { marginBottom: "12px" } }, "Campaign seasons"),
      h("div", { class: "season-row" }, ...seasonCards),
    ),
  );
}
