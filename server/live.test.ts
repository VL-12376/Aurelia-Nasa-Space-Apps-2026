import { describe, expect, it } from "vitest";
import { approachesFromCad, marsFromEphemeris, moonFromEphemeris, parseEphemeris } from "./live";

// Trimmed from real responses of the open ephemeris and close-approach services.
const EPHEMERIS_RESULT = `*******
$$SOE
2461359.500000000 = A.D. 2026-Nov-15 00:00:00.0000 TDB
 X = 1.707836373659629E+05 Y =-3.665281618669272E+05 Z =-1.768800727209449E+04
 VX= 8.684960534651658E-01 VY= 4.191464558725506E-01 VZ= 7.418379185303070E-02
$$EOE`;

const MARS_RESULT = `*******
$$SOE
2461359.634027778 = A.D. 2026-Nov-15 03:13:00.0000 TDB
 X =-1.610426127859143E+08 Y = 1.127337038690546E+08 Z = 6.561350200388342E+06
 VX= 1.851174772695988E+00 VY=-2.312530875231395E+01 VZ= 4.411571415379285E-01
$$EOE`;

const CAD_JSON = {
  fields: ["des", "orbit_id", "jd", "cd", "dist", "dist_min", "dist_max", "v_rel", "v_inf", "t_sigma_f", "h"],
  data: [["2026 VV15", "2", "2461358.8", "2026-Nov-14 07:16", "0.010558206903424", "0.01053", "0.01058", "14.9763748727029", "14.9", "< 00:01", "26.029"]],
};

describe("live space data parsing", () => {
  it("reads the Moon's state vector and turns it into distance, speed and light time", () => {
    const s = parseEphemeris(EPHEMERIS_RESULT)!;
    expect(s.pos[0]).toBeCloseTo(170783.6, 0);
    const moon = moonFromEphemeris(EPHEMERIS_RESULT)!;
    // The Moon is between about 356,000 and 407,000 km away, and moves about 1 km/s.
    expect(moon.distanceKm).toBeGreaterThan(356_000);
    expect(moon.distanceKm).toBeLessThan(407_000);
    expect(moon.speedKms).toBeGreaterThan(0.9);
    expect(moon.speedKms).toBeLessThan(1.2);
    expect(moon.lightTimeS).toBeGreaterThan(1.1);
    expect(moon.lightTimeS).toBeLessThan(1.4);
  });

  it("returns nothing for text that is not a vector table", () => {
    expect(parseEphemeris("No ephemeris for target")).toBeNull();
    expect(marsFromEphemeris("No ephemeris for target")).toBeNull();
  });

  it("turns the Mars vector into an Earth distance and a one-way light time", () => {
    const mars = marsFromEphemeris(MARS_RESULT)!;
    // Mars is between about 54.6 and 401 million km from Earth, so radio takes about 3 to 22 minutes one way.
    expect(mars.distanceKm).toBeGreaterThan(54_000_000);
    expect(mars.distanceKm).toBeLessThan(402_000_000);
    expect(mars.distanceKm).toBeCloseTo(196_700_000, -5);
    expect(mars.lightTimeS).toBeCloseTo(mars.distanceKm / 299_792.458, 6);
    expect(mars.lightTimeS / 60).toBeGreaterThan(3);
    expect(mars.lightTimeS / 60).toBeLessThan(23);
    expect(mars.epoch).toContain("2026-Nov-15");
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
