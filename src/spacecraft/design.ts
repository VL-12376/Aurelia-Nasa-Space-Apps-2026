import { BODIES, G0, surfaceGravity } from "../physics/orbital";
import type { Capability, MissionDef } from "../missions/missions";
import type { BudgetCategoryId } from "../budget/budget";
import { PART_BY_ID, type AntennaPart, type BatteryPart, type EnginePart, type Part, type SciencePart, type SolarPart, type StructurePart, type SystemsPart, type TankPart } from "./parts";

export type Target = "s1" | "s2" | "s3" | "craft";
export const STAGE_TARGETS: Target[] = ["s1", "s2", "s3"];
export const TARGET_LABEL: Record<Target, string> = { s1: "Stage 1", s2: "Stage 2", s3: "Stage 3", craft: "Spacecraft" };

export interface PartRef {
  partId: string;
  target: Target;
}

export interface Design {
  name: string;
  parts: PartRef[];
}

export interface BuiltCraft {
  id: string;
  name: string;
  parts: PartRef[];
  costPaid: number;
  year: number;
  deltaV: number;
  payloadKg: number;
}

export const emptyDesign = (): Design => ({ name: "AUR-1", parts: [] });

const MAX_TANKS_PER_STAGE = 6;
const MAX_ENGINES_PER_STAGE = 9;
/** Decoupler and adapter hardware added above stage 1, kg. */
const INTERSTAGE_MASS = 120;
const INTERSTAGE_COST = 1_000_000;
/** Time a satellite must run from batteries in Earth's shadow, hours. */
const ECLIPSE_HOURS = 0.6;

export function part(ref: PartRef): Part {
  return PART_BY_ID[ref.partId];
}

export function partsIn(design: Design, target: Target): { ref: PartRef; index: number; part: Part }[] {
  return design.parts.map((ref, index) => ({ ref, index, part: part(ref) })).filter((x) => x.ref.target === target);
}

export function bus(design: Design): StructurePart | undefined {
  return design.parts.map(part).find((p): p is StructurePart => p.category === "structure");
}

export function slotsUsed(design: Design): number {
  return design.parts.map(part).filter((p) => p.slot === "craft" && p.category !== "structure").reduce((n, p) => n + (p.slotUse ?? 1), 0);
}

export interface AddResult {
  ok: boolean;
  design: Design;
  /** Where the part ended up. */
  target?: Target;
  reason?: string;
}

/** Returns a new design with the part added, or the reason it cannot be. */
export function addPart(design: Design, partId: string, preferred: Target): AddResult {
  const p = PART_BY_ID[partId];
  if (!p) return { ok: false, design, reason: "Unknown part." };
  const next: Design = { ...design, parts: [...design.parts] };

  if (p.slot === "craft") {
    if (p.category === "structure") {
      // One bus only: a new bus replaces the old one if everything still fits.
      const others = next.parts.filter((r) => part(r).category !== "structure");
      const used = others.filter((r) => r.target === "craft").reduce((n, r) => n + (part(r).slotUse ?? 1), 0);
      if (used > (p as StructurePart).capacity && used > 0) return { ok: false, design, reason: `${p.name} only holds ${(p as StructurePart).capacity} components, but ${used} are fitted.` };
      next.parts = [...others, { partId, target: "craft" }];
      return { ok: true, design: next, target: "craft" };
    }
    const b = bus(design);
    if (!b) return { ok: false, design, reason: "Add a spacecraft bus first. Components mount on it." };
    if (slotsUsed(design) + (p.slotUse ?? 1) > b.capacity) return { ok: false, design, reason: `${b.name} is full (${b.capacity} slots). Remove something or choose a larger bus.` };
    next.parts.push({ partId, target: "craft" });
    return { ok: true, design: next, target: "craft" };
  }

  const target: Target = preferred === "craft" ? "s1" : preferred;
  const inStage = partsIn(design, target);
  if (p.category === "tank" && inStage.filter((x) => x.part.category === "tank").length >= MAX_TANKS_PER_STAGE) return { ok: false, design, reason: `A stage holds at most ${MAX_TANKS_PER_STAGE} tanks.` };
  if (p.category === "engine" && inStage.filter((x) => x.part.category === "engine").length >= MAX_ENGINES_PER_STAGE) return { ok: false, design, reason: `A stage holds at most ${MAX_ENGINES_PER_STAGE} engines.` };
  next.parts.push({ partId, target });
  return { ok: true, design: next, target };
}

