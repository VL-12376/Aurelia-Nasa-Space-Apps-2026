import { h } from "../../core/dom";
import { store } from "../../core/store";
import { TECHS } from "../../research/tech";
import { gameShell } from "../layout";

export function researchScreen(): HTMLElement {
  const game = store.get().game;
  const done = new Set(game?.researchedTech ?? []);
  const name = (id: string) => TECHS.find((t) => t.id === id)?.name ?? id;

  const seasons = [1, 2, 3, 4].map((s) =>
    h(
      "div",
      { class: "panel" },
      h("h3", null, `Season ${s}`),
      h(
        "ul",
        { class: "list" },
        ...TECHS.filter((t) => t.season === s).map((t) =>
          h(
            "li",
            null,
            h(
              "div",
              null,
              h("div", null, t.name),
              h("div", { class: "muted", style: { fontSize: "0.78rem" } }, t.description),
              h("div", { class: "muted mono", style: { fontSize: "0.72rem" } }, t.requires.length ? `Requires: ${t.requires.map(name).join(", ")}` : "No prerequisites"),
            ),
            h("span", { class: done.has(t.id) ? "tag" : "tag warn" }, done.has(t.id) ? "Done" : `${t.cost} RP`),
          ),
        ),
      ),
    ),
  );

  return gameShell(
    "research",
    h(
      "div",
      { class: "grid" },
      h("h2", null, "Research & Technology"),
      h("div", { class: "notice" }, "This is a read-only view of the technology tree. Spending research points and unlocking components arrives in Phase 8."),
      h("div", { class: "grid cols-2" }, ...seasons),
    ),
  );
}
