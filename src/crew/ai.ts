import { hashSeed, mulberry32, type Flight, type PendingDecision } from "../missions/flight";
import type { MissionDef } from "../missions/missions";
import { PARTS, type AntennaPart, type EnginePart, type Part, type SciencePart, type TankPart } from "../spacecraft/parts";
import { addPart, analyse, ascentPenalty, bus, isUnlocked, requiredCommRangeMkm, type Design, type Target } from "../spacecraft/design";
import { ROLE_BY_ID, roleForEvent, type RoleId } from "./roles";

/** What an AI crew member picks for a pending flight decision, and why. */
export function aiDecide(pending: PendingDecision, f: Flight): { option: string; line: string } {
  const enabled = pending.options.filter((o) => !o.disabled).map((o) => o.id);
  const has = (id: string) => enabled.includes(id);
  const pick = (id: string, why: string) => ({ option: has(id) ? id : enabled[0], line: why });
  const n = f.stats.stages[0].engines;
  switch (pending.eventId) {
    case "engine-anomaly":
      return n > 1 ? pick("shutdown", "Shutting the faulty engine down. We have engines to spare, so we keep the stage alive.") : pick("continue", "One engine only. Shutting it down ends the flight, so we ride it out.");
    case "nav-error":
      return pick("now", "Correcting now. A small burn early is cheaper than a big one later.");
    case "comm-dropout":
      return has("backup") ? pick("backup", "Switching to the backup antenna.") : pick("autonomy", "Running the autonomous recovery script.");
    case "solar-flare":
      return pick("safe", "Safe mode. Instruments off until the particles pass.");
    case "power-brownout":
      return pick("shed", "Shedding load before the batteries die.");
    case "landing-hazard":
      return has("divert") ? pick("divert", "Diverting to a smoother site. We carry the propellant for it.") : has("hover") ? pick("hover", "Hovering to scan for a safe spot.") : pick("land", "Not enough propellant to divert. Landing on the planned site.");
    case "entry-heat":
      return has("early") && f.entryRisk() > 0.15 ? pick("early", "Firing engines early. The ballistic coefficient is too high to trust the shield alone.") : pick("trust", "The shield will hold. Riding it out.");
    case "instrument-fault":
      return pick("diagnose", "Full diagnostics. It takes longer but fixes it for good.");
    case "wind-shear":
      return pick("throttle", "Throttling down through Max Q. Better a slower climb than a bent rocket.");
    case "thrust-shortfall":
      return has("extend") ? pick("extend", "Extending the burn to make up the missing thrust.") : pick("accept", "No propellant to spare. Accepting the shortfall and correcting later.");
    case "debris-warning":
      return pick("avoid", "Dodging. A small burn is cheaper than a damaged spacecraft.");
    case "data-full":
      return pick("downlink", "Pausing to downlink. We keep every bit of the science.");
    default:
      return { option: enabled[0], line: "Going with the safest option." };
  }
}

export function ownerOf(pending: PendingDecision): RoleId {
  return roleForEvent(pending.eventId);
}

export function crewName(role: RoleId): string {
  return ROLE_BY_ID[role].name.replace(/^Dr\. /, "");
}

/* ------------------------------------------------------------------ */
/* Designing: each AI role completes its own part of the spacecraft.    */
/* ------------------------------------------------------------------ */

export interface Contribution {
  design: Design;
  notes: string[];
}

const unlocked = (researched: string[]) => PARTS.filter((p) => isUnlocked(p, researched));
const costOf = (p: Part) => p.cost;

function tryAdd(d: Design, id: string, target: Target): Design | null {
  const r = addPart(d, id, target);
  return r.ok ? r.design : null;
}

export function aiContribute(role: RoleId, design: Design, mission: MissionDef, researched: string[]): Contribution {
  switch (role) {
    case "aerospace":
      return aerospace(design, mission, researched);
    case "controller":
      return controller(design, mission, researched);
    case "science":
      return science(design, mission, researched);
    case "propulsion":
      return propulsion(design, mission, researched);
  }
}

