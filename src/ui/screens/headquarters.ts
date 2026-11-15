import { h } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { BUDGET_CATEGORIES, formatUsd } from "../../budget/budget";
import { SEASONS } from "../../campaign/seasons";
import { reputationTier, seasonProgress } from "../../campaign/reputation";
import { ROLES } from "../../crew/roles";
import { REAL_PARALLELS } from "../../data/real";
import { MISSIONS, missionsForSeason } from "../../missions/missions";
import { TECHS } from "../../research/tech";
import { createEarthMoonWidget } from "../../scene/earthMoon";
import { gameShell } from "../layout";
import { session } from "../session";
import { avatar } from "../crew";
import { countUp } from "../fx";
import { historyCard, liveSpaceCard } from "../liveCard";

const FACTS = [
  "LOW EARTH ORBIT SPEED ≈ 7.8 km/s",
  "ORBIT PERIOD AT 400 km ≈ 92 min",
  "GEOSTATIONARY ORBIT ≈ 35,786 km",
  "EARTH ESCAPE VELOCITY ≈ 11.2 km/s",
  "EARTH–MOON DISTANCE ≈ 384,400 km",
  "RADIO DELAY TO THE MOON ≈ 1.3 s",
  "SOLAR CONSTANT AT EARTH ≈ 1,361 W/m²",
  "SURFACE GRAVITY ≈ 9.81 m/s²",
];

function reticle(): SVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const el = (tag: string, attrs: Record<string, string>) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const svg = el("svg", { viewBox: "-100 -100 200 200", "aria-hidden": "true" }) as SVGElement;
  const a = el("g", { class: "ret-a", fill: "none", stroke: "#b8a6e8", "stroke-width": "0.35" });
  a.append(el("circle", { r: "96", "stroke-dasharray": "2 3" }), el("circle", { r: "88", "stroke-opacity": "0.5" }));
  for (let i = 0; i < 72; i++) {
    const ang = (i / 72) * Math.PI * 2;
    const len = i % 6 === 0 ? 5 : 2.2;
    a.append(el("line", { x1: String(Math.cos(ang) * 96), y1: String(Math.sin(ang) * 96), x2: String(Math.cos(ang) * (96 - len)), y2: String(Math.sin(ang) * (96 - len)) }));
  }
  const b = el("g", { class: "ret-b", fill: "none", stroke: "#7fe0ff", "stroke-width": "0.4" });
  b.append(el("path", { d: "M -70 0 A 70 70 0 0 1 0 -70", "stroke-opacity": "0.8" }), el("path", { d: "M 70 0 A 70 70 0 0 1 0 70", "stroke-opacity": "0.8" }), el("circle", { r: "62", "stroke-dasharray": "1 4", "stroke-opacity": "0.5" }));
  svg.append(a, b);
  return svg;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const DONUT_COLORS = ["#b8a6e8", "#7563b5", "#d8d9e0", "#8f9de8", "#a07fd6", "#6f7fb8", "#c9b8f0"];

