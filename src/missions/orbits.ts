import { BODIES, hohmannTransfer } from "../physics/orbital";
import type { MissionDef } from "./missions";

/**
 * Orbit choices. Transfer costs are computed from two-body mechanics (Hohmann transfer from the
 * 400 km reference orbit, or vis-viva for a lunar capture orbit). The other numbers are labelled
 * game approximations of typical values for each orbit class, not mission-specific data.
 */
export interface OrbitOption {
  id: string;
  label: string;
  body: "earth" | "moon" | "fixed";
  /** Altitude (circular) or periapsis altitude, km. */
  altKm: number;
  apoKm?: number;
  /** Extra delta-v compared with the reference orbit, m/s. Negative means cheaper. */
  extraDv: number;
  periodMin: number;
  /** Fraction of each day a single ground station can talk to the spacecraft. */
  contactFraction: number;
  /** Longest time in Earth's shadow per orbit, hours. */
  eclipseHours: number;
  /** Solar-array degradation, percent per year (radiation belts make it worse). */
  degradationPctYr: number;
  /** Days the orbit lasts with no propellant spent keeping it. */
  naturalLifetimeDays: number;
  /** Propellant needed to keep the orbit, m/s per year. */
  stationKeepingMsYr: number;
  blurb: string;
  coverage: string;
  tradeoff: string;
}

const MU_E = BODIES.earth.mu;
const R_E = BODIES.earth.radius;
const REF_ALT_KM = 400;

function earthExtra(altKm: number): number {
  const r1 = R_E + REF_ALT_KM * 1000;
  const r2 = R_E + altKm * 1000;
  return Math.round(hohmannTransfer(MU_E, r1, r2).total);
}

function period(body: "earth" | "moon", altKm: number): number {
  const b = BODIES[body];
  const a = b.radius + altKm * 1000;
  return (2 * Math.PI * Math.sqrt((a * a * a) / b.mu)) / 60;
}

/** Braking saved by capturing into an ellipse instead of a circle at the same periapsis, as a negative extra delta-v. */
function lunarEllipseSaving(periKm: number, apoKm: number): number {
  const mu = BODIES.moon.mu;
  const rp = BODIES.moon.radius + periKm * 1000;
  const ra = BODIES.moon.radius + apoKm * 1000;
  const a = (rp + ra) / 2;
  return -Math.round(Math.sqrt(mu * (2 / rp - 1 / a)) - Math.sqrt(mu / rp));
}

export const EARTH_ORBITS: OrbitOption[] = [
  {
    id: "leo", label: "Low Earth orbit, 400 km", body: "earth", altKm: 400, extraDv: 0, periodMin: period("earth", 400),
    contactFraction: 0.03, eclipseHours: 0.6, degradationPctYr: 2.5, naturalLifetimeDays: 365, stationKeepingMsYr: 30,
    blurb: "The cheapest orbit to reach: crewed space stations fly around here. Thin air still drags a spacecraft down slowly.",
    coverage: "Sees a narrow strip of Earth and circles every ~92 minutes.", tradeoff: "Cheap, but short passes over a ground station and the orbit decays.",
  },
  {
    id: "sso", label: "Sun-synchronous orbit, 705 km", body: "earth", altKm: 705, extraDv: earthExtra(705), periodMin: period("earth", 705),
    contactFraction: 0.045, eclipseHours: 0.6, degradationPctYr: 3, naturalLifetimeDays: 9_000, stationKeepingMsYr: 3,
    blurb: "A near-polar orbit that crosses each place at the same local time, so every picture has similar lighting. Earth-observing satellites fly here.",
    coverage: "Covers the whole planet over days, with consistent sunlight.", tradeoff: "A bit more delta-v than LEO, but it lasts for decades.",
  },
  {
    id: "meo", label: "Medium Earth orbit, 20,200 km", body: "earth", altKm: 20_200, extraDv: earthExtra(20_200), periodMin: period("earth", 20_200),
    contactFraction: 0.25, eclipseHours: 1.0, degradationPctYr: 5, naturalLifetimeDays: 1_000_000, stationKeepingMsYr: 10,
    blurb: "Navigation satellites fly here, 12 hours per orbit. The path crosses the Van Allen radiation belts, which age electronics and solar panels faster.",
    coverage: "Each satellite sees about a third of the globe at a time.", tradeoff: "Long ground contact, but a hard radiation environment.",
  },
  {
    id: "geo", label: "Geostationary orbit, 35,786 km", body: "earth", altKm: 35_786, extraDv: earthExtra(35_786), periodMin: period("earth", 35_786),
    contactFraction: 1, eclipseHours: 1.2, degradationPctYr: 3, naturalLifetimeDays: 180, stationKeepingMsYr: 50,
    blurb: "One lap takes exactly one day, so the spacecraft hangs over one spot. Weather and communications satellites sit here.",
    coverage: "Watches one third of Earth continuously.", tradeoff: "The most delta-v of the four, a far-away link, and it needs fuel to stay in its box.",
  },
];

