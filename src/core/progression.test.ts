import { describe, expect, it } from "vitest";
import { newGameState, type FlightReport } from "./gameState";
import { applyOutcome } from "../missions/results";
import { MISSIONS } from "../missions/missions";
import type { Outcome } from "../missions/flight";
import { awardFlight, levelProgress, newPlayerProgress, playerLevel } from "./progression";

const report = (xp: number): FlightReport => ({
  missionId: MISSIONS[0].id, seed: 1, year: 1, craftName: "Test",
  outcome: {
    result: "success", headline: "Mission accomplished", objectives: [], scienceScore: 0, scienceApplicable: false,
    dvDelivered: 9400, dvBudget: 9400, dvMarginPct: 10, propellantLeftPct: 10,
    fundsEarned: 100, reputation: 2, researchPoints: 5, experience: xp, lessons: [],
  } satisfies Outcome,
  log: [],
});

describe("personal player levels", () => {
  it("starts at level one and promotes only at the cumulative XP thresholds", () => {
    expect(playerLevel(newPlayerProgress().experience)).toBe(1);
    expect(levelProgress(99)).toMatchObject({ level: 1, current: 99, required: 100, nextAt: 100 });
    expect(levelProgress(100)).toMatchObject({ level: 2, current: 0, required: 300, nextAt: 400 });
    expect(playerLevel(399)).toBe(2);
    expect(playerLevel(400)).toBe(3);
  });

  it("awards missions once, retains promotion badges, and queues the HQ reward popup", () => {
    const p = newPlayerProgress();
    awardFlight(p, "flight-1", report(100), ["First launch"]);
    awardFlight(p, "flight-1", report(100), ["First launch"]);
    expect(p.experience).toBe(100);
    expect(p.badges).toEqual(["First launch", "Level 2 promotion badge"]);
    expect(p.pendingRewards).toHaveLength(1);
    p.pendingRewards = [];
    expect(p.badges).toContain("Level 2 promotion badge");
    expect(p.receipts).toEqual(["flight-1"]);
  });

  it("keeps player XP separate from campaign seasons and excludes sandbox", () => {
    const p = newPlayerProgress();
    const game = newGameState("single");
    awardFlight(p, "flight-1", report(900));
    expect(playerLevel(p.experience)).toBe(4);
    expect(game.season).toBe(1);
    applyOutcome(game, MISSIONS[0], "Test", 1, report(900).outcome, []);
    expect(game.season).toBe(1);
    const practice = report(100);
    practice.outcome.plan = { orbit: "LEO", launcher: "Own rocket", difficulty: "engineer", sandbox: true };
    awardFlight(p, "practice", practice);
    expect(p.experience).toBe(900);
    expect(p.receipts).not.toContain("practice");
  });
});
