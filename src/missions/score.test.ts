import { describe, expect, it } from "vitest";
import { MISSIONS } from "./missions";
import type { Outcome } from "./flight";
import { computeScore, rankTitle } from "./score";

const mission = MISSIONS[0];

function outcome(over: Partial<Outcome> = {}): Outcome {
  return {
    result: "success",
    headline: "Mission accomplished",
    objectives: [
      { text: "a", done: true },
      { text: "b", done: true },
      { text: "c", done: true },
    ],
    scienceScore: 100,
    scienceApplicable: true,
    dvDelivered: 9400,
    dvBudget: 9400,
    dvMarginPct: 15,
    propellantLeftPct: 20,
    fundsEarned: 0,
    reputation: 0,
    researchPoints: 0,
    experience: 0,
    lessons: [],
    ...over,
  };
}

const perfectResources = { dataReturnPct: 100, lifetimeDays: 400, lifetimeNeededDays: 300, massMarginPct: 15, powerMarginPct: 20 };

describe("computeScore", () => {
  it("gives a flawless engineer-level mission the full 100 and the top rank", () => {
    const s = computeScore(outcome({ resources: perfectResources, events: [{ title: "x", choice: "y", text: "z", tone: "ok" }] }), mission, "engineer");
    expect(s.total).toBe(100);
    expect(s.rank).toBe("Legend");
    expect(s.parts.reduce((a, p) => a + p.max, 0)).toBe(100);
    for (const p of s.parts) expect(p.points).toBeLessThanOrEqual(p.max);
  });

  it("scores more for more objectives, more science, and better handled events", () => {
    const base = outcome({ result: "partial", objectives: [{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }], scienceScore: 30 });
    const more = outcome({ result: "partial", objectives: [{ text: "a", done: true }, { text: "b", done: true }, { text: "c", done: false }], scienceScore: 30 });
    const sci = outcome({ result: "partial", objectives: base.objectives, scienceScore: 80 });
    expect(computeScore(more, mission, "engineer").total).toBeGreaterThan(computeScore(base, mission, "engineer").total);
    expect(computeScore(sci, mission, "engineer").total).toBeGreaterThan(computeScore(base, mission, "engineer").total);
    const ev = (tone: "ok" | "warn" | "bad") => outcome({ events: [{ title: "x", choice: "y", text: "z", tone }] });
    const total = (t: "ok" | "warn" | "bad") => computeScore(ev(t), mission, "engineer").total;
    expect(total("ok")).toBeGreaterThanOrEqual(total("warn"));
    expect(total("warn")).toBeGreaterThan(total("bad"));
  });

  it("rewards a healthy delta-v margin over a reckless or a wasteful one", () => {
    const at = (dvMarginPct: number) => computeScore(outcome({ dvMarginPct }), mission, "engineer").total;
    expect(at(15)).toBeGreaterThan(at(1));
    expect(at(15)).toBeGreaterThan(at(90));
  });

  it("scales by difficulty and never exceeds 130", () => {
    const o = outcome({ resources: perfectResources, events: [{ title: "x", choice: "y", text: "z", tone: "ok" }] });
    const cadet = computeScore(o, mission, "cadet").total;
    const engineer = computeScore(o, mission, "engineer").total;
    const director = computeScore(o, mission, "director").total;
    expect(cadet).toBe(80);
    expect(director).toBe(130);
    expect(cadet).toBeLessThan(engineer);
    expect(engineer).toBeLessThan(director);
  });

  it("stays within bounds for extreme inputs", () => {
    const wild = outcome({ dvMarginPct: -500, propellantLeftPct: 900, scienceScore: 400, resources: { dataReturnPct: -5, lifetimeDays: NaN, lifetimeNeededDays: 0, massMarginPct: 1e9, powerMarginPct: -1e9 } });
    for (const d of ["cadet", "engineer", "director"] as const) {
      const s = computeScore(wild, mission, d);
      expect(Number.isInteger(s.total)).toBe(true);
      expect(s.total).toBeGreaterThanOrEqual(0);
      expect(s.total).toBeLessThanOrEqual(130);
    }
  });

  it("is tolerant of missing optional fields and neutral about them", () => {
    const s = computeScore(outcome({ resources: undefined, events: undefined }), mission, "engineer");
    expect(s.parts.find((p) => p.label === "Resource management")!.points).toBe(8);
    expect(s.parts.find((p) => p.label === "Decisions under pressure")!.points).toBe(7);
  });

  it("gives full science marks when science does not apply", () => {
    const s = computeScore(outcome({ scienceApplicable: false, scienceScore: 0 }), mission, "engineer");
    expect(s.parts.find((p) => p.label === "Science return")!.points).toBe(15);
  });

  it("lets a failed mission earn a little, but less than a partial one", () => {
    const failed = computeScore(outcome({ result: "failed", objectives: [{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }], scienceScore: 0, dvMarginPct: -20 }), mission, "engineer");
    const partial = computeScore(outcome({ result: "partial", objectives: [{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }], scienceScore: 0, dvMarginPct: 10 }), mission, "engineer");
    expect(failed.total).toBeGreaterThan(0);
    expect(failed.total).toBeLessThan(partial.total);
    expect(failed.total).toBeLessThan(45);
  });
});

describe("rankTitle", () => {
  it("climbs with the score", () => {
    const titles = [0, 30, 50, 70, 90, 120].map(rankTitle);
    expect(titles).toEqual(["Trainee", "Technician", "Flight Engineer", "Mission Specialist", "Flight Director", "Legend"]);
  });
});
