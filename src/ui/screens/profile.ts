import { h } from "../../core/dom";
import { store } from "../../core/store";
import { TECHS } from "../../research/tech";
import { gameShell } from "../layout";

export function profileScreen(): HTMLElement {
  const game = store.get().game;
  if (!game) return gameShell("profile", h("div", { class: "notice" }, "No active game. Start a new campaign from the main menu."));

  const unlocked = TECHS.filter((t) => game.researchedTech.includes(t.id));
  return gameShell(
    "profile",
    h(
      "div",
      { class: "grid" },
      h("h2", null, "Player Profile"),
      h(
        "div",
        { class: "grid cols-3" },
        h("div", { class: "panel stat" }, h("span", { class: "label" }, "Experience"), h("span", { class: "value" }, String(game.experience))),
        h("div", { class: "panel stat" }, h("span", { class: "label" }, "Missions completed"), h("span", { class: "value" }, String(game.completedMissions.length))),
        h("div", { class: "panel stat" }, h("span", { class: "label" }, "Technologies"), h("span", { class: "value" }, String(unlocked.length))),
      ),
      h(
        "div",
        { class: "grid cols-2" },
        h("div", { class: "panel" }, h("h3", null, "Achievements"), game.achievements.length ? h("ul", { class: "list" }, ...game.achievements.map((a) => h("li", null, a))) : h("p", { class: "muted" }, "None earned yet. Achievements unlock as you complete missions.")),
        h("div", { class: "panel" }, h("h3", null, "Unlocked technologies"), unlocked.length ? h("ul", { class: "list" }, ...unlocked.map((t) => h("li", null, t.name))) : h("p", { class: "muted" }, "None yet.")),
      ),
    ),
  );
}
