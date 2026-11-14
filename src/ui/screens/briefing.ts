import { h } from "../../core/dom";
import { router } from "../../core/router";
import { formatUsd } from "../../budget/budget";
import { MISSIONS, missionsForSeason } from "../../missions/missions";
import { store } from "../../core/store";
import { gameShell } from "../layout";
import { session } from "../session";

const CAPABILITY_LABEL: Record<string, string> = {
  power: "Power generation",
  communications: "Communications",
  navigation: "Navigation",
  landing: "Landing system",
  "heat-shield": "Heat shield",
  "science-payload": "Science payload",
};

export function briefingScreen(): HTMLElement {
  const game = store.get().game;
  const list = game ? missionsForSeason(game.season) : MISSIONS.slice(0, 2);
  const mission = list.find((m) => m.id === session.selectedMissionId) ?? MISSIONS.find((m) => m.id === session.selectedMissionId) ?? list[0];

  const picker = h(
    "div",
    { class: "panel hud" },
    h("h3", null, "Missions"),
    h(
      "ul",
      { class: "list" },
      ...list.map((m) =>
        h(
          "li",
          null,
          h(
            "button",
            {
              class: "row-btn",
              "aria-current": m.id === mission.id ? "true" : null,
              onclick: () => {
                session.selectedMissionId = m.id;
                router.navigate("briefing");
              },
            },
            h("span", null, m.name),
            h("span", { class: "tag" }, `D${m.difficulty}`),
          ),
        ),
      ),
    ),
  );

  const details = h(
    "div",
    { class: "panel hud grid" },
    h("div", null, h("h2", null, mission.name), h("p", { class: "muted" }, `${mission.destination} · Season ${mission.season}`)),
    h("p", null, mission.description),
    h("div", null, h("h3", null, "Scientific purpose"), h("p", { class: "muted", style: { marginTop: "6px" } }, mission.sciencePurpose)),
    h("div", null, h("h3", null, "Objectives"), h("ul", { class: "list" }, ...mission.objectives.map((o) => h("li", null, o)))),
    h(
      "div",
      { class: "grid cols-3" },
      h("div", { class: "stat" }, h("span", { class: "label" }, "Required delta-v"), h("span", { class: "value" }, `${(mission.requiredDeltaV / 1000).toFixed(1)} km/s`)),
      h("div", { class: "stat" }, h("span", { class: "label" }, "Estimated cost"), h("span", { class: "value" }, formatUsd(mission.costUsd))),
      h("div", { class: "stat" }, h("span", { class: "label" }, "Potential reward"), h("span", { class: "value" }, formatUsd(mission.rewardUsd))),
    ),
    h("div", null, h("h3", null, "Required capabilities"), h("p", { class: "muted mono", style: { marginTop: "6px", fontSize: "0.8rem" } }, `Payload of at least ${mission.minPayloadKg} kg · ${mission.requiredCapabilities.map((c) => CAPABILITY_LABEL[c] ?? c).join(" · ")}`)),
    h("p", { class: "muted", style: { fontSize: "0.72rem" } }, "Delta-v figures are simplified teaching values, not flight-grade numbers."),
    h("div", { class: "notice" }, "Launch is not available yet. You need a spacecraft from the Hangar (Phase 5) and the flight simulation (Phase 7) first."),
  );

  return gameShell("briefing", h("div", { class: "grid briefing" }, picker, details));
}
