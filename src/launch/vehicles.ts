import type { MissionDef } from "../missions/missions";
import type { OrbitOption } from "../missions/orbits";
import type { Design, PartRef, Target } from "../spacecraft/design";
import { PART_BY_ID, type EnginePart, type TankPart } from "../spacecraft/parts";

/**
 * A catalogue of launch vehicles built from published figures (launch-service user guides and NASA
 * pages), simplified to two or three serial stages so the game's flight simulation can fly them.
 * Stage masses, thrust and Isp are approximate; payload capacities are the published values to the
 * stated orbit class and are what the compatibility check compares against.
 */
export interface LaunchVehicle {
  id: string;
  name: string;
  operator: string;
  blurb: string;
  firstFlight: string;
  /** Published payload capacity, kg, by orbit class. A missing entry means the vehicle is not rated for it. */
  capacity: { leo?: number; gto?: number; tli?: number };
  capacityNote: string;
  priceUsd: number;
  priceNote: string;
  source: string;
  stages: { target: Target; tank: TankPart; engine: EnginePart; engineCount: number }[];
}

const M = 1_000_000;

interface StageSpec {
  name: string;
  dryKg: number;
  engineKg: number;
  /** Number of engines the stage's total thrust and mass are split across. */
  engines: number;
  propKg: number;
  thrustSlKn: number;
  thrustVacKn: number;
  ispSl: number;
  ispVac: number;
  diameter: number;
  height: number;
}

function stage(vid: string, target: Target, n: number, s: StageSpec): LaunchVehicle["stages"][number] {
  const tank: TankPart = {
    id: `${vid}-s${n}-tank`, name: `${s.name} tanks`, category: "tank", blurb: `${s.name} propellant tanks and structure.`, mass: s.dryKg - s.engineKg, cost: 0, tech: null,
    slot: "stage", propellant: s.propKg, diameter: s.diameter, height: s.height, launcher: true,
  };
  const k = s.engines;
  const engine: EnginePart = {
    id: `${vid}-s${n}-engine`, name: `${s.name} engine`, category: "engine", blurb: `${s.name} engine.`, mass: s.engineKg / k, cost: 0, tech: null, slot: "stage",
    thrustVac: (s.thrustVacKn * 1000) / k, thrustSl: (s.thrustSlKn * 1000) / k, ispVac: s.ispVac, ispSl: s.ispSl, diameter: Math.max(0.5, (s.diameter * 0.6) / Math.sqrt(k)), length: Math.max(0.8, s.diameter * 0.8), launcher: true,
  };
  return { target, tank, engine, engineCount: k };
}

