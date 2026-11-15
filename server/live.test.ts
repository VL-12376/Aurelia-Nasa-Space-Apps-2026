import { describe, expect, it } from "vitest";
import { approachesFromCad, moonFromHorizons, parseHorizons } from "./live";

// Trimmed from real responses of NASA/JPL Horizons and the SBDB Close-Approach API.
const HORIZONS_RESULT = `*******
$$SOE
2461359.500000000 = A.D. 2026-Nov-15 00:00:00.0000 TDB
 X = 1.707836373659629E+05 Y =-3.665281618669272E+05 Z =-1.768800727209449E+04
 VX= 8.684960534651658E-01 VY= 4.191464558725506E-01 VZ= 7.418379185303070E-02
$$EOE`;

const CAD_JSON = {
  fields: ["des", "orbit_id", "jd", "cd", "dist", "dist_min", "dist_max", "v_rel", "v_inf", "t_sigma_f", "h"],
  data: [["2026 VV15", "2", "2461358.8", "2026-Nov-14 07:16", "0.010558206903424", "0.01053", "0.01058", "14.9763748727029", "14.9", "< 00:01", "26.029"]],
};

describe("live NASA/JPL data parsing", () => {
  it("reads the Moon's state vector and turns it into distance, speed and light time", () => {
    const s = parseHorizons(HORIZONS_RESULT)!;
    expect(s.pos[0]).toBeCloseTo(170783.6, 0);
    const moon = moonFromHorizons(HORIZONS_RESULT)!;
    // The Moon is between about 356,000 and 407,000 km away, and moves about 1 km/s.
    expect(moon.distanceKm).toBeGreaterThan(356_000);
    expect(moon.distanceKm).toBeLessThan(407_000);
    expect(moon.speedKms).toBeGreaterThan(0.9);
    expect(moon.speedKms).toBeLessThan(1.2);
    expect(moon.lightTimeS).toBeGreaterThan(1.1);
    expect(moon.lightTimeS).toBeLessThan(1.4);
  });

  it("returns nothing for text that is not a vector table", () => {
    expect(parseHorizons("No ephemeris for target")).toBeNull();
  });

  it("converts close approaches to km, lunar distances and a plausible size", () => {
    const [a] = approachesFromCad(CAD_JSON);
    expect(a.name).toBe("2026 VV15");
    expect(a.distanceLd).toBeCloseTo(4.1, 1);
    expect(a.distanceKm).toBeCloseTo(1_579_000, -4);
    // H of 26 is a rock roughly 10 to 30 metres across.
    expect(a.diameterM[0]).toBeGreaterThan(8);
    expect(a.diameterM[1]).toBeLessThan(60);
    expect(a.diameterM[0]).toBeLessThan(a.diameterM[1]);
  });
});
