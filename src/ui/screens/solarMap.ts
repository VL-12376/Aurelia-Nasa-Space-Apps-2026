import { h, toast } from "../../core/dom";
import { router } from "../../core/router";
import { formatUsd } from "../../budget/budget";
import { PlanetPortrait } from "../../scene/planetPortrait";
import { SolarSystemScene } from "../../scene/solarSystem";
import { BODY_INFO, BODY_ORDER, missionsForBody, relativeGravity, transferTo, type BodyId, type BodyInfo } from "../../science/bodies";
import { gameShell } from "../layout";
import { session } from "../session";

const TABS = ["Basics", "Gravity", "Atmosphere", "Missions"] as const;
type Tab = (typeof TABS)[number];

const src = (kind: "measured" | "model") =>
  h("span", { class: `src ${kind}`, title: kind === "measured" ? "A real, rounded measurement of the actual world." : "A simplified model used by the game. Not a real-world figure." }, kind === "measured" ? "Measured" : "Game model");

function row(label: string, value: string): HTMLElement {
  return h("div", { class: "kv" }, h("span", { class: "k" }, label), h("span", { class: "v mono" }, value));
}

function fmtDays(d: number): string {
  return d >= 365 ? `${(d / 365.25).toFixed(1)} years` : `${Math.round(d)} days`;
}