export function removePartAt(design: Design, index: number): Design {
  const parts = design.parts.filter((_, i) => i !== index);
  // Removing the bus also removes what was mounted on it.
  const removed = design.parts[index];
  return { ...design, parts: removed && part(removed).category === "structure" ? parts.filter((r) => r.target !== "craft") : parts };
}

export interface StageStat {
  target: Target;
  index: number;
  active: boolean;
  tanks: number;
  engines: number;
  dryMass: number;
  propellant: number;
  wetMass: number;
  thrustVac: number;
  thrustSl: number;
  isp: number;
  deltaV: number;
  burnTime: number;
  /** Mass at ignition including everything above, and mass at burnout, kg. */
  m0: number;
  mf: number;
  /** Thrust-to-weight when this stage ignites (vacuum thrust for upper stages). */
  twr: number;
  diameter: number;
}

export interface Stats {
  totalMass: number;
  dryMass: number;
  payloadMass: number;
  propellant: number;
  stages: StageStat[];
  thrustSl: number;
  thrustVac: number;
  liftoffTwr: number;
  deltaV: number;
  powerGen: number;
  powerDraw: number;
  batteryWh: number;
  eclipseHours: number;
  powerOk: boolean;
  commRangeMkm: number;
  capabilities: Capability[];
  cost: number;
  costByCategory: Record<BudgetCategoryId, number>;
  slotsUsed: number;
  slotsCapacity: number;
  errors: string[];
  warnings: string[];
}

const categoryForBudget = (p: Part): BudgetCategoryId => (p.category === "engine" ? "propulsion" : p.category === "science" ? "instruments" : "spacecraft");