function aerospace(design: Design, mission: MissionDef, researched: string[]): Contribution {
  const notes: string[] = [];
  let d = { ...design, parts: [...design.parts] };
  const buses = unlocked(researched).filter((p) => p.category === "structure").sort((a, b) => a.mass - b.mass);
  const used = d.parts.filter((r) => r.target === "craft" && r.partId !== bus(d)?.id).length;
  const wanted = Math.max(used + 2, 6);
  const current = bus(d);
  // A bus whose own mass plus a typical instrument load meets the mission's minimum payload.
  const fits = (b: (typeof buses)[number]) => b.mass + 200 >= mission.minPayloadKg && b.capacity >= Math.min(wanted, 7);
  const choice = buses.find(fits) ?? buses[buses.length - 1];
  if (choice && (!current || (choice.mass > current.mass && current.mass + 200 < mission.minPayloadKg))) {
    const next = tryAdd(d, choice.id, "craft");
    if (next) {
      d = next;
      notes.push(`Fitted ${choice.name}: ${choice.capacity} slots and a sturdy ${choice.mass} kg frame, enough for this mission's payload.`);
    }
  }
  for (const [cap, id, label] of [["landing", "sys-legs", "landing legs"], ["heat-shield", "sys-shield", "a heat shield"]] as const) {
    if (!mission.requiredCapabilities.includes(cap)) continue;
    if (d.parts.some((r) => r.partId === id)) continue;
    const p = PARTS.find((x) => x.id === id)!;
    if (!isUnlocked(p, researched)) {
      notes.push(`The mission needs ${label}, but that is not researched yet.`);
      continue;
    }
    const next = tryAdd(d, id, "craft");
    if (next) {
      d = next;
      notes.push(`Added ${label} because this mission requires it.`);
    }
  }
  if (!notes.length) notes.push("The bus and structure already look right for this mission.");
  return { design: d, notes };
}

function controller(design: Design, mission: MissionDef, researched: string[]): Contribution {
  const notes: string[] = [];
  let d = design;
  if (!mission.requiredCapabilities.includes("navigation")) return { design: d, notes: ["This mission needs no navigation hardware."] };
  if (!bus(d)) return { design: d, notes: ["I need a spacecraft bus before I can fit navigation."] };
  const far = /mars|outer/i.test(mission.destination);
  const imu = PARTS.find((p) => p.id === "nav-imu")!;
  const star = PARTS.find((p) => p.id === "nav-star")!;
  const want = far && isUnlocked(imu, researched) ? imu : star;
  const have = d.parts.some((r) => r.partId === "nav-imu" || r.partId === "nav-star");
  if (!have || (want.id === "nav-imu" && !d.parts.some((r) => r.partId === "nav-imu"))) {
    const next = tryAdd(d, want.id, "craft");
    if (next) {
      d = next;
      notes.push(`Fitted a ${want.name.toLowerCase()}${want.id === "nav-imu" ? ": precise navigation keeps course corrections cheap on a long trip" : ""}.`);
    } else notes.push("There is no free bus slot for navigation hardware.");
  }
  if (!notes.length) notes.push("Navigation is already covered.");
  return { design: d, notes };
}

