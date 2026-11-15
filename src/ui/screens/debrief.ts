import { h } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { formatUsd } from "../../budget/budget";
import { MISSIONS } from "../../missions/missions";
import { gameShell } from "../layout";
import { mp } from "../../net/session";

const fmtT = (s: number) => {
  const d = Math.floor(s / 86_400);
  const hh = Math.floor((s % 86_400) / 3_600);
  const mm = Math.floor((s % 3_600) / 60);
  return d > 0 ? `${d}d ${hh}h` : `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

export function debriefScreen(): HTMLElement {
  const remote = mp.active;
  const g = remote ? mp.room?.game : store.get().game;
  const rep = g?.lastFlight;
  const mission = rep ? MISSIONS.find((m) => m.id === rep.missionId) : undefined;
  if (!g || !rep || !mission) {
    return gameShell("briefing", h("div", { class: "grid" }, h("h2", null, "Mission Debrief"), h("div", { class: "notice" }, "No finished mission to review yet. Fly a mission and its debrief will appear here."), h("div", null, h("button", { class: "btn", onclick: () => router.navigate("briefing") }, "Open missions"))));
  }
  const o = rep.outcome;
  const stat = (label: string, value: string, tone = "") => h("div", { class: `panel hud stat ${tone}` }, h("span", { class: "label" }, label), h("span", { class: "value", style: { fontSize: "1.3rem" } }, value));

  const fix: string[] = [];
  if (o.result !== "success") {
    if (o.dvMarginPct < 5) fix.push("Add propellant or a better engine in the Hangar. The advisor shows the best tank to add.");
    if (rep.log.some((l) => /engine/i.test(l.text) && l.tone === "bad")) fix.push("Use two or more booster engines so one failure does not end the mission.");
    if (rep.log.some((l) => /navigation|trajectory/i.test(l.text) && l.tone === "bad")) fix.push("Fit an inertial platform (research Guidance) and correct errors early.");
    if (rep.log.some((l) => /battery|power|brown/i.test(l.text) && l.tone !== "info")) fix.push("Add a bigger battery and enough solar panel for the instruments.");
    if (!fix.length) fix.push("Review the mission log below, then adjust the design and try again.");
  }

  const body = h(
    "div",
    { class: "grid deb" },
    h(
      "div",
      { class: `panel hud deb-head ${o.result}` },
      h("div", { class: "muted mono small" }, `MISSION DEBRIEF · ${rep.craftName.toUpperCase()} · AGENCY YEAR ${rep.year}`),
      h("h2", null, `${mission.name}: ${o.headline}`),
      o.failReason ? h("p", { class: "bad" }, o.failReason) : h("p", { class: "muted" }, o.result === "success" ? "Every objective was achieved." : "The spacecraft survived, but not every objective was completed."),
    ),
    h(
      "div",
      { class: "grid cols-4" },
      stat("Funding earned", o.fundsEarned > 0 ? `+${formatUsd(o.fundsEarned)}` : "$0", o.fundsEarned > 0 ? "ok" : "bad"),
      stat("Reputation", `${o.reputation >= 0 ? "+" : ""}${o.reputation}`, o.reputation >= 0 ? "ok" : "bad"),
      stat("Research points", `+${o.researchPoints}`),
      stat("Experience", `+${o.experience}`),
    ),
    h(
      "div",
      { class: "grid cols-2" },
      h("div", { class: "panel hud" }, h("h3", null, "Objectives"), h("ul", { class: "list" }, ...o.objectives.map((x) => h("li", { class: x.done ? "ok" : "bad" }, h("span", null, `${x.done ? "✓" : "✕"} ${x.text}`))))),
      h(
        "div",
        { class: "panel hud" },
        h("h3", null, "Performance"),
        kv("Delta-v delivered", `${Math.round(o.dvDelivered).toLocaleString("en-US")} m/s`),
        kv("Delta-v budget", `${o.dvBudget.toLocaleString("en-US")} m/s`),
        kv("Margin left", `${o.dvMarginPct.toFixed(1)}%`),
        kv("Propellant left", `${o.propellantLeftPct.toFixed(0)}%`),
        o.scienceApplicable ? kv("Science return", `${o.scienceScore}%`) : kv("Science return", "Not applicable"),
        kv("Operations cost", formatUsd(mission.costUsd)),
      ),
    ),
    o.events?.length
      ? h(
          "div",
          { class: "panel hud" },
          h("h3", null, "Decisions and consequences"),
          h("ul", { class: "lessons" }, ...o.events.map((e) => h("li", { class: e.tone }, h("strong", null, `${e.title}: `), `you chose "${e.choice}". `, e.text))),
        )
      : null,
    h("div", { class: "panel hud" }, h("h3", null, "Engineering lessons"), h("ul", { class: "lessons" }, ...o.lessons.map((l) => h("li", null, l)))),
    o.result !== "success" ? h("div", { class: "panel hud" }, h("h3", null, "What to change"), h("ul", { class: "lessons" }, ...fix.map((l) => h("li", null, l)))) : null,
    h("details", { class: "panel hud" }, h("summary", null, "Full mission log"), h("ul", { class: "mc-log full" }, ...rep.log.map((l) => h("li", { class: l.tone }, h("span", { class: "mono muted" }, fmtT(l.t)), h("span", null, l.text))))),
    remote
      ? h("div", { class: "mb-actions" }, mp.isHost ? h("button", { class: "btn", onclick: () => mp.send({ t: "toHangar" }) }, "Back to the hangar for the next mission") : h("span", { class: "muted small" }, "Waiting for the host to return the crew to the hangar."), h("button", { class: "btn ghost small", onclick: () => { mp.leave(); router.navigate("menu"); } }, "Leave room"))
      : h(
          "div",
          { class: "mb-actions" },
          h("button", { class: "btn", onclick: () => router.navigate("hq") }, "Return to headquarters"),
          h("button", { class: "btn ghost", onclick: () => router.navigate("hangar") }, "Open hangar"),
          h("button", { class: "btn ghost", onclick: () => router.navigate("briefing") }, "More missions"),
        ),
  );
  return gameShell("briefing", body);
}

function kv(k: string, v: string): HTMLElement {
  return h("div", { class: "kv" }, h("span", { class: "k" }, k), h("span", { class: "v mono" }, v));
}
