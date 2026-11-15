import { h } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { formatUsd } from "../../budget/budget";
import { aiDecide, crewName, ownerOf } from "../../crew/ai";
import { canLaunch, ROLE_BY_ID, ROLES, type RoleChoice, type RoleId } from "../../crew/roles";
import type { Flight, FlightLike, Telemetry } from "../../missions/flight";
import { mp } from "../../net/session";
import { audio } from "../../audio/engine";
import { firstSentence, speak, stopSpeaking } from "../../audio/voice";
import { miniGame } from "../minigame";
import { RemoteFlight } from "../../net/remoteFlight";
import { chatDock, crewStrip, type CrewRow } from "../crew";
import { hohmannState, R_EARTH, R_MARS, R_MOON } from "../../missions/kinematics";
import { MISSIONS } from "../../missions/missions";
import { applyOutcome } from "../../missions/results";
import { MissionScene } from "../../scene/missionScene";
import { gameShell } from "../layout";
import { session } from "../session";
import { ascentQ, COUNTDOWN_FROM, createCalloutTracker, gLoad, LAUNCH_POLL, type Callout } from "../launchSequence";

const SVG = "http://www.w3.org/2000/svg";
const AU_KM = 1.496e8;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const fmtMet = (s: number) => {
  const d = Math.floor(s / 86_400);
  const hh = Math.floor((s % 86_400) / 3_600);
  const mm = Math.floor((s % 3_600) / 60);
  const ss = Math.floor(s % 60);
  const t = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return d > 0 ? `T+ ${d}d ${t}` : `T+ ${t}`;
};
const fmtKm = (km: number) => (km >= 1e6 ? `${(km / 1e6).toFixed(1)} M km` : `${Math.round(km).toLocaleString("en-US")} km`);
const fmtDelay = (s: number) => (s < 1 ? "<1 s" : s < 90 ? `${s.toFixed(1)} s` : `${(s / 60).toFixed(1)} min`);

function banner(t: Telemetry): string {
  if (t.status === "LOST") return "SIGNAL LOST";
  if (t.status === "COMPLETE") return "MISSION COMPLETE";
  const map: Record<string, string> = {
    ascent: "ASCENT ACTIVE", "earth-orbit": "ORBIT STABLE", "moon-transfer": "LUNAR TRANSFER ACTIVE", "moon-orbit": "LUNAR ORBIT",
    "moon-descent": "LUNAR DESCENT", helio: "INTERPLANETARY CRUISE", "mars-orbit": "MARS ORBIT", "mars-descent": "MARS DESCENT",
  };
  return map[t.view] ?? "FLIGHT ACTIVE";
}

