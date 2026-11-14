import { h } from "../../core/dom";
import { router } from "../../core/router";

const ROLES = [
  { name: "Aerospace Engineer", focus: "Spacecraft structure, mass and configuration." },
  { name: "Propulsion Engineer", focus: "Engines, fuel and propulsion performance." },
  { name: "Mission Controller", focus: "Trajectory, navigation and mission planning." },
  { name: "Science & Systems Officer", focus: "Scientific objectives, payload and spacecraft systems." },
];

export function multiplayerScreen(): HTMLElement {
  return h(
    "main",
    { class: "screen" },
    h(
      "div",
      { class: "mode-grid" },
      h("div", { class: "back-row" }, h("button", { class: "btn ghost small", onclick: () => router.navigate("menu") }, "Back"), h("h2", null, "Multiplayer")),
      h(
        "div",
        { class: "notice" },
        "Multiplayer is not available yet. The real-time session server is planned for Phase 9, so there is no lobby to join or create. The roles below show how a four-player mission will be split.",
      ),
      h("div", { style: { height: "16px" } }),
      h(
        "div",
        { class: "grid cols-2" },
        ...ROLES.map((r, i) =>
          h("div", { class: "panel" }, h("h3", null, `Role ${i + 1}`), h("h2", { style: { fontSize: "1.1rem", margin: "6px 0" } }, r.name), h("p", { class: "muted" }, r.focus)),
        ),
      ),
    ),
  );
}
