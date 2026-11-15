import { h } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { ROLES } from "../../crew/roles";
import { roleCard } from "../crew";
import { session } from "../session";


/** Single-player: choose the crew member you play. The other three are AI crew. */
export function rolesScreen(): HTMLElement {
  const start = (role: (typeof ROLES)[number]["id"] | "all") => {
    store.startNewGame("single", session.pendingSeason, role, { difficulty: session.pendingDifficulty, sandbox: session.pendingSandbox });
    router.navigate("hq");
  };
  return h(
    "main",
    { class: "screen" },
    h(
      "div",
      { class: "mode-grid wide" },
      h("div", { class: "back-row" }, h("button", { class: "btn ghost small", onclick: () => router.navigate("mode") }, "Back"), h("h2", null, "Choose your role")),
      h("p", { class: "muted", style: { maxWidth: "720px" } }, "A spacecraft programme is a team effort. Pick the crew member you want to be. The other three are played by AI crew who make their own decisions during missions, and who you can ask to help design the spacecraft."),
      h("div", { class: "role-grid" }, ...ROLES.map((r) => roleCard(r, { onclick: () => start(r.id), footer: h("span", { class: "btn small" }, `Play as ${r.name.split(" ").slice(-1)[0]}`) }))),
      h("div", { class: "role-all" }, h("p", { class: "muted small" }, "Prefer to run everything yourself? You can play all four roles at once, with no AI crew."), h("button", { class: "btn ghost", onclick: () => start("all") }, "Play all four roles")),
    ),
  );
}
