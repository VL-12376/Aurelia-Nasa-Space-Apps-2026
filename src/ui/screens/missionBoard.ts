import { h, toast } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { formatUsd, trySpend } from "../../budget/budget";
import { Flight, hashSeed, launchBlockers } from "../../missions/flight";
import { MISSIONS, type MissionDef } from "../../missions/missions";
import { REAL_PARALLELS } from "../../data/real";
import { profileFor, type Phase } from "../../missions/profiles";
import { capacityCheck, LAUNCHERS, OWN_ROCKET } from "../../launch/vehicles";
import { launchGate } from "../../missions/launchGate";
import { orbitsFor, planExtraDv } from "../../missions/orbits";
import { phasesFor, resolvePlan, type MissionPlan } from "../../missions/plan";
import { currentSpaceWeather } from "../../net/weatherCache";
import { PlanetPortrait } from "../../scene/planetPortrait";
import type { BodyId } from "../../science/bodies";
import { analyse, type Design } from "../../spacecraft/design";
import { gameShell } from "../layout";
import { session } from "../session";
import { mp } from "../../net/session";
import { chatDock } from "../crew";

function bodyFor(m: MissionDef): BodyId {
  const d = m.destination.toLowerCase();
  if (d.includes("moon")) return "moon";
  if (d.includes("mars")) return "mars";
  if (d.includes("outer")) return "jupiter";
  return "earth";
}

const CATEGORY_LABEL: Record<string, string> = {
  satellite: "Satellite deployment",
  "earth-observation": "Earth observation",
  "lunar-orbit": "Lunar orbit",
  "lunar-landing": "Lunar landing",
  rover: "Rover deployment",
  "mars-orbit": "Mars orbital exploration",
  "mars-landing": "Mars landing",
  "sample-return": "Sample collection",
  "deep-space": "Deep-space exploration",
};

function fmtDuration(s: number): string {
  if (s >= 86_400 * 60) return `${(s / (86_400 * 365.25)).toFixed(1)} years`;
  if (s >= 86_400 * 2) return `${Math.round(s / 86_400)} days`;
  if (s >= 3_600) return `${(s / 3_600).toFixed(1)} hours`;
  return `${Math.round(s / 60)} min`;
}

function phaseValue(p: Phase): string {
  return p.kind === "burn" ? `${p.deltaV.toLocaleString("en-US")} m/s` : fmtDuration(p.durationS);
}

/** Events a pilot should expect, derived from what the flight plan contains. */
function risksFor(phases: Phase[]): { title: string; body: string }[] {
  const has = (f: (p: Phase) => boolean) => phases.some(f);
  const out = [
    { title: "Engine anomaly during ascent", body: "A booster engine can fail. A cluster of two or more can survive losing one if thrust-to-weight allows." },
  ];
  if (has((p) => p.id === "mcc")) out.push({ title: "Trajectory error", body: "Navigation errors grow with distance. Better navigation hardware and an early correction both save propellant." });
  if (has((p) => p.kind === "coast" || p.kind === "ops")) out.push({ title: "Communications dropout", body: "Larger antennas fail less. A second antenna lets you recover at once." });
  if (has((p) => p.kind === "coast" && p.durationS > 86_400)) out.push({ title: "Solar flare", body: "Safe mode protects the electronics but costs time. Staying operational risks instrument damage." });
  if (has((p) => p.id === "descent" || p.id === "edl")) out.push({ title: "Landing hazard", body: "Boulders and slopes can destroy a lander. Spare propellant lets you divert to a safer site." });
  if (has((p) => p.id === "entry")) out.push({ title: "Atmospheric entry heating", body: "Heavy vehicles on small heat shields fall too fast through Mars' thin air." });
  if (has((p) => p.kind === "ops" && !!p.science)) out.push({ title: "Instrument fault", body: "Instruments can freeze. A quick reboot or a full diagnostic trades time against reliability." });
  out.push({ title: "Power shortage", body: "If batteries run flat the computer resets. Size batteries for the eclipse and panels for the load." });
  return out;
}