export const MOON_ORBITS: OrbitOption[] = [
  {
    id: "llo", label: "Low lunar orbit, 100 km", body: "moon", altKm: 100, extraDv: 0, periodMin: period("moon", 100),
    contactFraction: 0.33, eclipseHours: 0.6, degradationPctYr: 2.5, naturalLifetimeDays: 90, stationKeepingMsYr: 100,
    blurb: "A tight circular orbit gives sharp pictures of the surface. Uneven lunar gravity pulls low orbits out of shape, so they need regular corrections.",
    coverage: "Best surface resolution.", tradeoff: "Most capture delta-v, and frequent station-keeping burns.",
  },
  {
    id: "lunar-ellipse", label: "Elliptical lunar orbit, 100 x 5,000 km", body: "moon", altKm: 100, apoKm: 5_000, extraDv: lunarEllipseSaving(100, 5_000), periodMin: (2 * Math.PI * Math.sqrt(Math.pow(BODIES.moon.radius + 2_550_000, 3) / BODIES.moon.mu)) / 60,
    contactFraction: 0.33, eclipseHours: 0.6, degradationPctYr: 2.5, naturalLifetimeDays: 700, stationKeepingMsYr: 20,
    blurb: "Braking into an ellipse costs less than a circle, and high orbits are steadier. The spacecraft only passes close to the surface briefly.",
    coverage: "Detailed views only near the low point.", tradeoff: "Saves propellant and lasts longer, but sees less of the surface in detail.",
  },
];

const FIXED: OrbitOption = {
  id: "mission", label: "Mission-defined orbit", body: "fixed", altKm: 0, extraDv: 0, periodMin: 0, contactFraction: 0.33, eclipseHours: 0.6,
  degradationPctYr: 3, naturalLifetimeDays: 1_000_000, stationKeepingMsYr: 20,
  blurb: "This mission's destination fixes its orbit or landing site.", coverage: "Set by the destination.", tradeoff: "Nothing to choose here.",
};

/** The orbits a player may choose between for a mission. */
export function orbitsFor(m: MissionDef): OrbitOption[] {
  if (m.id === "s2-lunar-orbiter") return MOON_ORBITS;
  if (m.id === "s1-first-satellite") return EARTH_ORBITS;
  // The Earth Watch profile already includes its polar plane change, so only polar-capable choices are offered.
  if (m.id === "s1-earth-watch") return [EARTH_ORBITS[1], EARTH_ORBITS[0]];
  return [FIXED];
}

export function defaultOrbit(m: MissionDef): OrbitOption {
  return orbitsFor(m)[0];
}

export const orbitById = (m: MissionDef, id: string | undefined): OrbitOption => orbitsFor(m).find((o) => o.id === id) ?? defaultOrbit(m);

/** Delta-v this orbit adds to (or saves from) the mission's published budget, which was written for its default orbit. */
export const planExtraDv = (m: MissionDef, o: OrbitOption): number => o.extraDv - defaultOrbit(m).extraDv;
