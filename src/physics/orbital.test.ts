import { describe, expect, it } from "vitest";
import {
  BODIES,
  circularOrbitVelocity,
  deltaV,
  escapeVelocity,
  hohmannTransfer,
  lightDelay,
  orbitalPeriod,
  propellantRequired,
  surfaceGravity,
  thrustToWeight,
} from "./orbital";

describe("orbital physics", () => {
  it("computes Earth's surface gravity and escape velocity", () => {
    expect(surfaceGravity(BODIES.earth)).toBeCloseTo(9.82, 1);
    expect(escapeVelocity(BODIES.earth) / 1000).toBeCloseTo(11.19, 1);
  });

  it("gives ~7.67 km/s and ~92 min for a 400 km Earth orbit", () => {
    expect(circularOrbitVelocity(BODIES.earth, 400_000) / 1000).toBeCloseTo(7.67, 1);
    expect(orbitalPeriod(BODIES.earth, 400_000) / 60).toBeCloseTo(92.4, 0);
  });

  it("shows lunar gravity is roughly one sixth of Earth's", () => {
    const ratio = surfaceGravity(BODIES.moon) / surfaceGravity(BODIES.earth);
    expect(ratio).toBeGreaterThan(0.15);
    expect(ratio).toBeLessThan(0.18);
  });

  it("applies the rocket equation and its inverse consistently", () => {
    const dv = deltaV(350, 10_000, 3_000);
    expect(dv).toBeCloseTo(350 * 9.80665 * Math.log(10 / 3), 6);
    const fuel = propellantRequired(350, 3_000, dv);
    expect(fuel).toBeCloseTo(7_000, 3);
  });

  it("returns zero delta-v for impossible masses", () => {
    expect(deltaV(350, 1_000, 2_000)).toBe(0);
    expect(deltaV(350, 0, 0)).toBe(0);
  });

  it("requires thrust-to-weight above 1 to lift off", () => {
    expect(thrustToWeight(2_000_000, 100_000, BODIES.earth)).toBeGreaterThan(1);
    expect(thrustToWeight(500_000, 100_000, BODIES.earth)).toBeLessThan(1);
  });

  it("computes Earth to Mars Hohmann transfer around the Sun (~259 days)", () => {
    const muSun = 1.32712440018e20;
    const t = hohmannTransfer(muSun, 1.496e11, 2.279e11);
    expect(t.time / 86_400).toBeGreaterThan(250);
    expect(t.time / 86_400).toBeLessThan(265);
  });

  it("computes light delay (~1.28 s to the Moon)", () => {
    expect(lightDelay(384_400_000)).toBeCloseTo(1.28, 1);
  });
});
