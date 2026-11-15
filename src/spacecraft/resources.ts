import type { MissionDef } from "../missions/missions";
import type { OrbitOption } from "../missions/orbits";
import type { Design, Stats } from "./design";
import { part } from "./design";
import type { AntennaPart, SciencePart } from "./parts";

/**
 * Data and lifetime models. Instrument and radio data rates are game values of the right order of
 * magnitude for small science spacecraft, not specifications of real hardware. Link rates fall with the
 * square of distance, as radio signals do. Orbit-dependent figures come from src/missions/orbits.ts.
 */
export const INSTRUMENT_MBPS: Record<SciencePart["style"], number> = { camera: 2, spectrometer: 0.5, seismometer: 0.01, drill: 0.05 };

/** Fastest link each antenna type can make, and its rate at the maximum range it is rated for. */
export const ANTENNA_LINK: Record<AntennaPart["style"], { maxMbps: number; refKbps: number }> = {
  patch: { maxMbps: 1, refKbps: 1 },
  dish: { maxMbps: 10, refKbps: 0.5 },
  hga: { maxMbps: 100, refKbps: 1 },
};

/** Share of the time the instruments are actually recording. */
export const OBSERVING_DUTY = 0.25;

/** Design lifetime asked of each mission, days. Game targets inspired by real missions' planned lives. */
export const DESIGN_LIFE_DAYS: Record<string, number> = {
  "s1-first-satellite": 120,
  "s1-earth-watch": 365,
  "s2-lunar-orbiter": 180,
  "s2-lunar-lander": 14,
  "s2-lunar-rover": 90,
  "s3-mars-orbiter": 687,
  "s3-mars-lander": 90,
  "s3-sample-collection": 60,
  "s4-deep-space": 1_825,
};

export const designLifeDays = (m: MissionDef): number => DESIGN_LIFE_DAYS[m.id] ?? 30;

/** Typical distance of the radio link, km. */
export function linkDistanceKm(m: MissionDef, o: OrbitOption): number {
  const d = m.destination.toLowerCase();
  if (d.includes("outer")) return 600_000_000;
  if (d.includes("mars")) return 225_000_000;
  if (d.includes("moon")) return 384_400;
  return Math.max(1_500, o.altKm * 1.3);
}

export interface DataBudget {
  instrumentMbps: number;
  linkMbps: number;
  contactMinPerDay: number;
  generatedGbPerDay: number;
  downlinkGbPerDay: number;
  /** Share of the data that can reach Earth, 0 to 100. */
  returnPct: number;
}

export function dataBudget(design: Design, m: MissionDef, o: OrbitOption): DataBudget {
  const parts = design.parts.filter((r) => r.target === "craft").map(part);
  const instrumentMbps = parts.reduce((n, p) => (p.category === "science" ? n + INSTRUMENT_MBPS[p.style] : n), 0);
  const dist = linkDistanceKm(m, o);
  let linkMbps = 0;
  for (const p of parts) {
    if (p.category !== "antenna") continue;
    const range = p.rangeMkm * 1_000_000;
    if (dist > range) continue;
    const spec = ANTENNA_LINK[p.style];
    linkMbps = Math.max(linkMbps, Math.min(spec.maxMbps, (spec.refKbps / 1000) * (range / dist) ** 2));
  }
  const contact = o.contactFraction;
  const generated = (instrumentMbps * OBSERVING_DUTY * 86_400) / 1000;
  const down = (linkMbps * contact * 86_400) / 1000;
  return {
    instrumentMbps, linkMbps, contactMinPerDay: contact * 1_440, generatedGbPerDay: generated, downlinkGbPerDay: down,
    returnPct: generated <= 0 ? 100 : Math.min(100, (down / generated) * 100),
  };
}

export interface Lifetime {
  days: number;
  neededDays: number;
  limiter: "orbit and propellant" | "solar array ageing";
  reserveDv: number;
}

const MAX_LIFE_DAYS = 7_300;

/** The shorter of: how long the orbit can be kept with the spare delta-v, and how long the solar arrays keep up with the load. */
export function lifetime(stats: Stats, m: MissionDef, o: OrbitOption, requiredDv: number): Lifetime {
  const reserveDv = Math.max(0, stats.deltaV - requiredDv);
  const makeup = o.stationKeepingMsYr;
  const orbitDays = Math.min(MAX_LIFE_DAYS, o.naturalLifetimeDays + (makeup > 0 ? (reserveDv / makeup) * 365 : MAX_LIFE_DAYS));
  const rate = o.degradationPctYr / 100;
  const powerDays = stats.powerDraw <= 0 ? MAX_LIFE_DAYS : stats.powerGen <= stats.powerDraw ? 0 : Math.min(MAX_LIFE_DAYS, (Math.log(stats.powerGen / stats.powerDraw) / -Math.log(1 - rate)) * 365);
  const powerLimited = powerDays < orbitDays;
  return { days: Math.round(Math.min(orbitDays, powerDays)), neededDays: designLifeDays(m), limiter: powerLimited ? "solar array ageing" : "orbit and propellant", reserveDv };
}

export const powerMarginPct = (stats: Stats): number => (stats.powerDraw > 0 ? ((stats.powerGen - stats.powerDraw) / stats.powerDraw) * 100 : 100);

export function fmtDays(d: number): string {
  if (d >= MAX_LIFE_DAYS) return "20+ years";
  if (d >= 730) return `${(d / 365).toFixed(1)} years`;
  if (d >= 60) return `${Math.round(d / 30)} months`;
  return `${d} days`;
}

export const fmtGb = (gb: number): string => (gb >= 1 ? `${gb.toFixed(1)} Gb` : `${(gb * 1000).toFixed(0)} Mb`);
