import { describe, expect, it } from "vitest";
import { heliocentricTransfer, lunarTransfer } from "./transfer";

describe("simplified transfer estimates", () => {
  it("Earth to Mars: ~3.6 km/s from LEO and ~259 days", () => {
    const t = heliocentricTransfer(1.524);
    expect(t.departureDeltaV / 1000).toBeGreaterThan(3.4);
    expect(t.departureDeltaV / 1000).toBeLessThan(3.8);
    expect(t.days).toBeGreaterThan(250);
    expect(t.days).toBeLessThan(270);
  });

  it("Earth to Moon: ~3.1 km/s and a few days", () => {
    const t = lunarTransfer();
    expect(t.departureDeltaV / 1000).toBeCloseTo(3.13, 1);
    expect(t.days).toBeGreaterThan(4);
    expect(t.days).toBeLessThan(6);
  });

  it("radio delay to Mars ranges from a few to over twenty minutes", () => {
    const [min, max] = heliocentricTransfer(1.524).lightMinutes;
    expect(min).toBeGreaterThan(3);
    expect(max).toBeGreaterThan(20);
  });
});
