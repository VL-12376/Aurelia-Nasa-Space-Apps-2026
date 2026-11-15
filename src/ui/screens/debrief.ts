import { h } from "../../core/dom";
import { DIFFICULTY_BY_ID } from "../../core/play";
import type { FlightReport } from "../../core/gameState";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { formatUsd, formatUsdExact } from "../../budget/budget";
import { MISSIONS } from "../../missions/missions";
import { gameShell } from "../layout";
import { submitFlight } from "../../net/leaderboard";
import { mp } from "../../net/session";

/** Flights already sent to the global leaderboard, so one flight is submitted once. */
const submitted = new Set<string>();

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
    scorePanel(rep, !!remote, !!g.sandbox),
    o.funding ? h(
      "div", { class: "panel hud" }, h("h3", null, "Funding and response accuracy"),
      kv("Base mission award", formatUsdExact(o.funding.baseAwardUsd)),
      kv("Response accuracy", `${o.funding.accuracyPct}%`),
      kv("Accuracy multiplier", `${o.funding.accuracyMultiplier.toFixed(2)}x`),
      kv("Missed-check penalty", `${o.funding.checkPenaltyPct}%`),
      kv("Credited to agency budget", formatUsdExact(o.fundsEarned)),
      kv("Available budget now", formatUsdExact(g.funds)),
      h("p", { class: "muted small" }, "Objectives, science and reliability set the base award. Manual timing accuracy and missed responses determine the accuracy multiplier (0.50 to 1.00); each missed station check deducts another 3%. Other choices affect funding through their mission consequences. Funding is added back to the agency's spending categories."),
    ) : null,
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
    o.plan && o.resources
      ? h(
          "div",
          { class: "panel hud" },
          h("h3", null, "Mission plan and resources"),
          kv("Orbit", o.plan.orbit),
          kv("Launch vehicle", o.plan.launcher),
          kv("Difficulty", `${DIFFICULTY_BY_ID[o.plan.difficulty].label}${o.plan.sandbox ? " (sandbox)" : ""}`),
          kv("Data returned to Earth", `${o.resources.dataReturnPct}%`),
          kv("Lifetime", `${o.resources.lifetimeDays} days of ${o.resources.lifetimeNeededDays} wanted`),
          kv("Mass margin", `${o.resources.massMarginPct}%`),
          kv("Power margin", `${o.resources.powerMarginPct}%`),
        )
      : null,
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
      ? h("div", { class: "mb-actions" }, mp.isHost ? h("button", { class: "btn", onclick: () => mp.send({ t: "toHangar" }) }, "Return crew to headquarters") : h("button", { class: "btn", onclick: () => router.navigate("hq") }, "Return to headquarters"), h("button", { class: "btn ghost", onclick: () => router.navigate("leaderboard") }, "View leaderboard"), h("button", { class: "btn ghost small", onclick: () => { mp.leave(); router.navigate("menu"); } }, "Leave room"))
      : h(
          "div",
          { class: "mb-actions" },
          h("button", { class: "btn", onclick: () => router.navigate("hq") }, "Return to headquarters"),
          h("button", { class: "btn ghost", onclick: () => router.navigate("hangar") }, "Open hangar"),
          h("button", { class: "btn ghost", onclick: () => router.navigate("briefing") }, "More missions"),
          h("button", { class: "btn ghost", onclick: () => router.navigate("leaderboard") }, "View leaderboard"),
        ),
  );
  return gameShell("briefing", body);
}

/** The score breakdown, plus (single-player only) the form that sends it to the global leaderboard. */
function scorePanel(rep: FlightReport, remote: boolean, sandbox: boolean): HTMLElement | null {
  const o = rep.outcome;
  const sc = o.score;
  const sandboxed = o.plan?.sandbox ?? sandbox;
  if (!sc) {
    return !remote && sandboxed ? h("div", { class: "panel hud" }, h("h3", null, "Mission score"), h("p", { class: "muted" }, "Sandbox missions are not ranked."), h("button", { class: "btn small", disabled: true }, "Submit to the global leaderboard")) : null;
  }
  const difficulty = o.plan?.difficulty ?? store.get().game?.difficulty ?? "engineer";
  const def = DIFFICULTY_BY_ID[difficulty];
  const raw = sc.parts.reduce((s, p) => s + p.points, 0);

  const head = h(
    "div",
    { class: "sc-head" },
    h("span", { class: "sc-total" }, String(sc.total)),
    h("span", { class: "sc-rank" }, sc.rank),
    h("span", { class: "muted small mono" }, `${raw} points × ${def.scoreMult.toFixed(1)} (${def.label} difficulty)`),
  );
  const parts = h(
    "div",
    { class: "sc-parts" },
    ...sc.parts.map((p) => h("div", { class: "sc-part" }, h("span", null, p.label), h("div", { class: "bar" }, h("span", { style: { width: `${Math.round((p.points / p.max) * 100)}%` } })), h("span", { class: "pts" }, `${p.points}/${p.max}`))),
  );

  let footer: HTMLElement;
  if (remote) {
    footer = h("p", { class: "muted small" }, "The server computed this result, so it is on the global leaderboard as a verified team score.");
  } else {
    const key = `${rep.seed}:${rep.missionId}:${rep.craftName}`;
    const msg = h("span", { class: "sc-msg small", role: "status" });
    const input = h("input", { type: "text", maxlength: "20", value: store.get().settings.playerName, placeholder: "Your name", "aria-label": "Name for the leaderboard" });
    const button = h("button", { class: "btn small" }, "Submit to the global leaderboard");
    const done = () => {
      button.disabled = true;
      input.disabled = true;
    };
    if (submitted.has(key)) {
      done();
      msg.className = "sc-msg small ok";
      msg.textContent = "Submitted. See it on the leaderboard.";
    }
    input.addEventListener("change", () => store.updateSettings({ playerName: input.value.trim().slice(0, 20) }));
    button.addEventListener("click", async () => {
      const name = input.value.trim();
      if (!name) {
        msg.className = "sc-msg small bad";
        msg.textContent = "Enter a name first.";
        return;
      }
      store.updateSettings({ playerName: name.slice(0, 20) });
      if (!rep.replay) {
        msg.className = "sc-msg small bad";
        msg.textContent = "This flight was not recorded, so the server cannot score it. Fly another mission to rank.";
        return;
      }
      button.disabled = true;
      msg.className = "sc-msg small muted";
      msg.textContent = "Sending… the server will re-fly your mission and score it. A sleeping server can take up to a minute.";
      const sent = await submitFlight(name, rep.replay);
      if (sent.ok) {
        submitted.add(key);
        done();
        msg.className = "sc-msg small ok";
        msg.textContent = `Verified. The server re-flew your mission and scored it ${sent.score}. It is on the leaderboard.`;
      } else {
        button.disabled = false;
        msg.className = "sc-msg small bad";
        msg.textContent = sent.unreachable ? "The leaderboard server isn't answering right now. Your score is saved on this device; you can try again in a minute." : sent.error;
      }
    });
    footer = h("div", { class: "sc-submit" }, h("label", { class: "sc-name" }, h("span", { class: "muted small" }, "Name"), input), button, msg, h("p", { class: "muted small" }, "Scores on the leaderboard are calculated by the server: it replays your flight from its recorded seed and decisions rather than trusting a number from your browser."));
  }
  return h("div", { class: "panel hud" }, h("h3", null, "Mission score"), head, parts, footer);
}

function kv(k: string, v: string): HTMLElement {
  return h("div", { class: "kv" }, h("span", { class: "k" }, k), h("span", { class: "v mono" }, v));
}
