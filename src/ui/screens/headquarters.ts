import { h } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { BUDGET_CATEGORIES, formatUsd } from "../../budget/budget";
import { SEASONS } from "../../campaign/seasons";
import { reputationTier, seasonProgress } from "../../campaign/reputation";
import { DEMO_ACTIVE_MISSIONS, DEMO_ACTIVE_RESEARCH, DEMO_ACTIVITY } from "../../demo/demoData";
import { MISSIONS, missionsForSeason } from "../../missions/missions";
import { TECHS } from "../../research/tech";
import { createEarthMoonWidget } from "../../scene/earthMoon";
import { gameShell } from "../layout";
import { session } from "../session";

const SVG_NS = "http://www.w3.org/2000/svg";
const DONUT_COLORS = ["#b8a6e8", "#7563b5", "#d8d9e0", "#8f9de8", "#a07fd6", "#6f7fb8", "#c9b8f0"];

function bar(pct: number, label: string): HTMLElement {
  const p = Math.max(0, Math.min(100, pct));
  return h("div", { class: "bar", role: "progressbar", "aria-valuenow": Math.round(p), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": label }, h("span", { style: { width: `${p}%` } }));
}

function stat(label: string, value: string, sub: string, pct?: number): HTMLElement {
  return h(
    "div",
    { class: "panel hud stat" },
    h("span", { class: "label" }, label),
    h("span", { class: "value" }, value),
    pct !== undefined ? bar(pct, label) : null,
    h("span", { class: "muted mono", style: { fontSize: "0.72rem" } }, sub),
  );
}

function demoBadge(): HTMLElement {
  return h("span", { class: "demo-badge", title: "Sample data. Not part of your saved game." }, "Demo data");
}

function svgText(x: string, y: string, cls: string, text: string): SVGElement {
  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("x", x);
  t.setAttribute("y", y);
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("class", cls);
  t.textContent = text;
  return t;
}

function donut(planned: number[], centerTop: string, centerBottom: string): SVGElement {
  const r = 44;
  const c = 2 * Math.PI * r;
  const total = planned.reduce((a, b) => a + b, 0) || 1;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Budget allocation by category");
  svg.classList.add("donut");
  let offset = 0;
  planned.forEach((value, i) => {
    const len = (value / total) * c;
    const seg = document.createElementNS(SVG_NS, "circle");
    seg.setAttribute("cx", "60");
    seg.setAttribute("cy", "60");
    seg.setAttribute("r", String(r));
    seg.setAttribute("fill", "none");
    seg.setAttribute("stroke", DONUT_COLORS[i % DONUT_COLORS.length]);
    seg.setAttribute("stroke-width", "12");
    seg.setAttribute("stroke-dasharray", `${Math.max(len - 1.5, 0)} ${c}`);
    seg.setAttribute("stroke-dashoffset", String(-offset));
    seg.setAttribute("transform", "rotate(-90 60 60)");
    svg.append(seg);
    offset += len;
  });
  svg.append(svgText("60", "58", "donut-top", centerTop), svgText("60", "73", "donut-bottom", centerBottom));
  return svg;
}

function navCard(title: string, sub: string, status: string, onclick: () => void): HTMLElement {
  return h("button", { class: "panel hud card nav-card", onclick }, h("span", { class: "nc-title" }, title), h("span", { class: "muted" }, sub), h("span", { class: "tag" }, status));
}

export function headquarters(): HTMLElement {
  const game = store.get().game;
  if (!game) {
    return gameShell("hq", h("div", { class: "notice" }, "No active game. Start a new campaign from the main menu."));
  }

  const season = SEASONS.find((s) => s.id === game.season) ?? SEASONS[0];
  const seasonMissions = MISSIONS.filter((m) => m.season === game.season);
  const seasonDone = game.completedMissions.filter((id) => seasonMissions.some((m) => m.id === id)).length;
  const seasonPct = seasonProgress(seasonMissions.map((m) => m.id), game.completedMissions) * 100;
  const available = missionsForSeason(game.season).filter((m) => !game.completedMissions.includes(m.id));
  const tier = reputationTier(game.reputation);
  const spentTotal = BUDGET_CATEGORIES.reduce((sum, c) => sum + game.allocation[c.id].spent, 0);
  const spentPct = game.annualBudget ? (spentTotal / game.annualBudget) * 100 : 0;
  const repPct = tier.next ? ((game.reputation - tier.min) / (tier.next - tier.min)) * 100 : 100;

  const seasonTechs = TECHS.filter((t) => t.season <= game.season);
  const nextTechs = seasonTechs.filter((t) => !game.researchedTech.includes(t.id) && t.requires.every((r) => game.researchedTech.includes(r))).slice(0, 3);

  // The globe is built once so toggling demo data does not restart the WebGL scene.
  const globeHost = h("div", { class: "globe" });
  const globePanel = h(
    "div",
    { class: "panel hud globe-panel" },
    globeHost,
    h("div", { class: "globe-caption mono" }, h("span", null, "EARTH–MOON SYSTEM"), h("span", { class: "muted" }, "384,400 km mean distance · simplified view")),
  );
  const widget = createEarthMoonWidget(globeHost);
  router.onLeave(() => widget.dispose());

  const clock = h("span", { class: "mono clock" }, "");
  const tick = () => {
    clock.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
  };
  tick();
  const timer = window.setInterval(tick, 1000);
  router.onLeave(() => clearInterval(timer));

  const body = h("div", { class: "grid" });

  const render = () => {
    const demo = session.showDemo;
    const activeMissions = demo ? DEMO_ACTIVE_MISSIONS : game.activeMissions;
    const research = demo ? DEMO_ACTIVE_RESEARCH : game.activeResearch;
    const researchTech = research ? TECHS.find((t) => t.id === research.techId) : undefined;

    const toggle = h(
      "button",
      {
        class: "btn ghost small",
        "aria-pressed": String(demo),
        title: "Preview the dashboard with invented sample data. Your saved game is not changed.",
        onclick: () => {
          session.showDemo = !session.showDemo;
          render();
        },
      },
      `Demo data: ${demo ? "on" : "off"}`,
    );

    const header = h(
      "div",
      { class: "hq-head" },
      h("div", null, h("h2", null, `${game.agencyName} Headquarters`), h("p", { class: "muted" }, `Season ${season.id}: ${season.name} · Agency year ${game.year}`)),
      h("div", { class: "hq-status mono" }, h("span", { class: "led" }), h("span", null, "SYSTEMS NOMINAL"), clock, toggle),
    );

    const banner = demo
      ? h("div", { class: "notice demo-note" }, "Demo data is on. Dashed panels show invented sample data for preview. Funds, budget, reputation, season and research points always come from your saved game and are not affected.")
      : null;

    const stats = h(
      "div",
      { class: "grid cols-4" },
      stat("Available funds", formatUsd(game.funds), `${formatUsd(spentTotal)} committed this year`, 100 - spentPct),
      stat("Annual budget", formatUsd(game.annualBudget), `Year ${game.year} allocation`),
      stat("Agency reputation", String(game.reputation), tier.next ? `${tier.name} · next tier at ${tier.next}` : `${tier.name} · top tier`, repPct),
      stat("Research points", String(game.researchPoints), `${game.researchedTech.length} of ${seasonTechs.length} season techs done`),
    );

    const seasonPanel = h(
      "div",
      { class: "panel hud" },
      h("h3", null, "Campaign season"),
      h(
        "ol",
        { class: "timeline", "aria-label": "Campaign seasons" },
        ...SEASONS.map((s) =>
          h(
            "li",
            { class: s.id < game.season ? "done" : s.id === game.season ? "current" : "", "aria-current": s.id === game.season ? "step" : null },
            h("span", { class: "node" }),
            h("span", { class: "mono t-num" }, `S${s.id}`),
            h("span", { class: "t-name" }, s.name),
          ),
        ),
      ),
      h("div", { style: { marginTop: "14px" } }, bar(seasonPct, "Season mission progress"), h("p", { class: "muted mono", style: { fontSize: "0.72rem", marginTop: "6px" } }, `${Math.round(seasonPct)}% of Season ${season.id} missions complete (${seasonDone}/${seasonMissions.length})`)),
      h("ul", { class: "list goals" }, ...season.goals.map((g) => h("li", null, g))),
    );

    const planned = BUDGET_CATEGORIES.map((c) => game.allocation[c.id].planned);
    const budgetPanel = h(
      "div",
      { class: "panel hud" },
      h("h3", null, "Annual budget allocation"),
      h(
        "div",
        { class: "budget-wrap" },
        donut(planned, formatUsd(game.annualBudget), "ANNUAL"),
        h(
          "ul",
          { class: "legend" },
          ...BUDGET_CATEGORIES.map((c, i) =>
            h("li", null, h("span", { class: "swatch", style: { background: DONUT_COLORS[i % DONUT_COLORS.length] } }), h("span", { class: "lg-name" }, c.label), h("span", { class: "mono" }, formatUsd(planned[i]))),
          ),
        ),
      ),
    );

    const missionsPanel = h(
      "div",
      { class: `panel hud${demo ? " demo" : ""}` },
      h("h3", null, "Active missions", demo ? demoBadge() : null),
      activeMissions.length
        ? h(
            "ul",
            { class: "list" },
            ...activeMissions.map((m) => {
              const def = MISSIONS.find((d) => d.id === m.missionId);
              return h(
                "li",
                { class: "mission-row" },
                h(
                  "button",
                  {
                    class: "row-btn",
                    onclick: () => {
                      session.selectedMissionId = m.missionId;
                      router.navigate("briefing");
                    },
                  },
                  h("div", { class: "mr-top" }, h("span", null, def?.name ?? m.missionId), h("span", { class: m.status === "nominal" ? "tag" : "tag warn" }, m.status)),
                  h("div", { class: "muted mono", style: { fontSize: "0.72rem" } }, `${m.craftName} · ${m.phase}`),
                  bar(m.progress * 100, `${def?.name ?? m.missionId} progress`),
                ),
              );
            }),
          )
        : h("p", { class: "muted" }, "No missions in flight. Build a spacecraft in the Hangar, then launch from a mission briefing."),
    );

    const researchPanel = h(
      "div",
      { class: `panel hud${demo ? " demo" : ""}` },
      h("h3", null, "Technology development", demo ? demoBadge() : null),
      researchTech && research
        ? h(
            "div",
            { class: "grid", style: { gap: "6px", marginBottom: "12px" } },
            h("div", null, h("strong", null, researchTech.name), h("span", { class: "muted" }, ` · ${researchTech.description}`)),
            bar((research.progress / researchTech.cost) * 100, `${researchTech.name} research progress`),
            h("span", { class: "muted mono", style: { fontSize: "0.72rem" } }, `${research.progress} / ${researchTech.cost} research points`),
          )
        : h("p", { class: "muted", style: { marginBottom: "12px" } }, "No research in progress."),
      h("h3", { style: { margin: "4px 0 8px" } }, "Ready to research"),
      nextTechs.length
        ? h("ul", { class: "list" }, ...nextTechs.map((t) => h("li", null, h("span", null, t.name), h("span", { class: "tag warn" }, `${t.cost} RP`))))
        : h("p", { class: "muted" }, "Nothing available right now."),
    );

    const activity = demo
      ? h("div", { class: "panel hud demo" }, h("h3", null, "Agency activity", demoBadge()), h("ul", { class: "list" }, ...DEMO_ACTIVITY.map((a) => h("li", null, a))))
      : null;

    const nav = h(
      "div",
      { class: "grid cols-4" },
      navCard("Spacecraft Hangar", "Design and assemble vehicles", "Phase 5", () => router.navigate("hangar")),
      navCard("Solar System Map", "Choose destinations and routes", "Phase 4", () => router.navigate("map")),
      navCard("Research & Technology", "Technology tree", "Read-only", () => router.navigate("research")),
      navCard("Mission Briefing", available[0] ? `Review ${available[0].name}` : "No missions available", "Read-only", () => {
        session.selectedMissionId = session.selectedMissionId ?? available[0]?.id ?? null;
        router.navigate("briefing");
      }),
    );

    body.replaceChildren(
      header,
      ...(banner ? [banner] : []),
      stats,
      h("div", { class: "grid cols-2 hq-mid" }, globePanel, seasonPanel),
      h("div", { class: "grid cols-2" }, budgetPanel, h("div", { class: "grid" }, missionsPanel, ...(activity ? [activity] : []))),
      researchPanel,
      nav,
    );
  };
  render();

  return gameShell("hq", body);
}
