/**
 * Core spaceflight equations used by AURELIA's teaching simulation.
 * All units are SI (metres, kilograms, seconds) unless stated otherwise.
 * These are simplified two-body models, not flight-grade tools.
 */

export const G0 = 9.80665; // standard gravity, m/s^2
export const SPEED_OF_LIGHT = 299_792_458; // m/s

export interface Body {
  id: string;
  name: string;
  /** Standard gravitational parameter GM, m^3/s^2. */
  mu: number;
  /** Mean radius, m. */
  radius: number;
  /** Surface atmosphere note for teaching text. */
  atmosphere: string;
}

export const BODIES: Record<string, Body> = {
  earth: { id: "earth", name: "Earth", mu: 3.986004418e14, radius: 6_371_000, atmosphere: "Dense (about 101 kPa at the surface)" },
  moon: { id: "moon", name: "Moon", mu: 4.9048695e12, radius: 1_737_400, atmosphere: "None (near-vacuum)" },
  mars: { id: "mars", name: "Mars", mu: 4.282837e13, radius: 3_389_500, atmosphere: "Thin (about 0.6 kPa), mostly carbon dioxide" },
};

export function surfaceGravity(body: Body): number {
  return body.mu / (body.radius * body.radius);
}

export function escapeVelocity(body: Body, altitude = 0): number {
  return Math.sqrt((2 * body.mu) / (body.radius + altitude));
}

export function circularOrbitVelocity(body: Body, altitude: number): number {
  return Math.sqrt(body.mu / (body.radius + altitude));
}

export function orbitalPeriod(body: Body, altitude: number): number {
  const a = body.radius + altitude;
  return 2 * Math.PI * Math.sqrt((a * a * a) / body.mu);
}

/** Tsiolkovsky rocket equation: delta-v = Isp * g0 * ln(m0 / mf). */
export function deltaV(isp: number, wetMass: number, dryMass: number): number {
  if (wetMass <= 0 || dryMass <= 0 || dryMass > wetMass) return 0;
  return isp * G0 * Math.log(wetMass / dryMass);
}

export function massRatio(wetMass: number, dryMass: number): number {
  return dryMass > 0 ? wetMass / dryMass : Infinity;
}

/** Propellant mass needed for a given delta-v. */
export function propellantRequired(isp: number, dryMass: number, dv: number): number {
  return dryMass * (Math.exp(dv / (isp * G0)) - 1);
}

/** Thrust-to-weight ratio at a body's surface; must exceed 1 to lift off. */
export function thrustToWeight(thrustN: number, massKg: number, body: Body): number {
  return thrustN / (massKg * surfaceGravity(body));
}

/** One-way radio delay in seconds across a distance in metres. */
export function lightDelay(distanceM: number): number {
  return distanceM / SPEED_OF_LIGHT;
}

/**
 * Hohmann transfer between two circular orbits around the same central body.
 * Returns the two burns and the transfer time (half the transfer ellipse period).
 */
export function hohmannTransfer(mu: number, r1: number, r2: number) {
  const a = (r1 + r2) / 2;
  const v1 = Math.sqrt(mu / r1);
  const v2 = Math.sqrt(mu / r2);
  const vTransfer1 = Math.sqrt(mu * (2 / r1 - 1 / a));
  const vTransfer2 = Math.sqrt(mu * (2 / r2 - 1 / a));
  const dv1 = Math.abs(vTransfer1 - v1);
  const dv2 = Math.abs(v2 - vTransfer2);
  return { dv1, dv2, total: dv1 + dv2, time: Math.PI * Math.sqrt((a * a * a) / mu) };
}