export function analyse(design: Design): Stats {
  const all = design.parts.map(part);
  const craftParts = design.parts.filter((r) => r.target === "craft").map(part);
  const craftMass = craftParts.reduce((n, p) => n + p.mass, 0);

  const solar = craftParts.filter((p): p is SolarPart => p.category === "solar");
  const batteries = craftParts.filter((p): p is BatteryPart => p.category === "battery");
  const antennas = craftParts.filter((p): p is AntennaPart => p.category === "antenna");
  const science = craftParts.filter((p): p is SciencePart => p.category === "science");
  const systems = craftParts.filter((p): p is SystemsPart => p.category === "systems");

  const powerGen = solar.reduce((n, p) => n + p.watts, 0);
  const powerDraw = [...antennas, ...science, ...systems].reduce((n, p) => n + p.draw, 0);
  const batteryWh = batteries.reduce((n, p) => n + p.wh, 0);
  const eclipseHours = powerDraw > 0 ? batteryWh / powerDraw : batteryWh > 0 ? Infinity : 0;
  const powerOk = powerGen > 0 && powerGen >= powerDraw && (powerDraw === 0 || eclipseHours >= ECLIPSE_HOURS);

  const capabilities = new Set<Capability>();
  if (powerOk) capabilities.add("power");
  if (antennas.length) capabilities.add("communications");
  if (science.length) capabilities.add("science-payload");
  for (const s of systems) capabilities.add(s.capability);

  // Stage accounting, bottom stage first. Build raw numbers, then work from the top down.
  const raw = STAGE_TARGETS.map((target, i) => {
    const parts = design.parts.filter((r) => r.target === target).map(part);
    const tanks = parts.filter((p): p is TankPart => p.category === "tank");
    const engines = parts.filter((p): p is EnginePart => p.category === "engine");
    const propellant = tanks.reduce((n, p) => n + p.propellant, 0);
    const hardware = parts.reduce((n, p) => n + p.mass, 0);
    const active = parts.length > 0;
    const dry = hardware + (active && i > 0 ? INTERSTAGE_MASS : 0);
    const thrustVac = engines.reduce((n, p) => n + p.thrustVac, 0);
    const thrustSl = engines.reduce((n, p) => n + p.thrustSl, 0);
    const mdotVac = engines.reduce((n, p) => n + p.thrustVac / (p.ispVac * G0), 0);
    const mdotSl = engines.reduce((n, p) => n + (p.ispSl > 0 ? p.thrustSl / (p.ispSl * G0) : 0), 0);
    const ispVac = mdotVac > 0 ? thrustVac / (mdotVac * G0) : 0;
    const ispSl = mdotSl > 0 ? thrustSl / (mdotSl * G0) : ispVac;
    // The booster burns through thick air to thin: use the mean of sea-level and vacuum efficiency.
    const isp = i === 0 && thrustSl > 0 ? (ispVac + ispSl) / 2 : ispVac;
    return { target, i, parts, tanks, engines, propellant, dry, wet: dry + propellant, thrustVac, thrustSl, isp, active, diameter: tanks.length ? Math.max(...tanks.map((t) => t.diameter)) : engines.length ? Math.max(...engines.map((e) => e.diameter)) * 1.6 : 0 };
  });

  let above = craftMass;
  const stages: StageStat[] = [];
  for (let i = raw.length - 1; i >= 0; i--) {
    const r = raw[i];
    const m0 = r.wet + above;
    const mf = m0 - r.propellant;
    const usable = r.active && r.engines.length > 0 && r.propellant > 0 && r.isp > 0;
    const dv = usable ? r.isp * G0 * Math.log(m0 / mf) : 0;
    const thrust = i === 0 ? r.thrustSl : r.thrustVac;
    const gRef = i === 0 ? surfaceGravity(BODIES.earth) : G0;
    const flow = r.isp > 0 ? r.thrustVac / (r.isp * G0) : 0;
    stages[i] = {
      target: r.target, index: i + 1, active: r.active, tanks: r.tanks.length, engines: r.engines.length,
      dryMass: r.dry, propellant: r.propellant, wetMass: r.wet, thrustVac: r.thrustVac, thrustSl: r.thrustSl,
      isp: r.isp, deltaV: dv, burnTime: flow > 0 ? r.propellant / flow : 0, m0, mf,
      twr: m0 > 0 ? thrust / (m0 * gRef) : 0, diameter: r.diameter,
    };
    above = m0;
  }

  const totalMass = above;
  const cost = design.parts.reduce((n, r) => n + part(r).cost, 0) + stages.filter((s) => s.active && s.index > 1).length * INTERSTAGE_COST;
  const costByCategory = { spacecraft: 0, propulsion: 0, instruments: 0, research: 0, testing: 0, operations: 0, repairs: 0 } as Record<BudgetCategoryId, number>;
  for (const p of all) costByCategory[categoryForBudget(p)] += p.cost;
  costByCategory.spacecraft += stages.filter((s) => s.active && s.index > 1).length * INTERSTAGE_COST;

  const b = bus(design);
  const errors: string[] = [];
  const warnings: string[] = [];
  const launchStages = stages.filter((s) => s.active);
  if (!b) errors.push("No spacecraft bus.");
  if (!launchStages.length) errors.push("No launch stage: add an engine and tanks.");
  for (const s of launchStages) {
    if (s.engines === 0) errors.push(`Stage ${s.index} has no engine.`);
    else if (s.propellant === 0) errors.push(`Stage ${s.index} has no fuel tank.`);
  }
  // A gap (stage 3 without stage 2) is legal in the maths but confusing; call it out.
  if (stages[2].active && !stages[1].active) warnings.push("Stage 3 is fitted but Stage 2 is empty.");
  const first = stages[0];
  if (first.active && first.engines > 0 && first.thrustSl === 0) errors.push("Stage 1 engines produce no sea-level thrust and cannot lift off.");
  else if (first.active && first.engines > 0 && first.propellant > 0 && first.twr <= 1) errors.push(`Lift-off thrust-to-weight is ${first.twr.toFixed(2)}. It must be above 1.`);
  else if (first.active && first.twr > 0 && first.twr < 1.2) warnings.push("Low lift-off thrust-to-weight: gravity and drag losses will be high.");
  if (b && powerDraw > powerGen) warnings.push("Power draw exceeds generation.");
  else if (b && powerDraw > 0 && eclipseHours < ECLIPSE_HOURS) warnings.push("Batteries cannot cover a 36 minute eclipse.");
  if (b && !antennas.length) warnings.push("No antenna: the spacecraft cannot talk to Earth.");

  return {
    totalMass, dryMass: totalMass - stages.reduce((n, s) => n + s.propellant, 0), payloadMass: craftMass,
    propellant: stages.reduce((n, s) => n + s.propellant, 0), stages,
    thrustSl: first.thrustSl, thrustVac: first.thrustVac, liftoffTwr: first.active ? first.twr : 0,
    deltaV: stages.reduce((n, s) => n + s.deltaV, 0),
    powerGen, powerDraw, batteryWh, eclipseHours, powerOk,
    commRangeMkm: antennas.length ? Math.max(...antennas.map((a) => a.rangeMkm)) : 0,
    capabilities: [...capabilities], cost, costByCategory,
    slotsUsed: slotsUsed(design), slotsCapacity: b?.capacity ?? 0, errors, warnings,
  };
}

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