function bar(pct: number, label: string, tone = ""): HTMLElement {
  const p = Math.max(0, Math.min(100, pct));
  return h("div", { class: `bar ${tone}`, role: "progressbar", "aria-valuenow": Math.round(p), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": label }, h("span", { style: { width: `${p}%` } }));
}

function svgText(y: string, cls: string, text: string): SVGElement {
  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("x", "60");
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
  svg.append(svgText("58", "donut-top", centerTop), svgText("73", "donut-bottom", centerBottom));
  return svg;
}

const fmtDv = (v: number) => `${(v / 1000).toFixed(1)} km/s`;

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
  const repPct = tier.next ? ((game.reputation - tier.min) / (tier.next - tier.min)) * 100 : 100;
  const seasonTechs = TECHS.filter((t) => t.season <= game.season);
  const nextTechs = seasonTechs.filter((t) => !game.researchedTech.includes(t.id) && t.requires.every((r) => game.researchedTech.includes(r))).slice(0, 4);
  const last = game.lastFlight;
  const lastMission = last ? MISSIONS.find((m) => m.id === last.missionId) : undefined;

  // The globe is built once so re-rendering the panels does not restart the WebGL scene.
  const globeHost = h("div", { class: "hq3-globe" });
  const widget = createEarthMoonWidget(globeHost);
  router.onLeave(() => widget.dispose());

  const clock = h("span", { class: "mono" }, "");
  const tick = () => {
    clock.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
  };
  tick();
  const timer = window.setInterval(tick, 1000);
  router.onLeave(() => clearInterval(timer));

  const left = h("aside", { class: "hq3-col hq3-left", "aria-label": "Mission status" });
  const right = h("aside", { class: "hq3-col hq3-right", "aria-label": "Agency" });
  const topChips = h("div", { class: "hq3-chips" });
  const headline = h("div", { class: "hq3-title" });
  const bottom = h("div", { class: "hq3-bottom" });

  const card = (title: string, ...children: (Node | null)[]) => h("section", { class: "hq3-card" }, h("h4", null, title), ...children.filter((c): c is Node => c !== null));

  const chip = (label: string, num: number, fmt: (n: number) => string, sub: string, pct?: number) => {
    const value = h("span", { class: "hq3-chip-v mono" }, fmt(num));
    countUp(value, num, fmt);
    return h("div", { class: "hq3-chip" }, h("span", { class: "hq3-chip-l" }, label), value, pct !== undefined ? bar(pct, label) : null, h("span", { class: "hq3-chip-s mono" }, sub));
  };

  const render = () => {
    widget.setCraft(Math.max(1, Math.min(8, game.fleet.length + game.flights)));

    headline.replaceChildren(
      h("h2", null, `${game.agencyName} Headquarters`),
      h("p", { class: "muted" }, `Season ${season.id}: ${season.name} · Agency year ${game.year}`),
      h("div", { class: "hq3-status mono" }, h("span", { class: "led" }), h("span", null, "SYSTEMS NOMINAL"), clock),
    );

    const int = (n: number) => String(Math.round(n));
    topChips.replaceChildren(
      chip("Available funds", game.funds, (n) => formatUsd(n), `${formatUsd(spentTotal)} committed`, game.annualBudget ? (game.funds / game.annualBudget) * 100 : 0),
      chip("Reputation", game.reputation, int, tier.name, repPct),
      chip("Research points", game.researchPoints, int, `${game.researchedTech.length}/${seasonTechs.length} techs`),
      chip("Spacecraft ready", game.fleet.length, int, `${game.flights} flown`),
    );

    /* ----- left: your programme, with real-world context ----- */
    const next = available[0];
    const parallel = next ? REAL_PARALLELS[next.id] : undefined;

    left.replaceChildren(
      card(
        "Mission status",
        last && lastMission
          ? h("div", { class: `hq3-last ${last.outcome.result}` }, h("span", { class: "mono small muted" }, "LAST FLIGHT"), h("strong", null, `${lastMission.name}: ${last.outcome.headline}`), h("span", { class: "mono small" }, `${last.craftName} · ${last.outcome.fundsEarned > 0 ? `+${formatUsd(last.outcome.fundsEarned)}` : "no funding"} · rep ${last.outcome.reputation >= 0 ? "+" : ""}${last.outcome.reputation}`), h("button", { class: "btn ghost small", onclick: () => router.navigate("debrief") }, "Open debrief"))
          : h("p", { class: "muted small" }, "No missions flown yet. Your first mission is waiting below."),
        next
          ? h(
              "button",
              { class: "row-btn", onclick: () => { session.selectedMissionId = next.id; router.navigate("briefing"); } },
              h("div", { class: "mr-top" }, h("span", null, `Next: ${next.name}`), h("span", { class: "tag" }, `D${next.difficulty}`)),
              parallel ? h("div", { class: "muted small" }, `A real mission like it: ${parallel.name} (${parallel.year})`) : null,
            )
          : h("p", { class: "ok small" }, "Every mission in this season is complete."),
      ),
      card(
        "Hangar bay",
        game.fleet.length
          ? h("ul", { class: "hq3-list" }, ...game.fleet.map((c) => h("li", { class: "hq3-row" }, h("span", null, c.name), h("span", { class: "mono muted small" }, `${fmtDv(c.deltaV)} · ${Math.round(c.payloadKg)} kg`))))
          : h("p", { class: "muted small" }, "Nothing built yet."),
        h("button", { class: "btn small", onclick: () => router.navigate("hangar") }, game.fleet.length ? "Open hangar" : "Design a spacecraft"),
      ),
      card(
        `Season ${season.id} progress`,
        bar(seasonPct, "Season mission progress"),
        h("p", { class: "muted mono small" }, `${Math.round(seasonPct)}% complete (${seasonDone}/${seasonMissions.length} missions)`),
        h("ul", { class: "hq3-goals" }, ...season.goals.map((g) => h("li", null, g))),
      ),
      historyCard(),
    );

    /* ----- right: agency ----- */
    const planned = BUDGET_CATEGORIES.map((c) => game.allocation[c.id].planned);
    right.replaceChildren(
      card(
        "Annual budget",
        h(
          "div",
          { class: "hq3-budget" },
          donut(planned, formatUsd(game.annualBudget), "ANNUAL"),
          h("ul", { class: "legend" }, ...BUDGET_CATEGORIES.map((c, i) => h("li", null, h("span", { class: "swatch", style: { background: DONUT_COLORS[i % DONUT_COLORS.length] } }), h("span", { class: "lg-name" }, c.label), h("span", { class: "mono" }, formatUsd(planned[i]))))),
        ),
      ),
      card(
        "Reputation",
        h("div", { class: "kv" }, h("span", { class: "k" }, tier.name), h("span", { class: "v mono" }, String(game.reputation))),
        bar(repPct, "Progress to next reputation tier"),
        h("p", { class: "muted mono small" }, tier.next ? `Next tier at ${tier.next}` : "Top tier reached"),
      ),
      liveSpaceCard(),
      card(
        "Technology",
        h("h5", null, "Ready to research"),
        nextTechs.length ? h("ul", { class: "hq3-list" }, ...nextTechs.map((t) => h("li", { class: "hq3-row" }, h("span", null, t.name), h("span", { class: game.researchPoints >= t.cost ? "tag" : "tag warn" }, `${t.cost} RP`)))) : h("p", { class: "muted small" }, "Nothing available right now."),
        h("button", { class: "btn ghost small", onclick: () => router.navigate("research") }, "Open research"),
      ),
    );

    /* ----- bottom of the globe: crew and shortcuts ----- */
    const mine = game.role;
    bottom.replaceChildren(
      h(
        "div",
        { class: "hq3-crew", "aria-label": "Crew" },
        ...ROLES.map((r) => {
          const me = mine === null || mine === "all" || mine === r.id;
          return h("div", { class: `hq3-face${me ? " me" : ""}`, style: { "--rc": r.color }, title: `${r.name}, ${r.title}` }, avatar(r, me), h("span", { class: "mono" }, me ? "YOU" : "AI"));
        }),
      ),
      h(
        "div",
        { class: "hq3-actions" },
        h("button", { class: "btn small", onclick: () => { session.selectedMissionId = session.selectedMissionId ?? available[0]?.id ?? null; router.navigate("briefing"); } }, "Missions"),
        h("button", { class: "btn small ghost", onclick: () => router.navigate("hangar") }, "Hangar"),
        h("button", { class: "btn small ghost", onclick: () => router.navigate("map") }, "Solar system"),
      ),
    );
  };
  render();

  const centre = h(
    "section",
    { class: "hq3-centre", "aria-label": "Earth and Moon" },
    globeHost,
    h("div", { class: "hq3-reticle" }, reticle()),
    h("div", { class: "hq3-overlay top" }, headline, topChips),
    h(
      "div",
      { class: "hq3-overlay bottom" },
      h("div", { class: "hq3-ticker mono", "aria-label": "Reference values" }, h("span", null, `${FACTS.join("   ◆   ")}   ◆   ${FACTS.join("   ◆   ")}   ◆   `)),
      h("div", { class: "hq3-caption mono" }, h("span", null, "EARTH–MOON SYSTEM"), h("span", { class: "muted" }, "Procedural model, not satellite imagery · orbits are illustrative")),
      bottom,
    ),
  );

  return gameShell("hq", h("div", { class: "hq3" }, left, centre, right), { fill: true });
}