export function missionControl(): HTMLElement {
  const remote = mp.active;
  const flight: FlightLike | null = remote ? (mp.flight ? new RemoteFlight() : null) : session.flight;
  const mission = remote ? flight?.mission : MISSIONS.find((m) => m.id === session.flightMissionId);
  if (!flight || !mission) {
    const msg = remote ? "Waiting for the first flight data from the server…" : "No mission is in progress. Choose a mission, check your spacecraft and launch from the Missions screen.";
    const waiting = gameShell("briefing", h("div", { class: "grid" }, h("h2", null, "Mission Control"), h("div", { class: "notice" }, msg), remote ? null : h("div", null, h("button", { class: "btn", onclick: () => router.navigate("briefing") }, "Open missions"))));
    if (remote) {
      // The room announces the flight a moment before its first snapshot arrives, so swap in the real screen then.
      const off = mp.subscribe(() => {
        if (mp.flight && waiting.isConnected) {
          off();
          waiting.replaceWith(missionControl());
        }
      });
      router.onLeave(off);
    }
    return waiting;
  }
  const f: FlightLike = flight;
  const reduced = store.get().settings.reducedMotion;
  const myRole: RoleChoice | null = remote ? mp.role : store.get().game?.role ?? null;
  const canTime = !remote || canLaunch(myRole);
  const crew = crewStrip();
  const crewLines = new Map<RoleId, string>();
  let speaker: RoleId | null = null;
  let speakerUntil = 0;

  const view = h("div", { class: "mc-view" });
  const scene = new MissionScene(view, f.design, reduced);

  /* ----- top ----- */
  const titleEl = h("div", { class: "mc-title" }, h("strong", null, mission.name), h("span", { class: "muted mono" }, `${f.design.name || "Spacecraft"} · ${mission.destination}`));
  const phaseEl = h("div", { class: "mc-phase" });
  const phaseBar = h("div", { class: "bar" }, h("span", { style: { width: "0%" } }));
  const metEl = h("div", { class: "mc-met mono" }, "T+ 00:00:00");
  const statusEl = h("div", { class: "mc-status mono" });
  const top = h("div", { class: "mc-top" }, titleEl, h("div", { class: "mc-phase-wrap" }, phaseEl, phaseBar), h("div", { class: "mc-top-right" }, metEl, statusEl));

  /* ----- left: objectives + timeline ----- */
  const objEl = h("div", { class: "mc-card" });
  const planEl = h("div", { class: "mc-card mc-plan" });
  const left = h("div", { class: "mc-left" }, objEl, planEl, crew.el);

  /* ----- right: telemetry ----- */
  const bannerEl = h("div", { class: "mc-banner mono" });
  const reading = (label: string) => {
    const v = h("span", { class: "mc-rv mono" }, "—");
    return { el: h("div", { class: "mc-read" }, h("span", { class: "mc-rl" }, label), v), v };
  };
  const rAlt = reading("ALT");
  const rVel = reading("VEL");
  const rDist = reading("DIST EARTH");
  const rDelay = reading("LINK DELAY");
  const rMass = reading("MASS");
  const rThr = reading("THRUST");
  const reads = h("div", { class: "mc-reads" }, rAlt.el, rVel.el, rDist.el, rDelay.el, rMass.el, rThr.el);

  const stageBars = f.telemetry().fuel.map((s) => {
    const fill = h("span", { style: { width: "100%" } });
    const val = h("span", { class: "mono muted" }, "100%");
    return { label: s.label, fill, val, el: h("div", { class: "mc-fuel" }, h("span", { class: "mc-fl" }, s.label), h("div", { class: "bar" }, fill), val) };
  });
  const fuelEl = h("div", { class: "mc-card" }, h("h4", null, "Propellant"), ...stageBars.map((b) => b.el));
  const dvEl = h("div", { class: "mc-dv mono" });
  const powEl = h("div", { class: "mc-pow mono small" });
  const battFill = h("span", { style: { width: "100%" } });
  const plotEl = h("div", { class: "mc-plot" });
  const right = h("div", { class: "mc-right" }, bannerEl, reads, plotEl, fuelEl, h("div", { class: "mc-card" }, h("h4", null, "Delta-v and power"), dvEl, powEl, h("div", { class: "bar" }, battFill)));

  /* ----- bottom: explanation, log, controls ----- */
  const explainEl = h("div", { class: "mc-explain" });
  const logEl = h("ul", { class: "mc-log" });
  let paused = false;
  let manual: number | null = null;
  const speedBtns: HTMLButtonElement[] = [];
  const mkSpeed = (label: string, value: number | null | "pause") => {
    const b = h(
      "button",
      {
        class: "h-tool",
        "aria-pressed": "false",
        disabled: !canTime,
        title: canTime ? undefined : `Only the Mission Controller (${ROLE_BY_ID.controller.name}) sets the time rate`,
        onclick: () => {
          if (remote) {
            mp.send({ t: "time", mode: value === "pause" ? "pause" : value === null ? "auto" : value });
            return;
          }
          if (value === "pause") paused = !paused;
          else {
            manual = value;
            paused = false;
          }
          refreshSpeed();
        },
      },
      label,
    );
    speedBtns.push(b);
    return { b, value };
  };
  const speeds = [mkSpeed("❚❚ Pause", "pause"), mkSpeed("1×", 1), mkSpeed("10×", 10), mkSpeed("100×", 100), mkSpeed("Auto", null)];
  function refreshSpeed(): void {
    if (remote && mp.flight) {
      paused = mp.flight.paused;
      manual = mp.flight.warp === "auto" ? null : mp.flight.warp;
    }
    speeds.forEach(({ b, value }) => b.setAttribute("aria-pressed", String(value === "pause" ? paused : !paused && manual === value)));
  }
  refreshSpeed();
  const controls = h("div", { class: "mc-controls", role: "group", "aria-label": "Time controls" }, h("span", { class: "mc-cl mono" }, "TIME"), ...speeds.map((s) => s.b));
  const bottom = h("div", { class: "mc-bottom" }, h("div", { class: "mc-card grow" }, h("h4", null, "What is happening"), explainEl), h("div", { class: "mc-card grow2" }, h("h4", null, "Mission log"), logEl), controls);

  /* ----- overlays ----- */
  const decision = h("div", { class: "mc-overlay", hidden: true });
  const ending = h("div", { class: "mc-overlay end", hidden: true });
  const pre = h("div", { class: "mc-pre", role: "status", "aria-live": "polite", hidden: true });
  const calloutEl = h("div", { class: "mc-callout", role: "status", "aria-live": "polite", hidden: true });

  const root = h("main", { class: "screen mc" }, view, top, left, right, bottom, pre, calloutEl, decision, ending);

  /* ----- plotting ----- */
  let trail: [number, number][] = [];
  let trailKey = "";
  const S = 220;
  const C = S / 2;

  function plot(t: Telemetry): SVGElement {
    const s = svg("svg", { viewBox: `0 0 ${S} ${S}`, role: "img", "aria-label": "Trajectory plot" });
    s.append(svg("rect", { x: 0, y: 0, width: S, height: S, fill: "rgba(8,10,28,0.0)" }));
    const grid = svg("g", { stroke: "rgba(127,200,255,0.10)", "stroke-width": 1 });
    for (let i = 1; i < 6; i++) {
      grid.append(svg("line", { x1: (S / 6) * i, y1: 0, x2: (S / 6) * i, y2: S }), svg("line", { x1: 0, y1: (S / 6) * i, x2: S, y2: (S / 6) * i }));
    }
    s.append(grid);
    const dot = (x: number, y: number, r: number, fill: string, extra: Record<string, string | number> = {}) => s.append(svg("circle", { cx: C + x, cy: C - y, r, fill, ...extra }));
    const ring = (r: number, stroke = "rgba(184,166,232,0.45)", dash = "") => s.append(svg("circle", { cx: C, cy: C, r, fill: "none", stroke, "stroke-width": 1, ...(dash ? { "stroke-dasharray": dash } : {}) }));
    let cx = 0;
    let cy = 0;

    const k = t.kin;
    if (k.frame === "Sun" || t.view === "helio") {
      const outer = f.mission.destination.toLowerCase().includes("outer");
      const targetAu = outer ? 5.203 : 1.524;
      const scale = 98 / (targetAu * 1.08);
      dot(0, 0, 5, "#ffcf6b", { filter: "url(#glow)" });
      ring(scale, "rgba(127,200,255,0.4)", "3 3");
      ring(scale * targetAu, "rgba(240,160,100,0.4)", "3 3");
      const pts: string[] = [];
      for (let i = 0; i <= 60; i++) {
        const st = hohmannState(1, targetAu, 1, i / 60);
        pts.push(`${C + st.r * Math.cos(st.nu) * scale},${C - st.r * Math.sin(st.nu) * scale}`);
      }
      s.append(svg("polyline", { points: pts.join(" "), fill: "none", stroke: "rgba(184,166,232,0.7)", "stroke-width": 1.2 }));
      const e = k.earthSun ?? [1, 0];
      dot(e[0] * scale, e[1] * scale, 3.5, "#6fa8ff");
      const tgt = k.marsSun ?? (outer ? [-targetAu, 0] : [-targetAu, 0]);
      dot(tgt[0] * scale, tgt[1] * scale, outer ? 5 : 3.5, outer ? "#d9b88a" : "#e8956a");
      if (k.frame === "Sun") {
        cx = (k.pos[0] / AU_KM) * scale;
        cy = (k.pos[1] / AU_KM) * scale;
      } else {
        cx = e[0] * scale;
        cy = e[1] * scale;
      }
    } else if (k.frame === "Earth" && t.view === "moon-transfer") {
      const scale = 96 / (384_400 * 1.05);
      dot(0, 0, 5, "#6fa8ff");
      ring(384_400 * scale, "rgba(200,200,220,0.25)", "2 3");
      const pts: string[] = [];
      for (let i = 0; i <= 60; i++) {
        const st = hohmannState(R_EARTH + 300, 384_400, 398_600, i / 60);
        pts.push(`${C + st.r * Math.cos(st.nu) * scale},${C - st.r * Math.sin(st.nu) * scale}`);
      }
      s.append(svg("polyline", { points: pts.join(" "), fill: "none", stroke: "rgba(184,166,232,0.7)", "stroke-width": 1.2 }));
      if (k.moon) dot(k.moon[0] * scale, k.moon[1] * scale, 4, "#c9c9d6");
      cx = k.pos[0] * scale;
      cy = k.pos[1] * scale;
    } else {
      const radius = k.frame === "Earth" ? R_EARTH : k.frame === "Moon" ? R_MOON : R_MARS;
      const color = k.frame === "Earth" ? "#4f85ff" : k.frame === "Moon" ? "#a9a6b2" : "#c9693a";
      dot(0, 0, 50, color, { opacity: 0.85 });
      ring(58, "rgba(184,166,232,0.35)", "3 3");
      const ang = Math.atan2(k.pos[1], k.pos[0]);
      const altCap = k.frame === "Earth" ? 400 : 120;
      const r = 50 + Math.min(Math.max(k.altKm, 0), altCap) / altCap * 8;
      cx = Math.cos(ang) * r;
      cy = Math.sin(ang) * r;
      void radius;
    }

    const key = `${t.view}|${k.frame}`;
    if (key !== trailKey) {
      trail = [];
      trailKey = key;
    }
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last[0] - cx, last[1] - cy) > 0.8) trail.push([cx, cy]);
    if (trail.length > 160) trail.shift();
    if (trail.length > 1) s.append(svg("polyline", { points: trail.map((p) => `${C + p[0]},${C - p[1]}`).join(" "), fill: "none", stroke: "#7fe0ff", "stroke-width": 1.6, opacity: 0.9 }));
    s.append(svg("circle", { cx: C + cx, cy: C - cy, r: 7, fill: "none", stroke: "#7fe0ff", "stroke-width": 1, opacity: 0.55 }), svg("circle", { cx: C + cx, cy: C - cy, r: 3, fill: "#ffffff" }));
    return s;
  }

  /* ----- HUD updates ----- */
  let lastObj = "";
  let lastPlan = "";
  let lastLog = -1;
  let lastExplain = "";
  let lastStages = -1;
  const tracker = createCalloutTracker();
  let prevMet = -1;
  let prevVel = 0;
  let g = 1;
  let calloutTimer = 0;
  const CALLER: Record<Callout["id"], RoleId> = { liftoff: "controller", "tower-clear": "controller", "mach-1": "aerospace", "max-q": "propulsion", "stage-sep": "propulsion", orbit: "controller" };

  function showCallout(c: Callout): void {
    calloutEl.replaceChildren(h("div", { class: "mc-co-tag mono" }, "FLIGHT CALL-OUT"), h("strong", null, c.title), h("p", null, c.text));
    calloutEl.hidden = false;
    calloutEl.classList.remove("in");
    void calloutEl.offsetWidth;
    calloutEl.classList.add("in");
    say(CALLER[c.id], c.title, false);
    speak(CALLER[c.id], `${c.title}. ${firstSentence(c.text)}`);
    clearTimeout(calloutTimer);
    calloutTimer = window.setTimeout(() => (calloutEl.hidden = true), 9000);
  }
  function updateHud(t: Telemetry): void {
    audio.setThrust(f.status === "running" && t.burning ? 0.35 + Math.min(0.65, t.thrustKn / 6000) : 0);
    const stagesLeft = t.fuel.filter((x) => x.active).length;
    if (lastStages >= 0 && stagesLeft < lastStages) audio.sfx("separation");
    lastStages = stagesLeft;
    phaseEl.textContent = `${t.phaseIndex + 1 > t.phaseCount ? t.phaseCount : t.phaseIndex + 1}/${t.phaseCount} · ${t.phase}`;
    (phaseBar.firstElementChild as HTMLElement).style.width = `${Math.min(100, ((t.phaseIndex + t.phaseProgress) / t.phaseCount) * 100)}%`;
    metEl.textContent = fmtMet(t.met);
    statusEl.textContent = t.status;
    statusEl.dataset.tone = t.status === "NOMINAL" || t.status === "COMPLETE" ? "ok" : t.status === "LOST" ? "bad" : "warn";
    bannerEl.replaceChildren(h("span", { class: "mc-b1" }, banner(t)), h("span", { class: `mc-b2 ${t.status === "NOMINAL" ? "ok" : "warn"}` }, t.status === "NOMINAL" ? "TRAJECTORY ONLINE" : t.status === "ATTENTION" ? "ATTENTION REQUIRED" : t.status));

    rAlt.v.textContent = t.frame === "Sun" ? "—" : `${t.altKm >= 100 ? Math.round(t.altKm).toLocaleString("en-US") : t.altKm.toFixed(1)} km`;
    rVel.v.textContent = `${t.velKms.toFixed(2)} km/s`;
    rDist.v.textContent = fmtKm(t.distEarthKm);
    rDelay.v.textContent = fmtDelay(t.commsDelayS);
    rMass.v.textContent = t.mass >= 10_000 ? `${(t.mass / 1000).toFixed(1)} t` : `${Math.round(t.mass)} kg`;
    rThr.v.textContent = t.burning ? `${Math.round(t.thrustKn).toLocaleString("en-US")} kN` : "0";
    rAlt.el.querySelector(".mc-rl")!.textContent = t.frame === "Sun" ? "FRAME" : `ALT (${t.frame.toUpperCase()})`;
    if (t.frame === "Sun") rAlt.v.textContent = "SUN";
    rVel.el.querySelector(".mc-rl")!.textContent = `VEL (${t.frame.toUpperCase()})`;

    // On the way up, distance and link delay mean little; show what the crew and the structure feel instead.
    const climbing = t.view === "ascent";
    if (climbing) {
      const dtMet = t.met - prevMet;
      if (prevMet >= 0 && dtMet > 1e-3) g += (gLoad(t.velKms - prevVel, dtMet) - g) * 0.3;
      rDist.v.textContent = `${ascentQ(t.altKm, t.velKms).toFixed(1)} kPa`;
      rDelay.v.textContent = `${g.toFixed(1)} g`;
    }
    prevMet = t.met;
    prevVel = t.velKms;
    rDist.el.querySelector(".mc-rl")!.textContent = climbing ? "DYNAMIC PRESSURE" : "DIST EARTH";
    rDelay.el.querySelector(".mc-rl")!.textContent = climbing ? "G-LOAD" : "LINK DELAY";
    for (const c of tracker({ view: t.view, burning: t.burning && !hold, altKm: t.altKm, velKms: t.velKms, stagesActive: stagesLeft })) showCallout(c);

    t.fuel.forEach((fu, i) => {
      const b = stageBars[i];
      if (!b) return;
      (b.fill as HTMLElement).style.width = `${fu.pct}%`;
      b.val.textContent = fu.active ? `${fu.pct.toFixed(0)}%` : "dropped";
      b.el.classList.toggle("gone", !fu.active);
    });
    dvEl.textContent = `Δv left  ${Math.round(t.dvRemaining).toLocaleString("en-US")} m/s`;
    powEl.textContent = `Solar ${Math.round(t.powerGen)} W · load ${Math.round(t.powerDraw)} W · battery ${Math.round(t.batteryPct)}%`;
    (battFill as HTMLElement).style.width = `${t.batteryPct}%`;
    plotEl.replaceChildren(plot(t));

    const obj = f.objectivesState();
    const objKey = JSON.stringify(obj.map((o) => [o.done, o.lost]));
    if (objKey !== lastObj) {
      lastObj = objKey;
      objEl.replaceChildren(h("h4", null, "Objectives"), h("ul", { class: "mc-obj" }, ...obj.map((o) => h("li", { class: o.done ? "done" : o.lost ? "lost" : "" }, h("span", null, o.done ? "✓" : o.lost ? "✕" : "○"), h("span", null, o.text)))));
    }
    const tl = f.timeline();
    const planKey = tl.map((p) => p.state).join();
    if (planKey !== lastPlan) {
      lastPlan = planKey;
      planEl.replaceChildren(h("h4", null, "Flight plan"), h("ol", { class: "mc-tl" }, ...tl.map((p) => h("li", { class: p.state, ...(p.state === "active" ? { "aria-current": "step" } : {}) }, h("span", { class: `dotm ${p.kind}` }), p.label))));
      planEl.querySelector(".active")?.scrollIntoView({ block: "nearest" });
    }
    if (t.explain !== lastExplain) {
      lastExplain = t.explain;
      explainEl.textContent = t.explain;
    }
    const logN = remote && mp.flight ? mp.flight.logLength : f.log.length;
    if (logN !== lastLog) {
      lastLog = logN;
      logEl.replaceChildren(...f.log.slice(-7).map((l) => h("li", { class: l.tone }, h("span", { class: "mono muted" }, fmtMet(l.t).replace("T+ ", "")), h("span", null, l.text))));
    }
    refreshSpeed();
    updateCrew();
  }

  function updateCrew(): void {
    const owner = f.pending ? (remote ? (f.pending.owner as RoleId) : ownerOf(f.pending)) : null;
    const rows: CrewRow[] = ROLES.map((r) => {
      const holder = remote ? mp.room?.players.find((p) => p.role === r.id) : undefined;
      const me = remote ? holder?.id === mp.id : myRole === "all" || myRole === r.id;
      const ai = remote ? !holder : !me;
      return { role: r.id, who: holder?.name ?? "", ai, me, line: crewLines.get(r.id), speaking: owner === r.id || (speaker === r.id && performance.now() < speakerUntil) };
    });
    crew.update(rows);
  }

  function say(role: RoleId, line: string, spoken = true): void {
    crewLines.set(role, line);
    speaker = role;
    speakerUntil = performance.now() + 6000;
    if (spoken) speak(role, line);
  }

  /* ----- decisions and ending ----- */
  let shownDecision = "";
  let aiTimer = 0;
  let countdown: HTMLElement | null = null;
  let decisionTimer = 0;
  function stopDecisionTimer(): void {
    clearInterval(decisionTimer);
    decisionTimer = 0;
  }
  function showDecision(): void {
    const p = f.pending;
    if (!p) return;
    const id = `${p.eventId}@${f.t}`;
    const owner: RoleId = remote ? (p.owner as RoleId) : ownerOf(p);
    if (countdown && p.secondsLeft !== undefined) countdown.textContent = `${Math.max(0, Math.ceil(p.secondsLeft))} s`;
    if (id === shownDecision) return;
    shownDecision = id;
    stopDecisionTimer();
    audio.sfx("alert");
    const mine = remote ? myRole === owner : myRole === "all" || myRole === owner;
    decision.hidden = false;
    if (!mine) {
      const def = ROLE_BY_ID[owner];
      const who = remote ? (p.ownerIsAi ? `${crewName(owner)} (AI crew)` : `${mp.room?.players.find((x) => x.role === owner)?.name ?? def.name} (${def.title})`) : `${crewName(owner)} (${def.title})`;
      countdown = h("span", { class: "mono" }, remote ? `${Math.ceil(p.secondsLeft ?? 0)} s` : "");
      decision.replaceChildren(
        h(
          "div",
          { class: "mc-modal waiting", role: "status", style: { "--rc": def.color } as unknown as Record<string, string> },
          h("div", { class: "mc-modal-tag mono" }, "MISSION CONTROL · TIME PAUSED"),
          h("div", { class: "wait-head" }, h("span", { class: "ai-image-thumb" }, h("img", { src: def.portrait, alt: "" })), h("div", null, h("h2", null, p.title), h("p", { class: "muted" }, `${who} owns this call.`, remote ? " Auto-decides in " : "", remote ? countdown : ""))),
          h("p", null, p.body),
          h("div", { class: "mc-options ro" }, ...p.options.map((o) => h("div", { class: "mc-opt ro" }, h("strong", null, o.label), h("span", { class: "muted small" }, o.disabled ?? o.hint)))),
        ),
      );
      if (!remote) {
        const fl = f as Flight;
        aiTimer = window.setTimeout(() => {
          if (fl.pending?.eventId !== p.eventId) return;
          const pick = aiDecide(fl.pending, fl);
          say(owner, pick.line);
          fl.decide(pick.option);
          decision.hidden = true;
          shownDecision = "";
          updateHud(f.telemetry());
        }, reduced ? 600 : 2600);
      }
      return;
    }
    const total = (p.timeS ?? 30) * (reduced ? 2 : 1);
    const secs = h("span", { class: "mono" }, remote ? `${Math.ceil(p.secondsLeft ?? total)} s` : `${total} s`);
    const fillEl = h("span", { style: { width: "100%" } });
    const timerEl = h("div", { class: "mc-timer", role: "timer" }, h("span", { class: "mono small" }, remote ? "THE CREW AUTO-DECIDES IN " : "RESPOND IN "), secs, remote ? null : h("div", { class: "bar" }, fillEl));
    countdown = remote ? secs : null;
    let mg: { stop(): void } | null = null;
    const modal = h("div", { class: "mc-modal", role: "dialog", "aria-modal": "true", "aria-label": p.title });
    const settle = (optId: string, skill?: number) => {
      stopDecisionTimer();
      mg?.stop();
      f.decide(optId, skill);
      decision.hidden = true;
      if (!remote) shownDecision = "";
      updateHud(f.telemetry());
    };
    const showOptions = () =>
      modal.replaceChildren(
        timerEl,
        h("div", { class: "mc-modal-tag mono" }, "MISSION CONTROL · TIME PAUSED"),
        h("h2", null, p.title),
        h("p", null, p.body),
        h(
          "div",
          { class: "mc-options" },
          ...p.options.map((o) =>
            h(
              "button",
              {
                class: `mc-opt${o.manual ? " manual" : ""}`,
                disabled: !!o.disabled,
                title: o.disabled ?? o.hint,
                onclick: () => {
                  if (!o.manual) return settle(o.id);
                  const game = miniGame({ title: o.label, hint: o.manual, onDone: (score) => settle(o.id, score) });
                  mg = game;
                  modal.replaceChildren(timerEl, game.el);
                },
              },
              h("strong", null, o.label, o.manual ? h("span", { class: "mg-badge mono" }, "MINI-GAME") : null),
              h("span", { class: "muted small" }, o.disabled ?? o.hint),
            ),
          ),
        ),
      );
    showOptions();
    decision.replaceChildren(modal);
    (decision.querySelector(".mc-opt:not([disabled])") as HTMLElement | null)?.focus();

    if (!remote) {
      // Real controllers have seconds, not minutes. If nobody answers, the spacecraft's autonomy takes the default action.
      const deadline = performance.now() + total * 1000;
      decisionTimer = window.setInterval(() => {
        const left = (deadline - performance.now()) / 1000;
        secs.textContent = `${Math.max(0, Math.ceil(left))} s`;
        fillEl.style.width = `${Math.max(0, (left / total) * 100)}%`;
        timerEl.classList.toggle("urgent", left < 5);
        if (left > 0) return;
        stopDecisionTimer();
        mg?.stop();
        const fl = f as Flight;
        if (fl.pending?.eventId !== p.eventId) return;
        audio.sfx("error");
        say(owner, "No answer in time. Autopilot is taking the default action.");
        fl.decideTimeout();
        decision.hidden = true;
        shownDecision = "";
        updateHud(f.telemetry());
      }, 100);
    }
  }

  let endShown = false;
  function showEnd(): void {
    if (endShown || !f.outcome) return;
    endShown = true;
    audio.sfx(f.outcome.result === "failed" ? "failure" : "success");
    if (!remote && !session.flightApplied) {
      session.flightApplied = true;
      store.updateGame((g) => {
        applyOutcome(g, mission!, f.design.name, session.flightSeed, f.outcome!, f.log);
        if (g.lastFlight && !g.sandbox) g.lastFlight.replay = (f as Flight).replayInput();
      });
    }
    const o = f.outcome;
    ending.hidden = false;
    ending.replaceChildren(
      h(
        "div",
        { class: `mc-modal ${o.result}` },
        h("div", { class: "mc-modal-tag mono" }, o.result === "success" ? "MISSION COMPLETE" : o.result === "partial" ? "PARTIAL SUCCESS" : "MISSION LOST"),
        h("h2", null, o.headline),
        o.failReason ? h("p", { class: "bad" }, o.failReason) : h("p", null, `${o.objectives.filter((x) => x.done).length} of ${o.objectives.length} objectives completed.`),
        h("p", { class: "mono" }, `${o.fundsEarned > 0 ? `+${formatUsd(o.fundsEarned)} funding` : "No funding earned"} · reputation ${o.reputation >= 0 ? "+" : ""}${o.reputation}`),
        h("button", { class: "btn", onclick: () => router.navigate("debrief") }, "Open debrief"),
      ),
    );
  }

  /* ----- pre-launch: poll and countdown (single player; in a shared room the server runs the flight) ----- */
  let hold = !remote && f.status === "running" && f.t < 5 && f.telemetry().view === "ascent";
  const preTimers: number[] = [];
  let igniting = false;
  const later = (ms: number, fn: () => void) => preTimers.push(window.setTimeout(fn, reduced ? Math.min(ms, 250) : ms));
  const station: RoleId = myRole === "all" || myRole === null ? "controller" : myRole;

  function releaseHold(): void {
    preTimers.forEach(clearTimeout);
    pre.hidden = true;
    hold = false;
    audio.sfx("launch");
  }

  function runCountdown(): void {
    const tick = (n: number) => {
      pre.replaceChildren(
        h("div", { class: "mc-pre-tag mono" }, "TERMINAL COUNT"),
        h("div", { class: "mc-pre-clock mono" }, n > 0 ? `T−${String(n).padStart(2, "0")}` : "LIFTOFF"),
        h("p", { class: "muted small" }, n > 3 ? "The count is automatic now. Computers watch thousands of readings and can stop it on their own." : n > 0 ? "Main engines start before liftoff so their thrust can be checked while the rocket is still held down." : ""),
      );
      if (n > 0 && n <= 5) audio.sfx("countdown");
      if (n === COUNTDOWN_FROM) speak("controller", "T minus ten");
      else if (n > 0 && n <= 5) speak("controller", String(n));
      else if (n === 0) speak("controller", "Liftoff!");
      if (n === 3) {
        igniting = true;
        audio.sfx("ignite");
      }
      if (n <= 0) {
        later(500, releaseHold);
        return;
      }
      later(1000, () => tick(n - 1));
    };
    tick(COUNTDOWN_FROM);
  }

  function runPoll(i: number, answered: boolean[]): void {
    const rows = LAUNCH_POLL.map((c, k) => {
      const mine = c.role === station;
      const state = answered[k] ? "go" : k === i ? "now" : "wait";
      const status = answered[k] ? h("span", { class: "mc-pre-go mono" }, "GO") : k === i && !mine ? h("span", { class: "mc-pre-wait mono" }, "…") : k === i ? null : h("span", { class: "mc-pre-wait mono" }, "—");
      const action =
        k === i && mine && !answered[k]
          ? h(
              "div",
              { class: "mc-pre-act" },
              h("button", { class: "btn", onclick: () => { answered[k] = true; say(c.role, c.line); audio.sfx("confirm"); runPoll(i + 1, answered); } }, "Call GO"),
              h("button", { class: "btn ghost", onclick: () => { holdNote.hidden = false; audio.sfx("alert"); } }, "Call NO-GO"),
            )
          : null;
      return h("li", { class: state }, h("div", { class: "mc-pre-row" }, h("strong", null, c.station), h("span", { class: "muted small" }, answered[k] ? c.line : k === i ? (mine ? "Your station. What is your call?" : "Checking…") : ""), status), k === i || answered[k] ? h("small", { class: "muted" }, c.why) : null, action);
    });
    const holdNote = h("p", { class: "mc-pre-hold small", hidden: true }, "Hold called. Real countdowns have planned holds so teams can fix a problem calmly. Here nothing is wrong, so call GO when you are ready.");
    pre.replaceChildren(h("div", { class: "mc-pre-tag mono" }, "LAUNCH POLL · EVERY STATION MUST CALL GO"), h("ol", { class: "mc-pre-list" }, ...rows), holdNote, h("button", { class: "btn ghost mc-pre-skip", onclick: () => { audio.sfx("click"); releaseHold(); } }, "Skip to launch"));
    if (i >= LAUNCH_POLL.length) {
      later(700, runCountdown);
      return;
    }
    const c = LAUNCH_POLL[i];
    if (c.role !== station) {
      later(1500, () => {
        answered[i] = true;
        say(c.role, c.line);
        audio.sfx("confirm");
        runPoll(i + 1, answered);
      });
    }
  }

  if (hold) {
    pre.hidden = false;
    later(600, () => runPoll(0, LAUNCH_POLL.map(() => false)));
  }

  /* ----- main loop ----- */
  let last = performance.now();
  let raf = 0;
  let tick = 0;
  let endTimer = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (f.status === "running" && !paused && !hold) {
      const chunk = f.chunkSeconds();
      const warp = manual ?? Math.max(1, Math.min(chunk / (f.telemetry().burning ? 6 : 8), 5e7));
      f.step(dt * warp);
    }
    const raw = f.telemetry();
    // Engines light a few seconds before release: the scene shows the flame, but the rocket is still held down.
    const t = hold ? { ...raw, burning: igniting, thrustKn: igniting ? raw.thrustKn : 0 } : raw;
    if (tick++ % 6 === 0) updateHud(t);
    if (f.status === "decision") showDecision();
    else if (!decision.hidden) {
      decision.hidden = true;
      shownDecision = "";
      countdown = null;
      stopDecisionTimer();
    }
    if ((f.status === "success" || f.status === "partial" || f.status === "failed") && !endTimer) {
      updateHud(t);
      endTimer = window.setTimeout(showEnd, reduced ? 100 : 1600);
    }
  };
  updateHud(f.telemetry());
  if (!hold && f.t < 5) audio.sfx("launch");
  raf = requestAnimationFrame(frame);
  router.onLeave(() => {
    cancelAnimationFrame(raf);
    clearTimeout(endTimer);
    clearTimeout(aiTimer);
    clearTimeout(calloutTimer);
    preTimers.forEach(clearTimeout);
    stopDecisionTimer();
    stopSpeaking();
    scene.dispose();
  });

  if (remote) root.append(chatDock());

  return root;
}
