import { fill, h } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { analyse } from "../../spacecraft/design";
import { BODY_INFO, type BodyId } from "../../science/bodies";
import { audio } from "../../audio/engine";
import {
  APOLLO11_ASCENT, ARTEMIS_CAMPAIGN, DELTA_V_MAP, DISCLAIMER, MARS_REFERENCE_LAUNCH, MATURITY, ORION, REAL_MISSIONS, REAL_VEHICLES, SOURCES,
  dynamicPressureKpa, hohmannFromEarth, nextMarsWindows, stackDeltaV,
} from "../../data/real";
import { CAREER_LIMIT_MSV, DOSE_PRESETS, RADIATION_ENVS, daysToLimit, totalDose, type DaysByEnv, type RadiationEnv } from "../../data/radiation";
import { gameShell } from "../layout";
import { realImageFigure } from "../realImage";

/* ------------------------------------------------------------------ */
/* Lesson plumbing                                                     */
/* ------------------------------------------------------------------ */

interface Quiz {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

interface Lesson {
  id: string;
  cml: number;
  title: string;
  blurb: string;
  build: () => HTMLElement;
  quiz: Quiz;
}

const doneKey = (id: string) => `Academy: ${id}`;
const isDone = (id: string) => !!store.get().game?.achievements.includes(doneKey(id));

let stopAnim: () => void = () => {};

function slider(label: string, min: number, max: number, step: number, value: number, fmt: (n: number) => string, onInput: (n: number) => void): HTMLElement {
  const out = h("output", { class: "mono" }, fmt(value));
  const input = h("input", { type: "range", min, max, step, value, "aria-label": label, oninput: (e: Event) => { const n = Number((e.target as HTMLInputElement).value); out.textContent = fmt(n); onInput(n); } });
  return h("label", { class: "ac-slider" }, h("span", null, label), input, out);
}

function meter(parts: { label: string; value: number; tone?: string }[], max: number): HTMLElement {
  return h(
    "div",
    { class: "ac-meter" },
    ...parts.map((p) => h("div", { class: "ac-meter-row" }, h("span", { class: "ac-meter-l" }, p.label), h("div", { class: "bar" }, h("span", { class: p.tone ?? "", style: { width: `${Math.min(100, (p.value / max) * 100)}%` } })), h("span", { class: "mono ac-meter-v" }, `${p.value.toFixed(1)} km/s`))),
  );
}

function callout(title: string, text: string): HTMLElement {
  return h("div", { class: "ac-callout" }, h("strong", null, title), h("p", null, text));
}

/* ------------------------------------------------------------------ */
/* Lesson 1: where are we going?                                       */
/* ------------------------------------------------------------------ */

function lessonDestination(): HTMLElement {
  const ids: BodyId[] = ["moon", "venus", "mars", "ceres", "jupiter", "saturn", "neptune"];
  let pick: BodyId = "moon";
  const out = h("div", { class: "ac-out" });
  const chips = h("div", { class: "ac-chips" });
  const draw = () => {
    chips.replaceChildren(...ids.map((id) => h("button", { class: "chip", "aria-pressed": String(id === pick), onclick: () => { pick = id; draw(); } }, BODY_INFO[id].name)));
    const b = BODY_INFO[pick];
    const plan = pick === "moon" ? null : hohmannFromEarth(b.semiMajorAu);
    out.replaceChildren(
      h("p", null, b.summary),
      h("div", { class: "ac-facts" },
        fact("Radius", `${b.radiusKm.toLocaleString("en-US")} km`),
        fact("Surface gravity", `${b.gravity.toFixed(2)} m/s² (${(b.gravity / 9.80665).toFixed(2)} g)`),
        fact("Escape speed", `${b.escapeKms} km/s`),
        fact("Distance", b.distanceNote),
        fact("Direct trip (simplest path)", plan ? `${Math.round(plan.transferDays)} days (${(plan.transferDays / 365.25).toFixed(1)} years)` : "About 3 days (Apollo 11)"),
      ),
      callout("Why the destination matters", pick === "moon" ? "The Moon is close, so a trip takes days, but it has no atmosphere: landing needs rocket power all the way down." : `Gravity here is ${(b.gravity / 9.80665).toFixed(2)} g, so landing and leaving cost ${b.gravity < 9.80665 ? "less" : "more"} speed change than on Earth. The long trip means a long wait for radio replies and a spacecraft that must work by itself.`),
      h("p", { class: "muted small" }, "Measurements: NASA NSSDCA planetary fact sheets. Trip times: simple circular-orbit transfer, the standard first estimate."),
    );
  };
  draw();
  return h("div", null, h("p", null, "Every mission starts on a napkin with one question: what do we want to learn, and where must we go to learn it? NASA's Webb \"Build It Yourself\" game teaches the same lesson: the science goal drives every engineering choice that follows. Pick a destination and see what it asks of a mission."), chips, out);
}

function fact(k: string, v: string): HTMLElement {
  return h("div", { class: "kv" }, h("span", { class: "k" }, k), h("span", { class: "v mono" }, v));
}

/* ------------------------------------------------------------------ */
/* Lesson 2: the delta-v price list                                    */
/* ------------------------------------------------------------------ */

const ROUTES: { label: string; legs: string[] }[] = [
  { label: "Satellite in low orbit", legs: ["launch"] },
  { label: "Moon orbiter", legs: ["launch", "tli", "loi"] },
  { label: "Moon landing (one way)", legs: ["launch", "tli", "loi", "descent"] },
  { label: "Moon landing and return to orbit", legs: ["launch", "tli", "loi", "descent", "ascent"] },
  { label: "Mars orbiter", legs: ["launch", "tmi", "moi"] },
];

function lessonDeltaV(): HTMLElement {
  const on = new Set<string>(["launch", "tli", "loi"]);
  const out = h("div", { class: "ac-out" });
  const list = h("div", { class: "ac-legs" });
  const draw = () => {
    const total = DELTA_V_MAP.filter((l) => on.has(l.id)).reduce((n, l) => n + l.kms, 0);
    list.replaceChildren(
      ...DELTA_V_MAP.map((l) =>
        h("label", { class: `ac-leg${on.has(l.id) ? " on" : ""}`, title: l.note }, h("input", { type: "checkbox", checked: on.has(l.id), onchange: (e: Event) => { if ((e.target as HTMLInputElement).checked) on.add(l.id); else on.delete(l.id); draw(); } }), h("span", null, l.label), h("span", { class: "mono" }, `${l.kms.toFixed(1)} km/s`)),
      ),
    );
    const cap = [{ label: "Typical single-stage limit", v: 9.0 }, { label: "Saturn V alone (ideal)", v: stackDeltaV(REAL_VEHICLES[0].stages!, REAL_VEHICLES[0].payloadT!).total }];
    out.replaceChildren(
      h("div", { class: "ac-total" }, h("span", null, "Total delta-v for this plan"), h("strong", { class: "mono" }, `${total.toFixed(1)} km/s`)),
      meter([{ label: "Your plan", value: total, tone: total > cap[1].v ? "bad" : "" }, { label: cap[0].label, value: cap[0].v }, { label: cap[1].label, value: cap[1].v }], 14),
      h("p", { class: "muted small" }, total > cap[1].v ? "More than a Saturn V delivers on its own (about 12 km/s, enough for orbit plus the trip to the Moon). Real missions add engines on the spacecraft itself for the later burns: Apollo's own service module engine made the lunar-orbit capture and the trip home." : total > cap[0].v ? "Too much for one stage: this is why rockets have stages." : "Within reach of a single well-built rocket."),
    );
  };
  draw();
  return h(
    "div",
    null,
    h("p", null, "Moving in space is not paid in distance but in speed change, called delta-v. Each manoeuvre has a price, and the rocket must carry enough propellant to pay all of them. Tick the legs of a trip to build a budget. Hover a leg for a real-world note."),
    h("div", { class: "ac-chips" }, ...ROUTES.map((r) => h("button", { class: "chip", onclick: () => { on.clear(); r.legs.forEach((id) => on.add(id)); draw(); } }, r.label))),
    list,
    out,
    h("p", { class: "muted small" }, "Values are commonly used mission-design figures, rounded. Real missions vary with the exact orbit. Tools like NASA's open-source GMAT compute them precisely."),
  );
}

/* ------------------------------------------------------------------ */
/* Lesson 3: the rocket equation                                       */
/* ------------------------------------------------------------------ */

function lessonRocketEquation(): HTMLElement {
  let isp = 320;
  let dry = 8;
  let prop = 40;
  let payload = 2;
  const out = h("div", { class: "ac-out" });
  const real = h("div", { class: "ac-out" });
  const draw = () => {
    const m0 = dry + prop + payload;
    const mf = dry + payload;
    const dv = (isp * 9.80665 * Math.log(m0 / mf)) / 1000;
    out.replaceChildren(
      h("div", { class: "ac-eq mono" }, `Δv = ${isp} s × 9.81 × ln(${m0.toFixed(1)} t ÷ ${mf.toFixed(1)} t) = `, h("strong", null, `${dv.toFixed(2)} km/s`)),
      meter([{ label: "This rocket", value: dv }, { label: "Orbit needs", value: 9.4 }, { label: "Orbit + Moon", value: 12.5 }], 14),
      h("p", { class: "muted small" }, `Propellant is ${Math.round((prop / m0) * 100)}% of the vehicle. Doubling the propellant does not double the speed: the logarithm means each extra tonne helps less than the last. That is the "tyranny of the rocket equation".`),
    );
    const g = store.get().game;
    const stats = g && g.draft.parts.length ? analyse(g.draft) : null;
    const sv = REAL_VEHICLES[0];
    const calc = stackDeltaV(sv.stages!, sv.payloadT!);
    real.replaceChildren(
      h("h4", null, "The real thing: Saturn V"),
      h("table", { class: "ac-table" },
        h("tr", null, h("th", null, "Stage"), h("th", null, "Engines"), h("th", null, "Propellant"), h("th", null, "Empty"), h("th", null, "Isp"), h("th", null, "Δv")),
        ...sv.stages!.map((s, i) => h("tr", null, h("td", null, s.name), h("td", null, s.engines), h("td", { class: "mono" }, `${s.propellantT} t`), h("td", { class: "mono" }, `${s.dryT} t`), h("td", { class: "mono" }, `${s.isp} s`), h("td", { class: "mono" }, `${calc.perStage[i].toFixed(1)} km/s`))),
        h("tr", { class: "sum" }, h("td", null, "Total"), h("td", null, ""), h("td", null, ""), h("td", null, ""), h("td", null, ""), h("td", { class: "mono" }, `${calc.total.toFixed(1)} km/s`)),
      ),
      h("p", null, `Ideal Δv of ${calc.total.toFixed(1)} km/s is close to the 12.5 km/s needed for orbit (9.4) plus the trip to the Moon (3.1). The rocket equation is how engineers knew three stages were enough, years before the first flight.`),
      stats ? h("p", { class: "ac-yours" }, `Your own design in the Hangar: ${stats.deltaV ? (stats.deltaV / 1000).toFixed(2) : "0.00"} km/s.`) : h("p", { class: "muted small" }, "Build a design in the Hangar and its delta-v will appear here for comparison."),
      h("p", { class: "muted small" }, "Stage masses and specific impulse are rounded values from NASA Saturn V documentation. The estimate ignores gravity and drag losses, so it is an upper limit."),
    );
  };
  draw();
  return h(
    "div",
    null,
    h("p", null, "The rocket equation links how much speed a rocket can add to how efficient its engine is (specific impulse, Isp) and how much of the vehicle is propellant. Move the sliders."),
    h("div", { class: "ac-chips" }, ...[["Solid rocket", 250], ["Kerosene + oxygen", 320], ["Hydrogen + oxygen", 450]].map(([n, v]) => h("button", { class: "chip", onclick: () => { const el = document.querySelector<HTMLInputElement>("#ac-isp"); if (el) { el.value = String(v); el.dispatchEvent(new Event("input")); } } }, `${n} (${v} s)`))),
    h("div", { class: "ac-sliders" },
      (() => { const s = slider("Engine efficiency (Isp)", 200, 460, 5, isp, (n) => `${n} s`, (n) => { isp = n; draw(); }); s.querySelector("input")!.id = "ac-isp"; return s; })(),
      slider("Propellant", 5, 400, 5, prop, (n) => `${n} t`, (n) => { prop = n; draw(); }),
      slider("Empty rocket (tanks, engines)", 1, 60, 1, dry, (n) => `${n} t`, (n) => { dry = n; draw(); }),
      slider("Payload", 0, 20, 0.5, payload, (n) => `${n} t`, (n) => { payload = n; draw(); }),
    ),
    out,
    real,
  );
}

/* ------------------------------------------------------------------ */
/* Lesson 4: orbits, transfers and launch windows                      */
/* ------------------------------------------------------------------ */

function lessonTransfer(): HTMLElement {
  const targets: BodyId[] = ["venus", "mars", "ceres", "jupiter", "saturn"];
  let pick: BodyId = "mars";
  const canvas = h("canvas", { class: "ac-canvas", width: 620, height: 400, role: "img", "aria-label": "Animated transfer orbit from Earth to the target planet" }) as HTMLCanvasElement;
  const info = h("div", { class: "ac-out" });
  const chips = h("div", { class: "ac-chips" });

  const start = () => {
    stopAnim();
    const plan = hohmannFromEarth(BODY_INFO[pick].semiMajorAu);
    const a = BODY_INFO[pick].semiMajorAu;
    const ctx = canvas.getContext("2d")!;
    const scale = 170 / Math.max(a, 1.05);
    const aT = (1 + a) / 2;
    const e = Math.abs(a - 1) / (a + 1);
    const outward = a > 1;
    const T = plan.transferDays;
    let raf = 0;
    let t0 = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // One transfer takes 12 seconds on screen, then it pauses briefly and replays.
      const cycle = ((now - t0) / 1000) % 15;
      const k = Math.min(cycle / 12, 1);
      const days = k * T;
      const w = canvas.width;
      const cx = w / 2;
      const cy = canvas.height / 2;
      ctx.clearRect(0, 0, w, canvas.height);
      ctx.strokeStyle = "rgba(184,166,232,0.25)";
      ctx.lineWidth = 1;
      for (const r of [1, a]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      // The transfer ellipse, with the Sun at one focus. Outward trips start at the closest point to the Sun, inward trips at the farthest.
      ctx.strokeStyle = "rgba(127,224,255,0.55)";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const Ei = (i / 200) * Math.PI * 2;
        const px = aT * (Math.cos(Ei) - e);
        const py = aT * Math.sqrt(1 - e * e) * Math.sin(Ei);
        const x = cx + (outward ? px : -px) * scale;
        const y = cy - (outward ? py : -py) * scale;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // Sun
      const sun = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
      sun.addColorStop(0, "#fff3c0");
      sun.addColorStop(1, "rgba(255,150,50,0)");
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fill();
      // Earth and target on their orbits. Departure is at angle 0 (right side).
      const earthAng = (days / 365.256) * Math.PI * 2;
      const tgtDays = Math.pow(a, 1.5) * 365.256;
      const tgtAng = (plan.leadAngleDeg * Math.PI) / 180 + (days / tgtDays) * Math.PI * 2;
      const dot = (r: number, ang: number, color: string, size: number, label: string) => {
        const x = cx + Math.cos(ang) * r * scale;
        const y = cy - Math.sin(ang) * r * scale;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(245,244,250,0.8)";
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText(label, x + size + 4, y + 3);
      };
      dot(1, earthAng, "#6fa8ff", 5, "Earth");
      dot(a, tgtAng, "#e8956a", 6, BODY_INFO[pick].name);
      // Spacecraft: solve Kepler's equation (M = E - e sin E) for the transfer ellipse. It covers half the orbit.
      const M = outward ? Math.PI * k : Math.PI + Math.PI * k;
      let E = M;
      for (let i = 0; i < 20; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      const sx0 = aT * (Math.cos(E) - e);
      const sy0 = aT * Math.sqrt(1 - e * e) * Math.sin(E);
      const sx = cx + (outward ? sx0 : -sx0) * scale;
      const sy = cy - (outward ? sy0 : -sy0) * scale;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#7fe0ff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(245,244,250,0.8)";
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText(`Day ${Math.round(days)} of ${Math.round(T)}`, 14, 22);
    };
    raf = requestAnimationFrame(loop);
    stopAnim = () => cancelAnimationFrame(raf);
    t0 = performance.now();
    router.onLeave(() => stopAnim());
    const mars = nextMarsWindows(new Date(), 3);
    fill(info, 
      h("div", { class: "ac-facts" },
        fact("Trip time (simplest path)", `${Math.round(plan.transferDays)} days (${(plan.transferDays / 365.25).toFixed(2)} years)`),
        fact(outward ? "Target must lead Earth by" : "Target must trail Earth by", `${Math.round(outward ? plan.leadAngleDeg : 360 - plan.leadAngleDeg)}°`),
        fact("Launch window repeats every", `${(plan.synodicDays / 30.44).toFixed(1)} months`),
        fact("Burn to leave Earth's orbit", `${plan.deltaV1Kms.toFixed(1)} km/s`),
        fact("Burn to match the target", `${plan.deltaV2Kms.toFixed(1)} km/s`),
      ),
      callout("Why you cannot launch whenever you like", `The spacecraft coasts along the dashed path for ${Math.round(plan.transferDays)} days. ${BODY_INFO[pick].name} keeps moving the whole time, so the spacecraft must leave when the planet is at the right angle ahead of Earth. Miss it and the next chance is about ${(plan.synodicDays / 30.44).toFixed(0)} months away.`),
      pick === "mars" ? h("p", { class: "ac-yours" }, `Real example: Mars 2020 launched on ${new Date(MARS_REFERENCE_LAUNCH).toUTCString().slice(5, 16)}. By this repeating pattern, upcoming Mars windows open around ${mars.map((d) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })).join(", ")}.`) : null,
      h("p", { class: "muted small" }, "A circular, flat-orbit (Hohmann) transfer: the standard first estimate. Real trajectories, designed with tools like NASA's open-source GMAT, are refined with the real, slightly tilted and elliptical orbits."),
    );
  };

  const draw = () => {
    chips.replaceChildren(...targets.map((id) => h("button", { class: "chip", "aria-pressed": String(id === pick), onclick: () => { pick = id; draw(); } }, BODY_INFO[id].name)));
    start();
  };
  draw();
  return h("div", null, h("p", null, "Planets are not still targets: everything orbits the Sun. The most economical way between two circular orbits is a transfer ellipse that touches both. Pick a target and watch a spacecraft ride it."), chips, canvas, info);
}

/* ------------------------------------------------------------------ */
/* Lesson 5: launch day                                                */
/* ------------------------------------------------------------------ */

function lessonLaunch(): HTMLElement {
  let t = 0;
  let alt = 11;
  let speed = 450;
  const events = h("ol", { class: "ac-events" });
  const qOut = h("div", { class: "ac-out" });
  const drawEvents = () => {
    const current = [...APOLLO11_ASCENT].filter((e) => e.t <= t).pop();
    events.replaceChildren(
      ...APOLLO11_ASCENT.map((e) => h("li", { class: e === current ? "now" : e.t <= t ? "past" : "" }, h("span", { class: "mono" }, e.t < 0 ? `T${e.t}s` : `T+${Math.floor(e.t / 60)}:${String(e.t % 60).padStart(2, "0")}`), h("div", null, h("strong", null, e.label), e === current ? h("p", null, e.explain) : null))),
    );
  };
  const drawQ = () => {
    const q = dynamicPressureKpa(alt, speed);
    qOut.replaceChildren(h("div", { class: "ac-total" }, h("span", null, "Dynamic pressure q = ½ρv²"), h("strong", { class: "mono" }, `${q.toFixed(1)} kPa`)), h("div", { class: "bar", role: "progressbar", "aria-valuenow": Math.round(q), "aria-valuemin": 0, "aria-valuemax": 40, "aria-label": "Dynamic pressure" }, h("span", { class: q > 30 ? "warn" : "", style: { width: `${Math.min(100, (q / 40) * 100)}%` } })), h("p", { class: "muted small" }, q > 25 ? "Near the peak. Apollo 11 felt about 35 kPa at roughly 12 km up." : q < 2 ? "Almost no pressure: either too slow, or the air is too thin." : "Building up or fading."));
  };
  drawEvents();
  drawQ();
  return h(
    "div",
    null,
    h("p", null, "Here is a real launch, event by event: Apollo 11's Saturn V on 16 July 1969. Drag the time slider and read what each moment means. Times are approximate, from the Apollo 11 mission report and Flight Journal."),
    slider("Time since liftoff", -9, 700, 1, 0, (n) => (n < 0 ? `T${n} s` : `T+${Math.floor(n / 60)}:${String(Math.round(n) % 60).padStart(2, "0")}`), (n) => { t = n; drawEvents(); }),
    events,
    h("h4", null, "Why \"Max Q\" is the dangerous moment"),
    h("p", null, "Going faster pushes harder on the rocket, but going higher thins the air. The product peaks once, early in the flight: that is Max Q. Try the sliders: low and slow is gentle, high and fast is gentle, but in between the structure takes the most load."),
    slider("Altitude", 0, 60, 1, alt, (n) => `${n} km`, (n) => { alt = n; drawQ(); }),
    slider("Speed", 0, 3000, 10, speed, (n) => `${n} m/s`, (n) => { speed = n; drawQ(); }),
    qOut,
    callout("Why launch east?", "Earth spins eastward at about 0.46 km/s at the equator. A rocket launched east starts with that speed for free, which is why launch sites are near the coast and as close to the equator as possible."),
  );
}

/* ------------------------------------------------------------------ */
/* Lesson 6: how real missions mature                                  */
/* ------------------------------------------------------------------ */

function playerLevel(): number {
  const g = store.get().game;
  if (!g) return 1;
  if (g.flights > 0) return 6;
  if (g.fleet.length) return 5;
  if (g.draft.parts.length) return 4;
  return 1;
}

function lessonMaturity(): HTMLElement {
  const here = playerLevel();
  const go: Record<string, () => void> = { briefing: () => router.navigate("briefing"), hangar: () => router.navigate("hangar"), control: () => router.navigate("briefing"), academy: () => {} };
  return h(
    "div",
    null,
    h("p", null, "Real missions do not jump from idea to launch. NASA's Jet Propulsion Laboratory defined Concept Maturity Levels to describe the steps. At Goddard Space Flight Center, a Mission Design Lab team of specialists (orbits, power, communications, propulsion, structures) works through them together, which is why AURELIA gives you a crew with different jobs."),
    h("ol", { class: "ac-ladder" },
      ...MATURITY.map((m) =>
        h("li", { class: m.level === here ? "here" : m.level < here ? "past" : "" },
          h("div", { class: "ac-level mono" }, `CML ${m.level}`),
          h("div", null, h("strong", null, m.name), m.level === here ? h("span", { class: "tag" }, "You are here") : null, h("p", { class: "muted small" }, `Real teams: ${m.real}`), h("p", { class: "small" }, `In AURELIA: ${m.game}`), m.where !== "academy" ? h("button", { class: "btn ghost small", onclick: go[m.where] }, m.where === "hangar" ? "Open Hangar" : "Open Missions") : null),
        ),
      ),
    ),
    h("p", { class: "muted small" }, "Levels 1 to 6 follow Wessen et al., JPL, AIAA 2013. Levels 7 to 9 are the formal development reviews that come after, which AURELIA does not model."),
  );
}

/* ------------------------------------------------------------------ */
/* Lesson 7: real missions                                             */
/* ------------------------------------------------------------------ */

function lessonMissions(): HTMLElement {
  return h(
    "div",
    null,
    h("p", null, `Every idea in AURELIA comes from a real mission. Here are ${REAL_MISSIONS.length}, with what to notice about each.`),
    h("div", { class: "ac-cards" },
      ...REAL_MISSIONS.map((m) =>
        h("article", { class: "ac-card" },
          h("div", { class: "mono small muted" }, `${m.year} · ${m.vehicle}`),
          h("h4", null, m.name),
          h("p", { class: "small" }, m.destination),
          realImageFigure(m.imageQuery ?? m.name),
          h("div", { class: "ac-facts" }, ...m.facts.map(([k, v]) => fact(k, v))),
          callout("What to notice", m.notice),
        ),
      ),
    ),
    h("h4", null, "The Artemis campaign"),
    h("p", null, "Artemis is NASA's programme to return people to the Moon. Each flight adds one new thing to test, so the risky parts are met one at a time. This is how it stands in NASA's own pages as of November 2026."),
    h("div", { class: "ac-cards" },
      ...ARTEMIS_CAMPAIGN.map((a) =>
        h("article", { class: "ac-card" }, h("div", { class: "mono small muted" }, a.when), h("h4", null, a.name), h("p", { class: "small" }, a.what)),
      ),
    ),
    h("h4", null, "Orion, the crew spacecraft"),
    h("div", { class: "ac-facts" },
      fact("Crew", `${ORION.crew}, for up to ${ORION.maxDays} days`),
      fact("Gross liftoff mass", `${ORION.grossLiftoffMassKg.toLocaleString("en-US")} kg`),
      fact("Mass sent toward the Moon", `${ORION.tliMassKg.toLocaleString("en-US")} kg`),
      fact("Height with abort tower", `${ORION.stackHeightM} m`),
    ),
    h("p", { class: "muted small" }, ORION.note),
    h("h4", null, "Real launch vehicles"),
    h("table", { class: "ac-table" },
      h("tr", null, h("th", null, "Vehicle"), h("th", null, "Height"), h("th", null, "Liftoff mass"), h("th", null, "Liftoff thrust"), h("th", null, "To low orbit")),
      ...REAL_VEHICLES.map((v) => h("tr", { title: v.blurb }, h("td", null, v.name), h("td", { class: "mono" }, `${v.heightM} m`), h("td", { class: "mono" }, `${v.liftoffMassT.toLocaleString("en-US")} t`), h("td", { class: "mono" }, `${v.liftoffThrustMN} MN`), h("td", { class: "mono" }, `${v.leoT} t`))),
    ),
    h("p", { class: "muted small" }, "Rounded values from NASA vehicle fact sheets. Hover a row for a description."),
    h("p", { class: "muted small" }, "Pictures come live from the NASA Image and Video Library, each linked to its page there, and show only when you are online. Want to turn a real spacecraft around in 3D? NASA's ", h("a", { href: "https://science.nasa.gov/3d-resources/", target: "_blank", rel: "noopener noreferrer" }, "3D Resources"), " page has models; AURELIA does not include them because each one has its own terms."),
    h("p", { class: "muted small" }, DISCLAIMER),
  );
}

/* ------------------------------------------------------------------ */
/* Lesson 8: keeping a crew alive                                      */
/* ------------------------------------------------------------------ */

const DOSE_MAX: Record<RadiationEnv["id"], number> = { leo: 400, orion: 30, moon: 180, marsCruise: 400, marsSurface: 600 };

function lessonCrewHealth(): HTMLElement {
  const days: DaysByEnv = { leo: 182 };
  const out = h("div", { class: "ac-out" });
  const sliders = h("div", { class: "ac-sliders" });
  const drawOut = () => {
    const r = totalDose(days);
    const pct = Math.round(r.limitShare * 100);
    out.replaceChildren(
      h("div", { class: "ac-total" }, h("span", null, "Total dose for this plan"), h("strong", { class: "mono" }, `${r.totalMSv.toFixed(r.totalMSv < 100 ? 1 : 0)} mSv`)),
      h("div", { class: "bar", role: "progressbar", "aria-valuenow": Math.min(100, pct), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Share of NASA's career dose limit" }, h("span", { class: r.limitShare >= 1 ? "warn" : "", style: { width: `${Math.min(100, r.limitShare * 100)}%` } })),
      h("p", { class: r.limitShare >= 1 ? "warn" : "" }, `${pct}% of NASA's ${CAREER_LIMIT_MSV} mSv career limit. ${r.limitShare === 0 ? "Move a slider to plan some days." : r.limitShare < 0.1 ? "A small share: one flight like this leaves plenty of career left." : r.limitShare < 0.5 ? "A big slice of a career in a single flight." : r.limitShare < 1 ? "Most of a career's allowance in one trip." : "More than a whole career's allowance in a single trip. This is the problem NASA's radiation researchers are working on for Mars: shorter trips, more shielding, and better storm shelters."}`),
    );
  };
  const drawSliders = () => {
    sliders.replaceChildren(...RADIATION_ENVS.map((e) => slider(e.label, 0, DOSE_MAX[e.id], 1, days[e.id] ?? 0, (n) => `${n} days`, (n) => { days[e.id] = n; drawOut(); })));
  };
  const preset = (p: (typeof DOSE_PRESETS)[number]) => { for (const e of RADIATION_ENVS) days[e.id] = p.days[e.id] ?? 0; drawSliders(); drawOut(); };
  drawSliders();
  drawOut();
  return h(
    "div",
    null,
    h("p", null, "Keeping astronauts healthy is a design requirement, just like delta-v. NASA's Human Research Program names five hazards of human spaceflight: space radiation, isolation and confinement, distance from Earth, gravity (or the lack of it) and closed, hostile environments. This lesson takes two of them: radiation, which you can calculate, and fatigue, which is a way of thinking about how crews work."),
    h("h4", null, "Radiation: a dose budget"),
    h("p", null, "Radiation dose is counted in millisieverts (mSv). Outside Earth's magnetic field, cosmic rays pass through a spacecraft all day, every day, so dose grows with days in space. Plan a trip by choosing days in each place, or start from a preset. The rates are real measurements."),
    h("div", { class: "ac-chips" }, ...DOSE_PRESETS.map((p) => h("button", { class: "chip", title: p.note, onclick: () => preset(p) }, p.label))),
    sliders,
    out,
    h("table", { class: "ac-table" },
      h("tr", null, h("th", null, "Where"), h("th", null, "Measured dose rate"), h("th", null, "Days alone to reach the limit"), h("th", null, "Measured by")),
      ...RADIATION_ENVS.map((e) => h("tr", { title: e.note }, h("td", null, e.label), h("td", { class: "mono" }, `${e.mSvPerDay.toFixed(2)} mSv/day${e.range ? ` (${e.range[0]}–${e.range[1]})` : ""}`), h("td", { class: "mono" }, Math.round(daysToLimit(e)).toLocaleString("en-US")), h("td", { class: "small" }, e.where))),
    ),
    callout("A simplification", "This is a plain sum of days times a measured average rate. It leaves out solar storms, the solar cycle, how much shielding a vehicle has, and the astronaut's earlier flights. NASA's limit is for effective dose, calculated with a standard body model; the measured dose-equivalent rates used here stand in for it, so treat results as a teaching estimate, not a mission plan."),
    callout("Where the limit comes from", "NASA's standard says an astronaut's career dose from spaceflight radiation must stay below 600 mSv, the same for every age and sex. It is set so the added risk of dying from radiation-caused cancer stays at or under about 3%. NASA also follows the ALARA principle: keep every dose As Low As Reasonably Achievable."),
    callout("Storms are a different problem", "A big solar particle event delivers a lot of dose quickly. Orion is built so that, inside its storm shelter, the dose from a large event stays at or below 150 mSv, and the radiation measured on Artemis I supported that shielding design. The Headquarters 'Space weather' card shows how active the Sun has been in the last 30 days."),
    h("h4", null, "Fatigue and workload"),
    h("p", null, "Radiation harms slowly; tired crews make mistakes quickly. NASA's Human Research Program lists four things that set how alert a person is: how long they slept last night, how many hours they have been awake, how groggy they are just after waking, and the time of day for their body clock. Spoil any one and performance drops. NASA's evidence reports say astronauts consistently sleep less in space than on the ground, and that too much work leads to long shifts, which cause lost sleep and a body clock out of step, which in turn cause lapses in attention."),
    h("p", null, "For mission design this means workload is a resource to budget, like propellant: a plan with no rest, or with every task stacked into the same busy hours, spends the crew's alertness. AURELIA does not model crew fatigue or workload; it is here as a concept, and as a reason flight controllers build timelines with rest and margin."),
    h("p", { class: "muted small" }, "Sources: NASA Human Research Program (nasa.gov/hrp) and its hazards and evidence reports; dose rates and storm-shelter figure from George et al., Nature 2024 (NASA Space Radiation Analysis Group, DLR, ESA); Mars cruise note from NASA/JPL's 2013 Curiosity release; career limit from NASA-STD-3001."),
    h("p", { class: "muted small" }, DISCLAIMER),
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

export const LESSONS: Lesson[] = [
  { id: "destination", cml: 1, title: "Where are we going?", blurb: "Start with the science question", build: lessonDestination,
    quiz: { q: "What is the very first question a mission team asks?", options: ["Which rocket is the biggest?", "What do we want to learn, and where do we need to go to learn it?", "How much will the paint cost?"], answer: 1, why: "The science goal drives everything else: destination, instruments, spacecraft size and rocket. NASA's Webb \"Build It Yourself\" game teaches exactly this." } },
  { id: "deltav", cml: 2, title: "The delta-v price list", blurb: "Every manoeuvre has a price", build: lessonDeltaV,
    quiz: { q: "Landing on the Moon from lunar orbit (about 1.7 km/s) and climbing back up (about 1.9 km/s) costs roughly how much delta-v in total?", options: ["0.4 km/s", "3.6 km/s", "12 km/s"], answer: 1, why: "1.7 + 1.9 = 3.6 km/s. With no atmosphere to help, the Moon is a rocket-powered landing in both directions." } },
  { id: "rocket-equation", cml: 2, title: "The rocket equation", blurb: "Why rockets are mostly fuel", build: lessonRocketEquation,
    quiz: { q: "Why do rockets drop their empty stages?", options: ["To make the rocket look smaller", "Dead weight makes the rest accelerate less, so shedding it raises the remaining speed gain", "Empty tanks are dangerous"], answer: 1, why: "Δv depends on the ratio of starting mass to final mass. Dropping empty tanks lowers the final mass of what is left, so the next engine gets far more speed out of its propellant." } },
  { id: "transfers", cml: 2, title: "Orbits and launch windows", blurb: "Why you cannot launch whenever you like", build: lessonTransfer,
    quiz: { q: "Why do Mars missions launch only about every 26 months?", options: ["Earth and Mars must be at the right angle for the cheapest transfer, and that repeats every 26 months", "Mars is hidden behind the Sun the rest of the time", "Rockets are only built every two years"], answer: 0, why: "The spacecraft coasts for about 7 to 9 months while Mars keeps moving, so it must leave when Mars is about 44° ahead. That alignment repeats every synodic period." } },
  { id: "launch", cml: 6, title: "Launch day", blurb: "A real launch, moment by moment", build: lessonLaunch,
    quiz: { q: "Why is \"Max Q\" a critical moment in a launch?", options: ["The rocket runs out of fuel", "Speed and air density combine to put the greatest aerodynamic load on the rocket", "The crew sleeps"], answer: 1, why: "Dynamic pressure is ½ρv². Early on the air is thick but the rocket is slow. Later it is fast but the air is thin. The product peaks once, about a minute and a half in for Apollo." } },
  { id: "maturity", cml: 4, title: "How real missions mature", blurb: "From napkin to launch pad", build: lessonMaturity,
    quiz: { q: "In real mission design, what comes right before a complete point design?", options: ["Launch", "Trade space: comparing many options to see which choices matter", "Splashdown"], answer: 1, why: "Teams explore the trade space (bigger tank versus more engines, one stage versus two) before locking in one design. Jumping straight to a design risks missing a better one." } },
  { id: "missions", cml: 6, title: "Real missions", blurb: "What actually happened", build: lessonMissions,
    quiz: { q: "Why did Voyager 1 visit Jupiter and Saturn on the way out of the Solar System?", options: ["It was lost", "Gravity assists: flying past a planet can add speed without using propellant", "To take photographs only"], answer: 1, why: "A spacecraft that passes a moving planet can steal a little of the planet's orbital energy. Voyager used Jupiter and Saturn as slingshots." } },
  { id: "crew-health", cml: 5, title: "Keeping a crew alive: radiation and fatigue", blurb: "Radiation doses and tired crews", build: lessonCrewHealth,
    quiz: { q: "Why is a round trip to Mars so much harder on radiation than six months on the International Space Station?", options: ["Mars is much colder", "Away from Earth's magnetic field the dose rate is more than double (about 1.6 against 0.7 mSv a day), and the trip lasts far longer", "Spacecraft to Mars carry no shielding at all"], answer: 1, why: "The measured rates are about 0.68 mSv a day on the station and about 1.58 mSv a day in deep space, and a Mars mission adds months of travel on top. That is why NASA's career limit of 600 mSv is a design driver for Mars." } },
];

export function academyScreen(): HTMLElement {
  let current = LESSONS.find((l) => !isDone(l.id)) ?? LESSONS[0];
  let answered: number | null = null;
  const main = h("div", { class: "ac-main" });
  const nav = h("nav", { class: "ac-nav", "aria-label": "Lessons" });

  const render = () => {
    stopAnim();
    answered = null;
    nav.replaceChildren(
      h("h3", null, "Mission Academy"),
      h("p", { class: "muted small" }, "Learn how real missions are planned, one step at a time. Each lesson ends with a question; answer right for 5 research points."),
      ...LESSONS.map((l, i) =>
        h("button", { class: `ac-item${l.id === current.id ? " active" : ""}${isDone(l.id) ? " done" : ""}`, onclick: () => { current = l; audio.sfx("click"); render(); } }, h("span", { class: "ac-num mono" }, isDone(l.id) ? "✓" : String(i + 1)), h("span", null, h("strong", null, l.title), h("small", null, `CML ${l.cml} · ${l.blurb}`))),
      ),
    );
    const quizBox = h("div", { class: "ac-quiz" });
    const drawQuiz = () => {
      const q = current.quiz;
      fill(quizBox, 
        h("h4", null, "Check yourself"),
        h("p", null, q.q),
        h("div", { class: "ac-options" }, ...q.options.map((o, i) => h("button", { class: `ac-opt${answered === i ? (i === q.answer ? " right" : " wrong") : ""}`, disabled: answered === q.answer, onclick: () => choose(i) }, o))),
        answered !== null ? h("p", { class: answered === q.answer ? "ok" : "warn" }, answered === q.answer ? `Correct. ${q.why}` : "Not quite. Think about it again, then try another answer.") : null,
        isDone(current.id) ? h("p", { class: "ok small" }, "Lesson complete.") : null,
      );
    };
    const choose = (i: number) => {
      answered = i;
      if (i === current.quiz.answer) {
        audio.sfx("success");
        if (!isDone(current.id) && store.get().game) {
          store.updateGame((g) => {
            g.achievements.push(doneKey(current.id));
            g.researchPoints += 5;
          });
        }
        nav.querySelectorAll(".ac-item").forEach((el, idx) => el.classList.toggle("done", isDone(LESSONS[idx].id)));
      } else audio.sfx("error");
      drawQuiz();
      renderNavState();
    };
    const renderNavState = () => {
      nav.querySelectorAll(".ac-item").forEach((el, idx) => {
        el.classList.toggle("done", isDone(LESSONS[idx].id));
        const num = el.querySelector(".ac-num");
        if (num) num.textContent = isDone(LESSONS[idx].id) ? "✓" : String(idx + 1);
      });
    };
    drawQuiz();
    main.replaceChildren(
      h("div", { class: "ac-head" }, h("span", { class: "tag" }, `Concept maturity level ${current.cml}`), h("h2", null, current.title)),
      current.build(),
      quizBox,
      h("details", { class: "ac-sources" }, h("summary", null, "Sources and credits"), h("ul", null, ...SOURCES.map((s) => h("li", null, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.name), ` (${s.use})`))), h("p", { class: "muted small" }, DISCLAIMER)),
    );
    main.scrollTop = 0;
  };
  render();
  router.onLeave(() => stopAnim());
  return gameShell("academy", h("div", { class: "ac" }, nav, main));
}