function science(design: Design, mission: MissionDef, researched: string[]): Contribution {
  const notes: string[] = [];
  let d = design;
  if (!bus(d)) return { design: d, notes: ["I need a spacecraft bus before I can fit anything."] };
  const parts = unlocked(researched);

  // Radio
  const range = requiredCommRangeMkm(mission);
  const antennas = (parts.filter((p) => p.category === "antenna") as AntennaPart[]).sort((a, b) => a.cost - b.cost);
  const bestFitted = Math.max(0, ...d.parts.map((r) => (PARTS.find((p) => p.id === r.partId) as AntennaPart | undefined)?.rangeMkm ?? 0));
  if (bestFitted < range) {
    const a = antennas.find((x) => x.rangeMkm >= range);
    if (!a) notes.push(`No researched antenna reaches ${range} million km yet.`);
    else {
      const next = tryAdd(d, a.id, "craft");
      if (next) {
        d = next;
        notes.push(`Fitted ${a.name}: it reaches ${a.rangeMkm} million km, and this mission needs ${range}.`);
      } else notes.push("No free slot for the antenna.");
    }
  }

  // Science payload
  if (mission.requiredCapabilities.includes("science-payload")) {
    const target = 40 + (mission.difficulty - 2) * 20;
    const value = (p: SciencePart) => ({ camera: 30, spectrometer: 45, seismometer: 35, drill: 60 })[p.style];
    const fittedValue = () => d.parts.reduce((n, r) => n + ((PARTS.find((p) => p.id === r.partId) as SciencePart | undefined)?.category === "science" ? value(PARTS.find((p) => p.id === r.partId) as SciencePart) : 0), 0);
    const instruments = (parts.filter((p) => p.category === "science") as SciencePart[]).sort((a, b) => value(b) / b.cost - value(a) / a.cost);
    let guard = 0;
    while (fittedValue() < target && guard++ < 4) {
      const choice = instruments.find((i) => !d.parts.some((r) => r.partId === i.id)) ;
      if (!choice) break;
      const next = tryAdd(d, choice.id, "craft");
      if (!next) break;
      d = next;
      notes.push(`Fitted ${choice.name}: it adds science return for this mission.`);
    }
  }

  // Power
  let guard = 0;
  while (guard++ < 4) {
    const s = analyse(d);
    if (s.powerOk) break;
    const solarOptions = parts.filter((p) => p.category === "solar").sort((a, b) => a.cost - b.cost);
    const batteries = parts.filter((p) => p.category === "battery").sort((a, b) => a.cost - b.cost);
    if (s.powerGen < s.powerDraw * 1.3) {
      const p = solarOptions.find((x) => (x as { watts: number }).watts >= s.powerDraw * 1.4 - s.powerGen) ?? solarOptions[solarOptions.length - 1];
      const next = p ? tryAdd(d, p.id, "craft") : null;
      if (!next) break;
      d = next;
      notes.push(`Added ${p!.name}: the instruments draw ${Math.round(s.powerDraw)} W and the panels made ${Math.round(s.powerGen)} W.`);
    } else {
      const b = batteries.find((x) => (x as { wh: number }).wh >= s.powerDraw * 0.8 - s.batteryWh) ?? batteries[batteries.length - 1];
      const next = b ? tryAdd(d, b.id, "craft") : null;
      if (!next) break;
      d = next;
      notes.push(`Added ${b!.name} so the spacecraft survives the eclipse.`);
    }
  }
  if (!notes.length) notes.push("Power, radio and instruments already look right.");
  // Bigger power hardware also brings the payload up to the mission's minimum, with real benefit.
  guard = 0;
  while (analyse(d).payloadMass < mission.minPayloadKg && guard++ < 4) {
    const bigger = parts.filter((p) => p.category === "solar" || p.category === "battery").sort((a, b) => b.mass - a.mass).find((p) => !d.parts.some((r) => r.partId === p.id));
    const next = bigger ? tryAdd(d, bigger.id, "craft") : null;
    if (!next) break;
    d = next;
    notes.push(`Added ${bigger!.name}: more power margin, and it brings the payload up to the ${mission.minPayloadKg} kg this mission needs.`);
  }
  return { design: d, notes };
}