export const LAUNCHERS: readonly LaunchVehicle[] = [
  {
    id: "electron", name: "Electron", operator: "Rocket Lab", firstFlight: "2017",
    blurb: "A small, low-cost launcher for light satellites. Two stages and nine small engines on the first.",
    capacity: { leo: 300 }, capacityNote: "About 300 kg to low Earth orbit.", priceUsd: 7.5 * M, priceNote: "About $7.5 million per launch.", source: "Rocket Lab Electron payload user's guide",
    stages: [
      stage("electron", "s1", 1, { name: "Electron stage 1", dryKg: 950, engineKg: 315, engines: 9, propKg: 9_250, thrustSlKn: 224, thrustVacKn: 232, ispSl: 311, ispVac: 343, diameter: 1.2, height: 12 }),
      stage("electron", "s2", 2, { name: "Electron stage 2", dryKg: 250, engineKg: 35, engines: 1, propKg: 2_150, thrustSlKn: 0, thrustVacKn: 25.8, ispSl: 0, ispVac: 343, diameter: 1.2, height: 4 }),
    ],
  },
  {
    id: "falcon9", name: "Falcon 9 (expendable)", operator: "SpaceX", firstFlight: "2010",
    blurb: "A workhorse medium launcher. Flown here without recovering the first stage, which gives its full published capacity.",
    capacity: { leo: 22_800, gto: 8_300 }, capacityNote: "About 22.8 t to low Earth orbit and 8.3 t to geostationary transfer when expended.", priceUsd: 62 * M, priceNote: "About $62 million list price.", source: "SpaceX Falcon 9 user's guide",
    stages: [
      stage("falcon9", "s1", 1, { name: "Falcon 9 stage 1", dryKg: 25_600, engineKg: 4_230, engines: 9, propKg: 395_700, thrustSlKn: 7_607, thrustVacKn: 8_227, ispSl: 282, ispVac: 311, diameter: 3.7, height: 41 }),
      stage("falcon9", "s2", 2, { name: "Falcon 9 stage 2", dryKg: 4_000, engineKg: 500, engines: 1, propKg: 92_670, thrustSlKn: 0, thrustVacKn: 934, ispSl: 0, ispVac: 348, diameter: 3.7, height: 14 }),
    ],
  },
  {
    id: "atlas5-401", name: "Atlas V 401", operator: "United Launch Alliance", firstFlight: "2002",
    blurb: "A reliable NASA science launcher with a kerosene first stage and a hydrogen Centaur upper stage. It launched the Lunar Reconnaissance Orbiter and Landsat 9.",
    capacity: { leo: 9_797, gto: 4_750, tli: 4_250 }, capacityNote: "About 9.8 t to low Earth orbit and 4.75 t to geostationary transfer. The lunar figure is inferred from the combined mass of LRO and LCROSS, which it sent to the Moon.", priceUsd: 109 * M, priceNote: "About $109 million.", source: "ULA Atlas V launch services user's guide; NASA LRO launch page",
    stages: [
      stage("atlas5", "s1", 1, { name: "Atlas V first stage", dryKg: 20_500, engineKg: 5_480, engines: 1, propKg: 284_450, thrustSlKn: 3_827, thrustVacKn: 4_152, ispSl: 311, ispVac: 338, diameter: 3.8, height: 32 }),
      stage("atlas5", "s2", 2, { name: "Centaur", dryKg: 2_247, engineKg: 168, engines: 1, propKg: 20_830, thrustSlKn: 0, thrustVacKn: 99.2, ispSl: 0, ispVac: 450.5, diameter: 3.05, height: 12.7 }),
    ],
  },
  {
    id: "saturn5", name: "Saturn V", operator: "NASA (Apollo, retired)", firstFlight: "1967",
    blurb: "The rocket that sent people to the Moon. Three stages and 13 engines. Flown 13 times from 1967 to 1973 and now retired; included to compare with today's heavy launchers.",
    capacity: { leo: 140_000, tli: 48_600 }, capacityNote: "About 140 t to low Earth orbit and 48.6 t toward the Moon.", priceUsd: 1_200 * M, priceNote: "About $1.2 billion in today's money (about $185 million in 1969).", source: "NASA Apollo program summary; Saturn V flight manual",
    stages: [
      stage("saturn5", "s1", 1, { name: "S-IC", dryKg: 135_000, engineKg: 40_000, engines: 5, propKg: 2_150_000, thrustSlKn: 34_500, thrustVacKn: 38_000, ispSl: 263, ispVac: 304, diameter: 10.1, height: 42 }),
      stage("saturn5", "s2", 2, { name: "S-II", dryKg: 36_000, engineKg: 6_000, engines: 5, propKg: 460_000, thrustSlKn: 0, thrustVacKn: 5_100, ispSl: 0, ispVac: 421, diameter: 10.1, height: 25 }),
      stage("saturn5", "s3", 3, { name: "S-IVB", dryKg: 13_500, engineKg: 1_600, engines: 1, propKg: 106_000, thrustSlKn: 0, thrustVacKn: 1_000, ispSl: 0, ispVac: 421, diameter: 6.6, height: 18 }),
    ],
  },
  {
    id: "sls1", name: "Space Launch System Block 1", operator: "NASA", firstFlight: "2022",
    blurb: "NASA's current heavy launcher for Artemis. Two solid boosters and four RS-25 engines on the core stage, with an upper stage for the push toward the Moon. The two boosters and the core's first minutes are modelled here as one stage.",
    capacity: { leo: 95_000, tli: 27_000 }, capacityNote: "About 95 t to low Earth orbit and 27 t toward the Moon.", priceUsd: 2_200 * M, priceNote: "About $2.2 billion per launch (NASA Office of Inspector General estimate of marginal cost).", source: "NASA SLS reference guide; NASA OIG report on Artemis costs",
    stages: [
      stage("sls1", "s1", 1, { name: "SLS boosters and core (liftoff)", dryKg: 200_000, engineKg: 1_000, engines: 6, propKg: 1_518_000, thrustSlKn: 39_100, thrustVacKn: 42_000, ispSl: 262.6, ispVac: 299, diameter: 8.4, height: 65 }),
      stage("sls1", "s2", 2, { name: "SLS core stage", dryKg: 85_300, engineKg: 14_000, engines: 4, propKg: 729_000, thrustSlKn: 0, thrustVacKn: 9_100, ispSl: 0, ispVac: 452, diameter: 8.4, height: 30 }),
      stage("sls1", "s3", 3, { name: "Interim Cryogenic Propulsion Stage", dryKg: 3_500, engineKg: 301, engines: 1, propKg: 27_000, thrustSlKn: 0, thrustVacKn: 110, ispSl: 0, ispVac: 462, diameter: 5.1, height: 13.7 }),
    ],
  },
];

