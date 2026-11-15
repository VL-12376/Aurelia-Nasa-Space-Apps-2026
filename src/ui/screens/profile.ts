import { h } from "../../core/dom";
import { store } from "../../core/store";
import { TECHS } from "../../research/tech";
import { gameShell } from "../layout";
import { mp } from "../../net/session";
import { levelProgress } from "../../core/progression";

export function profileScreen(): HTMLElement {
  const game = mp.active ? mp.room?.game : store.get().game;
  if (!game) return gameShell("profile", h("div", { class: "notice" }, "No active game. Start a new campaign from the main menu."));

  const unlocked = TECHS.filter((t) => game.researchedTech.includes(t.id));
  const progress = levelProgress(store.get().player.experience);
  return gameShell(
    "profile",
    h(
      "div",
      { class: "grid" },
      h("h2", null, "Player Profile"),
      h("p", { class: "mono" }, `Level ${progress.level} · ${store.get().player.experience} XP · ${progress.nextAt - store.get().player.experience} XP to the next level`),
      h("div", { class: "panel" }, h("h3", null, "Player awards"), store.get().player.badges.length ? h("ul", { class: "list" }, ...store.get().player.badges.map((b) => h("li", null, b))) : h("p", { class: "muted" }, "Earn promotion badges and mission awards by flying missions.")),
      h(
        "div",
        { class: "grid cols-3" },
        h("div", { class: "panel stat" }, h("span", { class: "label" }, "Player experience"), h("span", { class: "value" }, String(store.get().player.experience))),
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