function propulsion(design: Design, mission: MissionDef, researched: string[]): Contribution {
  const base: Design = { ...design, parts: design.parts.filter((r) => r.target === "craft") };
  if (!bus(base)) return { design, notes: ["I need to know the payload first. Ask for a spacecraft bus."] };
  const parts = unlocked(researched);
  const boosters = (parts.filter((p) => p.category === "engine") as EnginePart[]).filter((p) => p.thrustSl > 0).sort((a, b) => b.thrustSl / b.cost - a.thrustSl / a.cost);
  const uppers = (parts.filter((p) => p.category === "engine") as EnginePart[]).sort((a, b) => b.ispVac - a.ispVac);
  const tanks = (parts.filter((p) => p.category === "tank") as TankPart[]).sort((a, b) => a.cost - b.cost);
  if (!boosters.length || !tanks.length) return { design, notes: ["There are no engines or tanks to work with."] };

  const booster = boosters[0];
  const upper = uppers.find((u) => u.thrustVac >= 100_000 || u.id === "ember-1") ?? uppers[0];
  const need = mission.requiredDeltaV * 1.05;
  let d = base;
  const mk = (id: string, t: Target, n = 1) => {
    let x: Design | null = d;
    for (let i = 0; i < n && x; i++) x = tryAdd(x, id, t);
    return x;
  };
  d = mk(booster.id, "s1") ?? d;
  d = mk(tanks[Math.min(2, tanks.length - 1)].id, "s1") ?? d;
  d = mk(upper.id, "s2") ?? d;
  d = mk(tanks[Math.min(1, tanks.length - 1)].id, "s2") ?? d;

  const score = (x: Design) => {
    const s = analyse(x);
    const dvNeed = need + ascentPenalty(s.liftoffTwr);
    const twrPenalty = s.liftoffTwr < 1.2 ? (1.2 - s.liftoffTwr) * 5000 : 0;
    return { s, value: Math.min(s.deltaV, dvNeed) - twrPenalty, done: s.deltaV >= dvNeed && s.liftoffTwr >= 1.2 && s.errors.length === 0, cost: s.cost };
  };

  for (let i = 0; i < 70; i++) {
    const cur = score(d);
    if (cur.done) break;
    let best: { design: Design; gain: number } | null = null;
    const stages: Target[] = ["s1", "s2", ...(i > 20 ? (["s3"] as Target[]) : [])];
    const candidates: Design[] = [];
    for (const st of stages) {
      for (const t of tanks) {
        const a = tryAdd(d, t.id, st);
        if (a) candidates.push(a);
      }
    }
    const e1 = tryAdd(d, booster.id, "s1");
    if (e1) candidates.push(e1);
    if (i > 20 && !d.parts.some((r) => r.target === "s3")) {
      const a = tryAdd(d, upper.id, "s3");
      const b = a ? tryAdd(a, tanks[0].id, "s3") : null;
      if (b) candidates.push(b);
    }
    for (let c of candidates) {
      // A tank that makes the vehicle too heavy to lift is repaired with extra booster engines.
      let guard = 0;
      while (analyse(c).liftoffTwr < 1.2 && guard++ < 9) {
        const n = tryAdd(c, booster.id, "s1");
        if (!n) break;
        c = n;
      }
      const next = score(c);
      const gain = (next.value - cur.value) / Math.max(next.cost - cur.cost, 1e6);
      if (next.value > cur.value && (!best || gain > best.gain)) best = { design: c, gain };
    }
    if (!best) break;
    d = best.design;
  }

  // Refine with simulated annealing: cheaper layouts that still meet every requirement.
  const objective = (x: Design) => {
    const s = analyse(x);
    const shortfall = Math.max(0, need + ascentPenalty(s.liftoffTwr) - s.deltaV);
    return s.cost + 2e6 * shortfall + 6e9 * Math.max(0, 1.1 - s.liftoffTwr) + 1e12 * s.errors.length;
  };
  const stageParts = (x: Design) => x.parts.map((r, i) => ({ r, i })).filter((p) => p.r.target !== "craft");
  const upperIds = uppers.map((u) => u.id);
  let bestD = d;
  let bestF = objective(d);
  const ITER = 6000;
  for (let round = 0; round < 3; round++) {
    const rng = mulberry32(hashSeed(`${mission.id}:${round}`));
    let cur = bestD;
    let curF = bestF;
    for (let it = 0; it < ITER; it++) {
      const temp = 4e8 * (1 - it / ITER) + 1e6;
      const sp = stageParts(cur);
      const op = rng();
      let cand: Design | null = null;
      const target = (["s1", "s2", "s3"] as Target[])[Math.floor(rng() * 3)];
      if (op < 0.35) cand = tryAdd(cur, tanks[Math.floor(rng() * tanks.length)].id, target);
      else if (op < 0.5) cand = tryAdd(cur, (target === "s1" ? booster.id : upperIds[Math.floor(rng() * upperIds.length)]), target);
      else if (sp.length) {
        const victim = sp[Math.floor(rng() * sp.length)];
        const removed = { ...cur, parts: cur.parts.filter((_, i) => i !== victim.i) };
        cand = op < 0.85 ? removed : tryAdd(removed, victim.r.partId, (["s1", "s2", "s3"] as Target[])[Math.floor(rng() * 3)]);
      }
      if (!cand) continue;
      const f = objective(cand);
      if (f < curF || rng() < Math.exp((curF - f) / temp)) {
        cur = cand;
        curF = f;
        if (f < bestF) {
          bestD = cand;
          bestF = f;
        }
      }
    }
  }
  d = bestD;
  const s = analyse(d);
  const dvNeed = need + ascentPenalty(s.liftoffTwr);
  const notes = [
    s.deltaV >= dvNeed
      ? `Stage layout done: ${(s.deltaV / 1000).toFixed(2)} km/s of delta-v against ${(dvNeed / 1000).toFixed(2)} km/s needed, with thrust-to-weight ${s.liftoffTwr.toFixed(2)}.`
      : `This is as far as the researched parts go: ${(s.deltaV / 1000).toFixed(2)} km/s against ${(dvNeed / 1000).toFixed(2)} km/s needed. More research would unlock bigger tanks and better engines.`,
  ];
  return { design: d, notes };
}

export { costOf };
