import { h, toast } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { TECHS } from "../../research/tech";
import { PARTS } from "../../spacecraft/parts";
import { gameShell } from "../layout";

export function researchScreen(): HTMLElement {
  const game = store.get().game;
  if (!game) return gameShell("research", h("div", { class: "notice" }, "No active game. Start a new campaign from the main menu."));
  const done = new Set(game.researchedTech);
  const name = (id: string) => TECHS.find((t) => t.id === id)?.name ?? id;

  const research = (id: string, cost: number) => {
    store.updateGame((g) => {
      if (g.researchPoints < cost || g.researchedTech.includes(id)) return;
      g.researchPoints -= cost;
      g.researchedTech.push(id);
    });
    toast(`Researched ${name(id)}.`);
    router.navigate("research");
  };

  const seasons = [1, 2, 3, 4].map((s) =>
    h(
      "div",
      { class: "panel" },
      h("h3", null, `Season ${s}`),
      h(
        "ul",
        { class: "list" },
        ...TECHS.filter((t) => t.season === s).map((t) => {
          const ready = t.requires.every((r) => done.has(r));
          const affordable = game.researchPoints >= t.cost;
          const unlocks = PARTS.filter((p) => p.tech === t.id).map((p) => p.name);
          return h(
            "li",
            null,
            h(
              "div",
              null,
              h("div", null, t.name),
              h("div", { class: "muted", style: { fontSize: "0.78rem" } }, t.description),
              unlocks.length ? h("div", { class: "mono", style: { fontSize: "0.72rem", color: "var(--lavender)" } }, `Unlocks parts: ${unlocks.join(", ")}`) : null,
              h("div", { class: "muted mono", style: { fontSize: "0.72rem" } }, t.requires.length ? `Requires: ${t.requires.map(name).join(", ")}` : "No prerequisites"),
            ),
            done.has(t.id)
              ? h("span", { class: "tag" }, "Done")
              : ready
                ? h("button", { class: "btn small", disabled: !affordable, title: affordable ? "Spend research points" : "Not enough research points", onclick: () => research(t.id, t.cost) }, `${t.cost} RP`)
                : h("span", { class: "tag warn", title: "Research the prerequisites first" }, "Locked"),
          );
        }),
      ),
    ),
  );

  return gameShell(
    "research",
    h(
      "div",
      { class: "grid" },
      h("div", { class: "hq-head" }, h("h2", null, "Research & Technology"), h("div", { class: "panel hud stat" }, h("span", { class: "label" }, "Research points"), h("span", { class: "value" }, String(game.researchPoints)))),
      h("p", { class: "muted" }, "Complete missions to earn research points, then spend them here to unlock new parts for the Hangar."),
      h("div", { class: "grid cols-2" }, ...seasons),
    ),
  );
}
