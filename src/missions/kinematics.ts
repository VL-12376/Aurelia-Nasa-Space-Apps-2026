import { BODIES } from "../physics/orbital";
import { AU } from "../science/transfer";
import type { ViewKind } from "./profiles";

/** Real values in km and km/s. */
const MU_E = BODIES.earth.mu / 1e9;
const MU_MOON = 4_902.87;
const MU_MARS = 42_828.4;
const MU_SUN = 1.32712440018e11;
export const R_EARTH = 6_371;
export const R_MOON = 1_737.4;
export const R_MARS = 3_389.5;
const AU_KM = AU / 1000;
const MOON_DIST = 384_400;
const LEO_ALT = 400;
const PARK_ALT = 300;
export const C_KMS = 299_792.458;

export type Frame = "Earth" | "Moon" | "Mars" | "Sun";

export interface Kin {
  frame: Frame;
  /** Height above the surface of the frame body (0 when heliocentric). */
  altKm: number;
  /** Speed relative to the frame body, km/s. */
  velKms: number;
  /** Position in the frame, km (the Sun frame uses AU × 1e8 km for plotting). */
  pos: [number, number];
  /** Straight-line distance to Earth, km. */
  distEarthKm: number;
  /** Distance to the destination body, km. */
  distTargetKm: number;
  /** Distance from the Sun, AU (for solar power). */
  sunAu: number;
  /** Moon position in the Earth frame, km (transfer views). */
  moon?: [number, number];
  /** Earth and Mars positions in the Sun frame, AU. */
  earthSun?: [number, number];
  marsSun?: [number, number];
}