export function missionBoard(): HTMLElement {
  const remote = mp.active;
  const g0 = remote ? mp.room!.game : store.get().game;
  if (!g0) return gameShell("briefing", h("div", { class: "notice" }, "No active game. Start a new campaign from the main menu."));
  const game = () => (remote ? mp.room!.game : store.get().game!);
  const isController = () => !remote || mp.role === "controller" || (!mp.room!.players.some((p) => p.role === "controller") && mp.isHost);

  const visible = MISSIONS;
  const preferred = remote ? mp.room!.missionId : session.selectedMissionId;
  let selected: MissionDef = visible.find((m) => m.id === preferred) ?? visible.find((m) => m.season <= g0.season && !g0.completedMissions.includes(m.id)) ?? visible[0];
  session.selectedMissionId = selected.id;

  const portraitHost = h("div", { class: "mb-portrait" });
  const portrait = new PlanetPortrait(portraitHost);
  router.onLeave(() => portrait.dispose());

  const listEl = h("div", { class: "mb-list" });
  const detailEl = h("div", { class: "mb-detail" });

  function pick(m: MissionDef): void {
    selected = m;
    session.selectedMissionId = m.id;
    session.selectedCraftId = null;
    if (remote && isController() && m.season <= game().season) mp.send({ t: "mission", id: m.id });
    renderList();
    renderDetail();
  }

  function renderList(): void {
    const g = game();
    const seasons = [1, 2, 3, 4];
    listEl.replaceChildren(
      ...seasons.map((s) => {
        const missions = visible.filter((m) => m.season === s);
        const locked = s > g.season;
        return h(
          "div",
          { class: `mb-season${locked ? " locked" : ""}` },
          h("h3", null, `Season ${s}${locked ? " · locked" : ""}`),
          ...missions.map((m) => {
            const done = g.completedMissions.includes(m.id);
            return h(
              "button",
              { class: `mb-card${m.id === selected.id ? " sel" : ""}`, onclick: () => pick(m) },
              h("div", { class: "mb-card-top" }, h("strong", null, m.name), done ? h("span", { class: "tag" }, "Done ✓") : h("span", { class: "tag" }, `D${m.difficulty}`)),
              h("div", { class: "muted mono small" }, `${CATEGORY_LABEL[m.category]} · ${m.destination}`),
              h("div", { class: "muted mono small" }, `${formatUsd(m.costUsd)} → ${formatUsd(m.rewardUsd)}`),
            );
          }),
        );
      }),
    );
  }

  function renderDetail(): void {
    const g = game();
    const m = selected;
    const phases = profileFor(m);
    portrait.show(bodyFor(m));
    const locked = m.season > g.season;

    const fleet = g.fleet;
    const craft = fleet.find((c) => c.id === session.selectedCraftId) ?? fleet[0] ?? null;
    if (craft) session.selectedCraftId = craft.id;
    const design: Design | null = craft ? { name: craft.name, parts: craft.parts } : null;
    const plan = remote ? undefined : g.plans?.[m.id];
    const gate = design ? launchGate(design, m, plan, g.funds, g.sandbox) : null;
    const stats = gate?.stats ?? null;
    const checks = gate?.checks ?? [];
    const blockers = launchBlockers(checks);
    const canLaunch = !!design && blockers.length === 0 && !locked;
    const resolved = resolvePlan(m, plan);
    const effCost = m.costUsd + resolved.launchCostUsd;

    const craftSelect = fleet.length
      ? h(
          "select",
          { "aria-label": "Spacecraft", onchange: (e: Event) => { session.selectedCraftId = (e.target as HTMLSelectElement).value; renderDetail(); } },
          ...fleet.map((c) => h("option", { value: c.id, selected: c.id === craft?.id }, `${c.name} · Δv ${(c.deltaV / 1000).toFixed(2)} km/s · ${Math.round(c.payloadKg)} kg`)),
        )
      : null;

    const burnTotal = phases.reduce((n, p) => (p.kind === "burn" ? n + p.deltaV : n), 0);

    fill2(
      detailEl,
      h(
        "div",
        { class: "panel hud mb-head" },
        h("div", { class: "mb-portrait-wrap" }, portraitHost),
        h(
          "div",
          { class: "mb-head-text" },
          h("div", { class: "muted mono small" }, `SEASON ${m.season} · ${CATEGORY_LABEL[m.category].toUpperCase()}`),
          h("h2", null, m.name),
          h("p", { class: "muted" }, `${m.destination} · difficulty ${m.difficulty} of 5`),
          h("p", null, m.description),
          h("div", { class: "mb-nums" }, num("Operations cost", formatUsd(m.costUsd)), num("Potential reward", formatUsd(m.rewardUsd)), num("Reputation", `+${m.reputationReward}`), num("Delta-v budget", `${(burnTotal / 1000).toFixed(1)} km/s`)),
        ),
      ),
      h(
        "div",
        { class: "grid cols-2" },
        h("div", { class: "panel hud" }, h("h3", null, "Scientific purpose"), h("p", null, m.sciencePurpose), h("h3", { style: { margin: "14px 0 8px" } }, "Objectives"), h("ul", { class: "list" }, ...m.objectives.map((o) => h("li", null, h("span", null, o))))),
        h("div", { class: "panel hud" }, h("h3", null, "Known risks"), h("ul", { class: "risks" }, ...risksFor(phases).map((r) => h("li", null, h("strong", null, r.title), h("p", { class: "muted small" }, r.body))))),
        REAL_PARALLELS[m.id]
          ? h(
              "div",
              { class: "panel hud real-parallel" },
              h("h3", null, "In the real world"),
              h("strong", null, `${REAL_PARALLELS[m.id].name} (${REAL_PARALLELS[m.id].year})`),
              h("p", null, REAL_PARALLELS[m.id].text),
              h("ul", { class: "list" }, ...REAL_PARALLELS[m.id].facts.map(([k, v]) => h("li", null, h("span", { class: "muted" }, k), h("span", null, v)))),
              h("p", { class: "muted small" }, `Flew on ${REAL_PARALLELS[m.id].vehicle}. Details from public-domain records. AURELIA's version is a simplified teaching model.`),
            )
          : null,
      ),
      h(
        "div",
        { class: "panel hud" },
        h("h3", null, "Flight plan"),
        h("p", { class: "muted small" }, "Each burn has a delta-v price. Your spacecraft must carry enough propellant to pay all of them, with margin for surprises."),
        h(
          "ol",
          { class: "plan" },
          ...phasesFor(m, resolved).map((p) =>
            h(
              "li",
              null,
              h("details", null, h("summary", null, h("span", { class: `kind ${p.kind}` }, p.kind === "burn" ? "BURN" : p.kind === "coast" ? "COAST" : "OPS"), h("span", { class: "pl" }, p.label), h("span", { class: "mono muted pv" }, phaseValue(p))), h("p", { class: "small" }, p.explain)),
            ),
          ),
        ),
        h("div", { class: "kv" }, h("span", { class: "k" }, "Total delta-v"), h("span", { class: "v mono" }, `${(burnTotal + resolved.extraDv).toLocaleString("en-US")} m/s`)),
      ),
      remote ? h("div", { class: "panel hud" }, h("h3", null, "Orbit and launch vehicle"), h("p", { class: "muted small" }, "Team missions fly the default orbit on the rocket your team builds. Orbit and launch-vehicle choices are available in single-player and sandbox.")) : planPanel(m, design ? analyse(design).payloadMass : null, plan),
      h(
        "div",
        { class: "panel hud" },
        h("h3", null, "Spacecraft and launch checks"),
        craftSelect ?? h("div", { class: "notice" }, "You have no built spacecraft. Design one in the Hangar and press Build, which pays for it."),
        design && stats
          ? h(
              "div",
              null,
              h("ul", { class: "checks" }, ...checks.map((c) => h("li", { class: c.ok ? "ok" : c.soft ? "warn" : "bad" }, h("span", null, `${c.ok ? "✓" : c.soft ? "!" : "✕"} ${c.label}`), h("span", { class: "mono muted small" }, c.detail)))),
              blockers.length ? h("p", { class: "bad small" }, `Launch blocked: ${blockers.length} requirement${blockers.length > 1 ? "s" : ""} not met. Open the Hangar, where the advisor suggests fixes.`) : h("p", { class: "ok small" }, "All launch requirements met. Warnings marked ! do not block launch but raise the risk."),
            )
          : null,
        h("div", { class: "mb-actions" }, h("button", { class: "btn ghost small", onclick: () => router.navigate("hangar") }, "Open Hangar")),
      ),
      h(
        "div",
        { class: "mb-launch" },
        h("div", { class: "mono small" }, locked ? `Finish Season ${g.season} first to unlock this mission.` : `Funds ${g.sandbox ? "unlimited (sandbox)" : formatUsd(g.funds)} · this mission costs ${formatUsd(effCost)} to operate${resolved.launcher ? ` (including ${resolved.launcher.name} at ${formatUsd(resolved.launchCostUsd)})` : ""}`),
        h("button", { class: "btn", disabled: !canLaunch || !isController(), title: !isController() ? "Only the Mission Controller launches" : canLaunch ? "Start the mission" : locked ? "This season is locked" : blockers[0]?.label ?? "Build a spacecraft first", onclick: () => launch(m, craft!.id, design!) }, isController() ? "Launch mission" : "Waiting for the Mission Controller"),
      ),
    );
  }

  function setPlan(m: MissionDef, patch: { orbit?: string; launcher?: string }): void {
    store.updateGame((gg) => {
      gg.plans = { ...(gg.plans ?? {}), [m.id]: { ...(gg.plans?.[m.id] ?? {}), ...patch } };
    });
    renderDetail();
  }

  /** Orbit and launch-vehicle choices for the selected mission, with the trade-offs spelled out. */
  function planPanel(m: MissionDef, payloadKg: number | null, plan: MissionPlan | undefined): HTMLElement {
    const orbits = orbitsFor(m);
    const r = resolvePlan(m, plan);
    const dvText = (x: number) => (x === 0 ? "reference orbit" : `${x > 0 ? "+" : "−"}${Math.abs(x).toLocaleString("en-US")} m/s`);
    const orbitCards = orbits.map((o) =>
      h(
        "button",
        { class: `plan-opt${o.id === r.orbit.id ? " sel" : ""}`, disabled: orbits.length === 1, "aria-pressed": String(o.id === r.orbit.id), onclick: () => setPlan(m, { orbit: o.id }) },
        h("strong", null, o.label),
        h("span", { class: "muted small" }, o.blurb),
        orbits.length > 1 ? h("span", { class: "mono small" }, `${dvText(planExtraDv(m, o))} · ground contact about ${Math.round(o.contactFraction * 1440)} min/day · up to ${Math.round(o.eclipseHours * 60)} min in shadow`) : null,
        orbits.length > 1 ? h("span", { class: "muted small" }, `Trade-off: ${o.tradeoff}`) : null,
      ),
    );
    const ownCard = h(
      "button",
      { class: `plan-opt${!r.launcher ? " sel" : ""}`, "aria-pressed": String(!r.launcher), onclick: () => setPlan(m, { launcher: OWN_ROCKET }) },
      h("strong", null, "Your own rocket"),
      h("span", { class: "muted small" }, "Fly the stages you designed in the Hangar. Already paid for when you built it."),
    );
    const vehicleCards = LAUNCHERS.map((v) => {
      const cap = payloadKg !== null ? capacityCheck(v, m, r.orbit, payloadKg) : null;
      return h(
        "button",
        { class: `plan-opt${r.launcher?.id === v.id ? " sel" : ""}`, "aria-pressed": String(r.launcher?.id === v.id), onclick: () => setPlan(m, { launcher: v.id }) },
        h("strong", null, v.name, cap ? h("span", { class: `plan-badge ${cap.ok ? "ok" : "bad"}` }, cap.ok ? "FITS" : cap.capacityKg === null ? "NOT RATED" : "TOO SMALL") : null),
        h("span", { class: "muted small" }, `${v.operator}, first flight ${v.firstFlight}. ${v.blurb}`),
        h("span", { class: "mono small" }, `${v.capacityNote} ${v.priceNote}`),
        cap ? h("span", { class: cap.ok ? "small" : "bad small" }, cap.detail) : null,
        h("span", { class: "muted small" }, `Source: ${v.source}. Stage figures are simplified.`),
      );
    });
    return h(
      "div",
      { class: "panel hud" },
      h("h3", null, "Orbit and launch vehicle"),
      h("p", { class: "muted small" }, "There is rarely one perfect answer. A higher orbit costs more delta-v, a bigger rocket costs more money, and each changes how much data you can send home and how long the mission lasts."),
      h("h4", null, "Orbit"),
      h("div", { class: "plan-opts" }, ...orbitCards),
      h("h4", null, "Launch vehicle"),
      h("div", { class: "plan-opts" }, ownCard, ...vehicleCards),
      h("p", { class: "muted small" }, "Catalogue vehicles use published figures from launch-service guides and public-domain records, simplified to a few stages. Only your spacecraft section is used on a catalogue vehicle."),
    );
  }

  function launch(m: MissionDef, craftId: string, design: Design): void {
    const g = game();
    const plan = remote ? undefined : g.plans?.[m.id];
    const gate = launchGate(design, m, plan, g.funds, g.sandbox);
    if (launchBlockers(gate.checks).length) return toast("The launch checks are not all met.");
    if (remote) {
      mp.send({ t: "mission", id: m.id });
      mp.send({ t: "launch", craftId });
      return;
    }
    const seed = hashSeed(`${craftId}:${m.id}:${g.flights}`);
    store.updateGame((gg) => {
      gg.funds = trySpend(gg.funds, gg.allocation, "operations", gate.mission.costUsd).funds;
      gg.fleet = gg.fleet.filter((c) => c.id !== craftId);
      gg.flights += 1;
    });
    session.flight = new Flight(design, m, seed, { plan, difficulty: g.difficulty, sandbox: g.sandbox, crewEvents: true, ...currentSpaceWeather() });
    session.flightMissionId = m.id;
    session.flightSeed = seed;
    session.flightApplied = false;
    session.selectedCraftId = null;
    router.navigate("control");
  }

  renderList();
  renderDetail();
  if (remote) {
    let lastRoom = mp.room;
    const off = mp.subscribe(() => {
      const r = mp.room;
      if (!r || r === lastRoom) return;
      const moved = r.missionId !== lastRoom?.missionId;
      lastRoom = r;
      if (moved && r.missionId) {
        const m = MISSIONS.find((x) => x.id === r.missionId);
        if (m) {
          selected = m;
          session.selectedMissionId = m.id;
        }
      }
      renderList();
      renderDetail();
    });
    const offErr = mp.onError((m) => toast(m));
    router.onLeave(() => {
      off();
      offErr();
    });
  }
  return gameShell("briefing", h("div", { class: "mb" }, listEl, detailEl, remote ? chatDock() : null));
}

function num(label: string, value: string): HTMLElement {
  return h("div", { class: "stat" }, h("span", { class: "label" }, label), h("span", { class: "value", style: { fontSize: "1.05rem" } }, value));
}

function fill2(el: HTMLElement, ...children: (Node | null)[]): void {
  el.replaceChildren(...children.filter((c): c is Node => c !== null));
}