function fmtMinutes(m: number): string {
  if (m < 1) return `${(m * 60).toFixed(1)} s`;
  if (m < 90) return `${m.toFixed(1)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

function entryRule(info: BodyInfo): string {
  switch (info.id) {
    case "earth":
      return "Dense air: rockets must punch through it, and returning capsules need a heat shield.";
    case "venus":
      return "Very dense air gives plenty of drag but extreme heat and pressure. Landers would need exceptional protection.";
    case "mars":
      return "Thin air still heats a descending craft, so a heat shield is needed. Parachutes help, but engines must finish the landing.";
    case "jupiter":
    case "saturn":
    case "uranus":
    case "neptune":
      return "There is no solid surface. Missions would be flybys, orbiters or probes that descend into the clouds.";
    case "sun":
      return "No landing is possible. Approach is limited by heat.";
    default:
      return "No atmosphere: no drag and no entry heating. Engines alone must slow a lander.";
  }
}

function basics(info: BodyInfo): HTMLElement {
  return h(
    "div",
    { class: "info-body" },
    h("p", null, info.summary),
    h("div", { class: "src-head" }, "Real data", src("measured")),
    row("Type", info.kind),
    row("Mean radius", `${info.radiusKm.toLocaleString("en-US")} km`),
    row("Distance", info.distanceNote),
    row("Orbital period", info.orbitalPeriod),
    row("Day length", info.rotation),
    row("Moons", info.moons),
    row("Temperature", info.temperature),
  );
}

function gravity(info: BodyInfo): HTMLElement {
  const rel = relativeGravity(info);
  const weight70 = (70 * rel).toFixed(rel >= 10 ? 0 : 1);
  return h(
    "div",
    { class: "info-body" },
    h("div", { class: "big" }, h("span", { class: "mono" }, `${info.gravity.toFixed(2)} m/s²`), h("span", { class: "muted" }, `${rel.toFixed(2)} × Earth`)),
    h("div", { class: "src-head" }, "Real data", src("measured")),
    row("Surface gravity", `${info.gravity.toFixed(2)} m/s²`),
    row("Escape velocity", `${info.escapeKms} km/s`),
    info.kind === "gas giant" || info.kind === "ice giant" ? h("p", { class: "muted small" }, "Gas and ice giants have no solid surface, so gravity is quoted at the 1 bar pressure level.") : null,
    h("div", { class: "src-head" }, "What it means", src("model")),
    row("A 70 kg person feels like", `${weight70} kg on Earth`),
    row("Minimum thrust per tonne", `${info.gravity.toFixed(1)} kN`),
    h("p", { class: "muted small" }, "Calculated from the measured gravity. Lift-off needs thrust-to-weight above 1; real vehicles also lose some thrust to drag and steering."),
  );
}

function atmosphere(info: BodyInfo): HTMLElement {
  return h(
    "div",
    { class: "info-body" },
    h("p", null, info.atmosphere.summary),
    h("div", { class: "src-head" }, "Real data", src("measured")),
    row("Surface pressure", info.atmosphere.pressure),
    row("Composition", info.atmosphere.composition),
    h("div", { class: "src-head" }, "In the game", src("model")),
    h("p", { class: "small" }, entryRule(info)),
  );
}

function missions(info: BodyInfo, goBriefing: (id: string) => void): HTMLElement {
  const campaign = missionsForBody(info.id);
  const transfer = transferTo(info.id);
  return h(
    "div",
    { class: "info-body" },
    h("div", { class: "src-head" }, "Mission opportunities", src("model")),
    campaign.length
      ? h(
          "ul",
          { class: "list" },
          ...campaign.map((m) =>
            h("li", null, h("button", { class: "row-btn", onclick: () => goBriefing(m.id) }, h("div", { class: "mr-top" }, h("span", null, m.name), h("span", { class: "tag" }, `Season ${m.season}`)), h("div", { class: "muted mono small" }, `${m.destination} · cost ${formatUsd(m.costUsd)} · reward ${formatUsd(m.rewardUsd)}`))),
          ),
        )
      : h("p", { class: "muted small" }, info.id === "earth" ? "Earth missions are listed under Low Earth Orbit and Sun-synchronous orbit." : "No mission in the current campaign targets this world."),
    ...info.opportunities.filter((o) => o.status === "concept").map((o) => h("div", { class: "concept" }, h("span", { class: "tag warn" }, "Concept"), h("strong", null, ` ${o.title}`), h("p", { class: "muted small" }, o.text))),
    transfer
      ? h(
          "div",
          null,
          h("div", { class: "src-head" }, "Trip from low Earth orbit", src("model")),
          row("Departure delta-v", `${(transfer.departureDeltaV / 1000).toFixed(2)} km/s`),
          row("One-way travel time", fmtDays(transfer.days)),
          row("One-way radio delay", transfer.lightMinutes[0] === transfer.lightMinutes[1] ? fmtMinutes(transfer.lightMinutes[0]) : `${fmtMinutes(transfer.lightMinutes[0])} to ${fmtMinutes(transfer.lightMinutes[1])}`),
          h("p", { class: "muted small" }, "Simplified: circular, flat orbits and one efficient (Hohmann) transfer from a 300 km orbit. Real missions need launch windows, gravity assists and course corrections, and travel time depends on the chosen route."),
        )
      : null,
  );
}

export function solarMapScreen(): HTMLElement {
  let current: BodyId | null = null;
  let tab = 0;

  const portraitHost = h("div", { class: "portrait" });
  const portrait = new PlanetPortrait(portraitHost);
  const infoTitle = h("div", { class: "info-title" }, "SELECT A WORLD");
  const infoContent = h("div", { class: "info-scroll" });
  const dots = h("div", { class: "dots", role: "tablist", "aria-label": "Information sections" });
  const slider = h("input", { type: "range", min: 0, max: 1000, value: 500, class: "zoom-slider", "aria-label": "Zoom" }) as HTMLInputElement;
  const destChip = h("div", { class: `dest-chip mono${session.destination ? " set" : ""}` }, session.destination ? `DESTINATION: ${BODY_INFO[session.destination as BodyId].name.toUpperCase()}` : "DESTINATION: NOT SET");
  const chips: Record<string, HTMLButtonElement> = {};

  const view = h("div", { class: "solar-view" });
  const scene = new SolarSystemScene(view, {
    onSelect: (id) => {
      current = id;
      tab = 0;
      renderInfo();
      for (const [k, b] of Object.entries(chips)) b.setAttribute("aria-pressed", String(k === id));
    },
    onZoom: (n) => {
      slider.value = String(Math.round(n * 1000));
    },
  });
  router.onLeave(() => {
    scene.dispose();
    portrait.dispose();
  });

  const goBriefing = (id: string) => {
    session.selectedMissionId = id;
    router.navigate("briefing");
  };

  function renderInfo(): void {
    dots.replaceChildren(
      ...TABS.map((t, i) => h("button", { class: "dot", role: "tab", "aria-selected": String(i === tab), "aria-label": t, title: t, disabled: !current, onclick: () => { tab = i; renderInfo(); } })),
    );
    if (!current) {
      infoTitle.textContent = "SELECT A WORLD";
      infoContent.replaceChildren(
        h("div", { class: "info-body" }, h("p", null, "Click or tap any planet, the Moon, Ceres or the Sun to read about it. Use the list below if you prefer the keyboard."), h("p", { class: "muted small" }, "Every value is tagged so you can tell real measurements from simplified game models.")),
      );
      return;
    }
    const info = BODY_INFO[current];
    const name = info.name.toUpperCase();
    infoTitle.textContent = `${name} : ${TABS[tab].toUpperCase()}`;
    portrait.show(current);
    const t: Tab = TABS[tab];
    const content =
      t === "Basics" ? basics(info) : t === "Gravity" ? gravity(info) : t === "Atmosphere" ? atmosphere(info) : missions(info, goBriefing);
    infoContent.replaceChildren(content, h("button", { class: "btn small", onclick: () => setDestination(info) }, session.destination === info.id ? "Destination set" : "Set as destination"));
  }

  function setDestination(info: BodyInfo): void {
    if (info.id === "sun") {
      toast("The Sun is not a mission destination.");
      return;
    }
    session.destination = info.id;
    destChip.textContent = `DESTINATION: ${info.name.toUpperCase()}`;
    destChip.classList.add("set");
    toast(`Destination set: ${info.name}`);
    renderInfo();
  }

  const step = (dir: number) => {
    if (!current) return;
    tab = (tab + dir + TABS.length) % TABS.length;
    renderInfo();
  };

  let speed = 1;
  const speeds = [1, 4, 16];
  const speedBtn = h("button", { class: "rail-btn", "aria-label": "Simulation speed", title: "Orbit speed", onclick: () => {
    speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    scene.setTimeScale(speed);
    speedBtn.textContent = `${speed}×`;
  } }, "1×");
  const pauseBtn = h("button", { class: "rail-btn", "aria-label": "Pause or resume orbits", "aria-pressed": "false", title: "Pause / resume orbits", onclick: () => {
    pauseBtn.setAttribute("aria-pressed", String(scene.togglePause()));
    pauseBtn.textContent = pauseBtn.getAttribute("aria-pressed") === "true" ? "▶" : "❚❚";
  } }, "❚❚");

  const rail = h(
    "div",
    { class: "rail", role: "toolbar", "aria-label": "Map tools" },
    h("button", { class: "rail-btn", "aria-label": "Reset camera", title: "Reset camera (or double-click empty space)", onclick: () => scene.resetView() }, "⌂"),
    h("button", { class: "rail-btn", "aria-label": "Toggle orbit lines", title: "Toggle orbit lines", onclick: () => scene.toggleOrbits() }, "◎"),
    h("button", { class: "rail-btn", "aria-label": "Toggle labels", title: "Toggle labels", onclick: () => scene.toggleLabels() }, "Aa"),
    pauseBtn,
    speedBtn,
  );

  slider.addEventListener("input", () => scene.setZoom(Number(slider.value) / 1000));
  const zoom = h(
    "div",
    { class: "zoom" },
    h("button", { class: "rail-btn small", "aria-label": "Zoom out", onclick: () => scene.zoomBy(1.35) }, "−"),
    slider,
    h("button", { class: "rail-btn small", "aria-label": "Zoom in", onclick: () => scene.zoomBy(1 / 1.35) }, "+"),
  );

  const info = h(
    "aside",
    { class: "info-panel", "aria-live": "polite" },
    h("div", { class: "portrait-wrap" }, portraitHost, h("div", { class: "portrait-note mono" }, "Procedural render · illustrative, not a photograph")),
    h("div", { class: "pager" }, dots, h("div", { class: "arrows" }, h("button", { class: "arrow", "aria-label": "Previous section", onclick: () => step(-1) }, "◀"), h("button", { class: "arrow", "aria-label": "Next section", onclick: () => step(1) }, "▶"))),
    infoTitle,
    infoContent,
  );

  const chipRow = h(
    "div",
    { class: "chips", role: "group", "aria-label": "Destinations" },
    ...BODY_ORDER.map((id) => {
      const b = h("button", { class: "chip", "aria-pressed": "false", onclick: () => scene.select(id) }, BODY_INFO[id].name);
      chips[id] = b;
      return b;
    }),
  );

  const legend = h(
    "div",
    { class: "scale-note mono" },
    h("span", null, "Scene is NOT to scale: orbit distances are compressed and planet sizes exaggerated. Orbit speeds are sped up."),
    h("span", null, "Drag: rotate · Scroll or pinch: zoom · Right-drag or two fingers: pan · Double-click empty space: reset"),
  );

  renderInfo();

  const stage = h("div", { class: "solar-stage" }, view, rail, zoom, destChip, info);
  return gameShell("map", h("div", { class: "solar-wrap" }, stage, chipRow, legend), { fill: true });
}
