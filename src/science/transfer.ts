import { G0, circularOrbitVelocity, escapeVelocity, hohmannTransfer, BODIES, type Body } from "../physics/orbital";

export const AU = 1.495978707e11; // metres
export const MU_SUN = 1.32712440018e20; // m^3/s^2

/** Impulse needed to leave a circular low Earth orbit with a given hyperbolic excess speed (patched conics). */
export function departureDeltaVFromLeo(vInf: number, altitude = 300_000): number {
  const earth: Body = BODIES.earth;
  const vEscSq = escapeVelocity(earth, altitude) ** 2;
  return Math.sqrt(vInf * vInf + vEscSq) - circularOrbitVelocity(earth, altitude);
}

export interface TransferEstimate {
  /** Delta-v from a 300 km low Earth orbit, m/s. */
  departureDeltaV: number;
  /** One-way trip duration, days. */
  days: number;
  /** One-way radio delay range, minutes (closest and farthest approach). */
  lightMinutes: [number, number];
}

/**
 * Simplified Earth-to-body transfer: circular, coplanar orbits and a single Hohmann transfer.
 * Real missions use launch windows, gravity assists and corrections, so treat this as a teaching estimate.
 */
export function heliocentricTransfer(semiMajorAu: number): TransferEstimate {
  const t = hohmannTransfer(MU_SUN, AU, semiMajorAu * AU);
  const vInf = t.dv1;
  const near = Math.abs(semiMajorAu - 1) * AU;
  const far = (semiMajorAu + 1) * AU;
  return {
    departureDeltaV: departureDeltaVFromLeo(vInf),
    days: t.time / 86_400,
    lightMinutes: [near / 299_792_458 / 60, far / 299_792_458 / 60],
  };
}

/** Earth to Moon transfer from the same 300 km parking orbit. */
export function lunarTransfer(): TransferEstimate {
  const r1 = BODIES.earth.radius + 300_000;
  const r2 = 384_400_000;
  const t = hohmannTransfer(BODIES.earth.mu, r1, r2);
  return { departureDeltaV: t.dv1, days: t.time / 86_400, lightMinutes: [r2 / 299_792_458 / 60, r2 / 299_792_458 / 60] };
}

export const EARTH_G = G0;