export function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 40; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/** Position and speed on a Hohmann half-ellipse at time fraction p (0 at the near point, 1 at the far point). */
export function hohmannState(r1: number, r2: number, mu: number, p: number) {
  const a = (r1 + r2) / 2;
  const e = (r2 - r1) / (r2 + r1);
  const E = solveKepler(Math.PI * Math.min(Math.max(p, 0), 1), e);
  const r = a * (1 - e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const v = Math.sqrt(mu * (2 / r - 1 / a));
  const T = Math.PI * Math.sqrt((a * a * a) / mu);
  return { r, nu, v, T, a, e };
}

const circ = (mu: number, r: number) => Math.sqrt(mu / r);
const polar = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

export interface KinContext {
  missionId: string;
  /** Mission elapsed time, s. */
  met: number;
  /** Time the ascent finished, s. */
  orbitStart: number;
  /** Heliocentric target radius in AU for the cruise phase. */
  targetAu: number;
}

const LUNAR_T = hohmannState(R_EARTH + PARK_ALT, MOON_DIST, MU_E, 0).T;
const OMEGA_MOON = (2 * Math.PI) / (27.32 * 86_400);
const OMEGA_EARTH = (2 * Math.PI) / (365.25 * 86_400);
const OMEGA_MARS = (2 * Math.PI) / (687 * 86_400);

function leoAngle(ctx: KinContext, alt = LEO_ALT): number {
  const w = circ(MU_E, R_EARTH + alt) / (R_EARTH + alt);
  return 0.3 + w * Math.max(ctx.met - ctx.orbitStart, 0);
}

function moonTransfer(p: number): Kin {
  const s = hohmannState(R_EARTH + PARK_ALT, MOON_DIST, MU_E, p);
  const pos = polar(s.r, s.nu);
  const moonAngle = Math.PI - OMEGA_MOON * LUNAR_T * (1 - p);
  const moon = polar(MOON_DIST, moonAngle);
  return {
    frame: "Earth", altKm: s.r - R_EARTH, velKms: s.v, pos, moon,
    distEarthKm: s.r, distTargetKm: Math.max(Math.hypot(pos[0] - moon[0], pos[1] - moon[1]), R_MOON + 100), sunAu: 1,
  };
}

function helioCruise(p: number, targetAu: number): Kin {
  const s = hohmannState(AU_KM, targetAu * AU_KM, MU_SUN, p);
  const rAu = s.r / AU_KM;
  const craft = polar(rAu, s.nu);
  const earth = polar(1, OMEGA_EARTH * s.T * p);
  const mars = polar(1.524, Math.PI - OMEGA_MARS * s.T * (1 - p));
  const dist = Math.hypot(craft[0] - earth[0], craft[1] - earth[1]) * AU_KM;
  const target = targetAu < 2 ? mars : polar(targetAu, Math.PI);
  return {
    frame: "Sun", altKm: 0, velKms: s.v, pos: [craft[0] * 1e8 * 1.496, craft[1] * 1e8 * 1.496], distEarthKm: dist,
    distTargetKm: Math.hypot(craft[0] - target[0], craft[1] - target[1]) * AU_KM, sunAu: rAu, earthSun: earth, marsSun: mars,
  };
}

/** Distance to Earth once the spacecraft is at its destination (planet geometry at arrival). */
function arrivalDistance(targetAu: number): number {
  const T = hohmannState(AU_KM, targetAu * AU_KM, MU_SUN, 0).T;
  const earth = polar(1, OMEGA_EARTH * T);
  const target = polar(targetAu, Math.PI);
  return Math.hypot(earth[0] - target[0], earth[1] - target[1]) * AU_KM;
}

/**
 * Motion for a phase at progress p (0 to 1). Burns report p as the share of their delta-v delivered.
 * Ascent values are a smooth model fitted to real endpoints (400 km altitude, 7.67 km/s), not an integration.
 */
export function kinematics(view: ViewKind, phaseId: string, p: number, ctx: KinContext): Kin {
  p = clamp01(p);
  const targetAu = ctx.targetAu;
  switch (view) {
    case "ascent": {
      const alt = LEO_ALT * Math.pow(p, 2.4);
      return { frame: "Earth", altKm: alt, velKms: 7.67 * Math.pow(p, 0.85), pos: polar(R_EARTH + alt, 0.3 * p * p), distEarthKm: R_EARTH + alt, distTargetKm: R_EARTH + alt, sunAu: 1 };
    }
    case "earth-orbit": {
      const v = circ(MU_E, R_EARTH + LEO_ALT);
      return { frame: "Earth", altKm: LEO_ALT, velKms: v, pos: polar(R_EARTH + LEO_ALT, leoAngle(ctx)), distEarthKm: R_EARTH + LEO_ALT, distTargetKm: R_EARTH + LEO_ALT, sunAu: 1 };
    }
    case "moon-transfer": {
      if (phaseId === "tli") {
        const r = R_EARTH + PARK_ALT;
        const v = circ(MU_E, r) + 3.13 * p;
        const a = -0.6 * (1 - p);
        const moon = polar(MOON_DIST, Math.PI - OMEGA_MOON * LUNAR_T);
        return { frame: "Earth", altKm: PARK_ALT, velKms: v, pos: polar(r, a), moon, distEarthKm: r, distTargetKm: Math.hypot(r - moon[0], moon[1]), sunAu: 1 };
      }
      return moonTransfer(phaseId === "mcc" ? 0.45 : p);
    }
    case "moon-orbit": {
      const alt = phaseId === "descent-orbit" ? lerp(100, 18, p) : 100;
      const r = R_MOON + alt;
      const v = phaseId === "loi" ? lerp(2.34, circ(MU_MOON, R_MOON + 100), p) : circ(MU_MOON, r);
      const w = circ(MU_MOON, r) / r;
      return { frame: "Moon", altKm: alt, velKms: v, pos: polar(r, 1 + w * ctx.met), distEarthKm: MOON_DIST, distTargetKm: alt, sunAu: 1 };
    }
    case "moon-descent": {
      const burning = phaseId === "descent";
      const alt = burning ? 18 * Math.pow(1 - p, 1.4) : 0;
      const v = burning ? 1.68 * (1 - Math.pow(p, 0.9)) : 0;
      return { frame: "Moon", altKm: alt, velKms: v, pos: polar(R_MOON + alt, 1.2 - 0.3 * (burning ? p : 1)), distEarthKm: MOON_DIST, distTargetKm: alt, sunAu: 1 };
    }
    case "helio": {
      if (phaseId === "tmi" || (phaseId === "tli" && targetAu > 2)) {
        const r = R_EARTH + PARK_ALT;
        const dv = targetAu > 2 ? 6.3 : 3.6;
        return { frame: "Earth", altKm: PARK_ALT, velKms: circ(MU_E, r) + dv * p, pos: polar(r, -0.6 * (1 - p)), distEarthKm: r, distTargetKm: arrivalDistance(targetAu), sunAu: 1 };
      }
      if (phaseId === "mcc") return helioCruise(0.5, targetAu);
      if (phaseId === "cruise") return helioCruise(p, targetAu);
      const end = helioCruise(1, targetAu);
      return { ...end, distEarthKm: arrivalDistance(targetAu), distTargetKm: 0 };
    }
    case "mars-orbit": {
      const alt = 400;
      const r = R_MARS + alt;
      const v = phaseId === "moi" ? lerp(5.44, 4.14, p) : circ(MU_MARS, r);
      const w = circ(MU_MARS, r) / r;
      return { frame: "Mars", altKm: alt, velKms: v, pos: polar(r, 0.5 + w * ctx.met), distEarthKm: arrivalDistance(1.524), distTargetKm: alt, sunAu: 1.524 };
    }
    case "mars-descent": {
      let alt = 0;
      let v = 0;
      if (phaseId === "entry") {
        alt = lerp(125, 10, Math.pow(p, 0.8));
        v = lerp(4.1, 0.45, Math.pow(p, 0.7));
      } else if (phaseId === "edl") {
        alt = lerp(10, 0, p);
        v = lerp(0.45, 0, p);
      }
      return { frame: "Mars", altKm: alt, velKms: v, pos: polar(R_MARS + alt, 0.9 - 0.2 * (phaseId === "entry" ? p : 1)), distEarthKm: arrivalDistance(1.524), distTargetKm: alt, sunAu: 1.524 };
    }
  }
}

/** Fraction of full sunlight reaching the panels (orbital shadow averaged in low Earth orbit). */
export function sunFactor(kin: Kin, view: ViewKind): number {
  const inverse = 1 / (kin.sunAu * kin.sunAu);
  if (view === "ascent" || view === "earth-orbit") return 0.62;
  return inverse;
}

export const lightDelaySeconds = (km: number) => km / C_KMS;