for (const v of LAUNCHERS) for (const s of v.stages) {
  PART_BY_ID[s.tank.id] = s.tank;
  PART_BY_ID[s.engine.id] = s.engine;
}

export const LAUNCHER_BY_ID: Record<string, LaunchVehicle> = Object.fromEntries(LAUNCHERS.map((v) => [v.id, v]));

export const OWN_ROCKET = "own";

/** The player's spacecraft sitting on a catalogue launch vehicle; any stages they designed are not used. */
export function composeDesign(design: Design, v: LaunchVehicle | null): Design {
  if (!v) return design;
  const craft = design.parts.filter((r) => r.target === "craft");
  const rocket: PartRef[] = v.stages.flatMap((s) => [
    { partId: s.tank.id, target: s.target },
    ...Array.from({ length: s.engineCount }, () => ({ partId: s.engine.id, target: s.target })),
  ]);
  return { ...design, parts: [...craft, ...rocket] };
}

export type OrbitClass = "leo" | "gto" | "moon" | "mars" | "deep";

export function orbitClass(m: MissionDef, o: OrbitOption): OrbitClass {
  const d = m.destination.toLowerCase();
  if (d.includes("outer")) return "deep";
  if (d.includes("mars")) return "mars";
  if (d.includes("moon")) return "moon";
  return o.altKm > 10_000 ? "gto" : "leo";
}

export interface CapacityCheck {
  ok: boolean;
  capacityKg: number | null;
  detail: string;
}

/**
 * Published payload capacity for the mission's orbit class against the spacecraft's mass. Interplanetary
 * capacity is estimated from the lunar figure (about 60% for Mars, 25% for the outer Solar System) because
 * leaving Earth faster leaves less mass: an approximation, labelled as such.
 */
export function capacityCheck(v: LaunchVehicle, m: MissionDef, o: OrbitOption, payloadKg: number): CapacityCheck {
  const cls = orbitClass(m, o);
  const names: Record<OrbitClass, string> = { leo: "low Earth orbit", gto: "high Earth orbit", moon: "the Moon", mars: "Mars", deep: "the outer Solar System" };
  let cap: number | null = null;
  if (cls === "leo") cap = v.capacity.leo ?? null;
  else if (cls === "gto") cap = v.capacity.gto ?? null;
  else if (cls === "moon") cap = v.capacity.tli ?? null;
  else if (v.capacity.tli) cap = v.capacity.tli * (cls === "mars" ? 0.6 : 0.25);
  if (cap === null) return { ok: false, capacityKg: null, detail: `${v.name} is not rated to reach ${names[cls]}.` };
  const approx = cls === "mars" || cls === "deep" ? " (estimated)" : "";
  return { ok: payloadKg <= cap, capacityKg: cap, detail: `${v.name} can lift about ${Math.round(cap).toLocaleString("en-US")} kg to ${names[cls]}${approx}; the spacecraft is ${Math.round(payloadKg).toLocaleString("en-US")} kg.` };
}