/** Extra delta-v lost to gravity when the vehicle climbs slowly (low thrust-to-weight), m/s. */
export function ascentPenalty(twr: number): number {
  return twr > 0 ? Math.min(900, Math.max(0, (1.3 - twr) * 600)) : 0;
}

/** Farthest radio link the mission needs, million km (simplified). */
export function requiredCommRangeMkm(m: MissionDef): number {
  const d = m.destination.toLowerCase();
  if (d.includes("outer")) return 6_000;
  if (d.includes("mars")) return 400;
  if (d.includes("moon")) return 0.4;
  return 0.002;
}

export function missionChecks(stats: Stats, m: MissionDef): Check[] {
  const penalty = ascentPenalty(stats.liftoffTwr);
  const need = m.requiredDeltaV + penalty;
  const checks: Check[] = [
    { label: "Lifts off", ok: stats.liftoffTwr > 1, detail: `Thrust-to-weight ${stats.liftoffTwr.toFixed(2)}` },
    { label: "Delta-v", ok: stats.deltaV >= need, detail: `${(stats.deltaV / 1000).toFixed(2)} of ${(need / 1000).toFixed(2)} km/s${penalty > 0 ? " (incl. slow-climb losses)" : ""}` },
    { label: "Payload", ok: stats.payloadMass >= m.minPayloadKg, detail: `${Math.round(stats.payloadMass)} of ${m.minPayloadKg} kg minimum` },
  ];
  const needRange = requiredCommRangeMkm(m);
  checks.push({ label: "Radio range", ok: stats.commRangeMkm >= needRange, detail: `${stats.commRangeMkm} of ${needRange} million km` });
  for (const c of m.requiredCapabilities) {
    checks.push({ label: CAPABILITY_LABEL[c], ok: stats.capabilities.includes(c), detail: stats.capabilities.includes(c) ? "Fitted" : "Missing" });
  }
  return checks;
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  power: "Power",
  communications: "Communications",
  navigation: "Navigation",
  landing: "Landing system",
  "heat-shield": "Heat shield",
  "science-payload": "Science payload",
};

export function isUnlocked(p: Part, researched: string[]): boolean {
  return p.tech === null || researched.includes(p.tech);
}

/** Cost of a design minus anything the player cannot afford, per budget category. */
export function canAfford(funds: number, stats: Stats): boolean {
  return stats.cost <= funds;
}
