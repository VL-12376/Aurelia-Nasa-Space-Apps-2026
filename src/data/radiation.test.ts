import { describe, expect, it } from "vitest";
import { CAREER_LIMIT_MSV, DOSE_PRESETS, RADIATION_ENVS, daysToLimit, totalDose } from "./radiation";

const env = (id: string) => RADIATION_ENVS.find((e) => e.id === id)!;

describe("radiation dose calculator", () => {
  it("adds days times the measured rate", () => {
    expect(totalDose({}).totalMSv).toBe(0);
    expect(totalDose({ leo: 100 }).totalMSv).toBeCloseTo(68);
    expect(totalDose({ leo: 10, moon: 10 }).totalMSv).toBeCloseTo(6.8 + 8.1);
    expect(totalDose({ leo: -5 }).totalMSv).toBe(0);
  });

  it("agrees with the real measurements it is built on", () => {
    // Published figures: about 80 to 160 mSv for six months on a space station.
    const iss = totalDose({ leo: 182 }).totalMSv;
    expect(iss).toBeGreaterThan(80);
    expect(iss).toBeLessThan(160);
    // An uncrewed lunar test flight measured 26.7 to 35.4 mSv over 25.5 days.
    const art = totalDose({ capsule: 25.5 }).totalMSv;
    expect(art).toBeGreaterThan(26.7);
    expect(art).toBeLessThan(35.4);
    expect(env("capsule").range![0]).toBeLessThan(env("capsule").mSvPerDay);
    expect(env("capsule").range![1]).toBeGreaterThan(env("capsule").mSvPerDay);
  });

  it("shows the career limit being reached by a Mars round trip but not by a lunar flyby", () => {
    const flyby = DOSE_PRESETS.find((p) => p.label.startsWith("Crewed lunar flyby"))!;
    const mars = DOSE_PRESETS.find((p) => p.label.startsWith("Mars"))!;
    expect(totalDose(flyby.days).limitShare).toBeLessThan(0.05);
    expect(totalDose(mars.days).limitShare).toBeGreaterThan(1);
    expect(daysToLimit(env("leo"))).toBeCloseTo(CAREER_LIMIT_MSV / 0.68);
  });
});
