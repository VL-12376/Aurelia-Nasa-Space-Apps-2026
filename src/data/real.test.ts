import { describe, expect, it } from "vitest";
import { APOLLO11_ASCENT, DELTA_V_MAP, REAL_PARALLELS, REAL_VEHICLES, dynamicPressureKpa, historyFor, hohmannFromEarth, nextMarsWindows, stackDeltaV } from "./real";
import { MISSIONS } from "../missions/missions";

describe("real reference data", () => {
  it("Mars transfer matches the textbook values (about 259 days, 44 degree lead, 26 month windows)", () => {
    const m = hohmannFromEarth(1.524);
    expect(m.transferDays).toBeGreaterThan(255);
    expect(m.transferDays).toBeLessThan(263);
    expect(m.leadAngleDeg).toBeGreaterThan(42);
    expect(m.leadAngleDeg).toBeLessThan(46);
    expect(m.synodicDays / 30.44).toBeGreaterThan(25);
    expect(m.synodicDays / 30.44).toBeLessThan(27);
    // Leaving Earth's orbit for Mars needs about 2.9 km/s relative to Earth.
    expect(m.deltaV1Kms).toBeGreaterThan(2.7);
    expect(m.deltaV1Kms).toBeLessThan(3.1);
  });

  it("Venus is an inner target: its transfer is about 146 days and its windows about 19 months apart", () => {
    const v = hohmannFromEarth(0.723);
    expect(v.transferDays).toBeGreaterThan(140);
    expect(v.transferDays).toBeLessThan(150);
    expect(v.synodicDays / 30.44).toBeGreaterThan(18);
    expect(v.synodicDays / 30.44).toBeLessThan(20);
  });

  it("the Saturn V rocket-equation estimate lands near the LEO plus trans-lunar budget", () => {
    const sv = REAL_VEHICLES.find((v) => v.id === "saturn-v")!;
    const { perStage, total } = stackDeltaV(sv.stages!, sv.payloadT!);
    expect(perStage).toHaveLength(3);
    const budget = DELTA_V_MAP.find((l) => l.id === "launch")!.kms + DELTA_V_MAP.find((l) => l.id === "tli")!.kms;
    expect(Math.abs(total - budget)).toBeLessThan(1.2);
  });

  it("the real stage masses add up to the quoted liftoff mass", () => {
    const sv = REAL_VEHICLES.find((v) => v.id === "saturn-v")!;
    const sum = sv.stages!.reduce((n, s) => n + s.propellantT + s.dryT, 0) + sv.payloadT!;
    expect(Math.abs(sum - sv.liftoffMassT) / sv.liftoffMassT).toBeLessThan(0.04);
  });

  it("peak dynamic pressure on a launch comes at low altitude, not at sea level or in space", () => {
    expect(dynamicPressureKpa(0, 0)).toBe(0);
    expect(dynamicPressureKpa(11, 450)).toBeGreaterThan(dynamicPressureKpa(0.1, 20));
    // At 11 km and 450 m/s the formula gives about 37 kPa, close to Apollo 11's reported peak of about 35 kPa.
    expect(dynamicPressureKpa(11, 450)).toBeGreaterThan(30);
    expect(dynamicPressureKpa(11, 450)).toBeLessThan(42);
    expect(dynamicPressureKpa(80, 4000)).toBeLessThan(dynamicPressureKpa(11, 450) * 0.05);
  });

  it("every AURELIA mission has a real-world parallel", () => {
    for (const m of MISSIONS) expect(REAL_PARALLELS[m.id], m.id).toBeDefined();
  });

  it("the Apollo 11 ascent events are in time order", () => {
    for (let i = 1; i < APOLLO11_ASCENT.length; i++) expect(APOLLO11_ASCENT[i].t).toBeGreaterThanOrEqual(APOLLO11_ASCENT[i - 1].t);
  });

  it("finds today's date in history, or the next event", () => {
    expect(historyFor(new Date(Date.UTC(2026, 6, 20))).daysAway).toBe(0);
    expect(historyFor(new Date(Date.UTC(2026, 6, 21))).daysAway).toBeGreaterThan(0);
  });

  it("Mars launch windows are spaced about 26 months apart and follow the real 2020 window", () => {
    const w = nextMarsWindows(new Date(Date.UTC(2026, 10, 14)), 2);
    expect(w[0].getTime()).toBeGreaterThan(Date.UTC(2026, 9, 1));
    expect(w[0].getTime()).toBeLessThan(Date.UTC(2027, 2, 1));
    expect((w[1].getTime() - w[0].getTime()) / 86_400_000).toBeGreaterThan(770);
  });
});
