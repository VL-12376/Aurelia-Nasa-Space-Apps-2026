import { describe, expect, it } from "vitest";
import { newGameState } from "../core/gameState";
import { MISSIONS } from "./missions";
import type { Outcome } from "./flight";
import { applyOutcome } from "./results";

const outcome = (): Outcome => ({
  result: "success",
  headline: "Mission accomplished",
  objectives: [{ text: "a", done: true }],
  scienceScore: 80,
  scienceApplicable: true,
  dvDelivered: 9400,
  dvBudget: 9400,
  dvMarginPct: 15,
  propellantLeftPct: 20,
  fundsEarned: 100,
  reputation: 2,
  researchPoints: 3,
  experience: 4,
  lessons: [],
});

describe("applyOutcome scoring", () => {
  it("scores the flight and keeps the newest entry first, capped at 50", () => {
    const g = newGameState("single");
    const mission = MISSIONS[0];
    for (let i = 0; i < 52; i++) {
      g.flights += 1;
      applyOutcome(g, mission, `AUR-${i}`, i, outcome(), []);
    }
    expect(g.scores).toHaveLength(50);
    expect(g.scores[0].craftName).toBe("AUR-51");
    expect(g.scores[0]).toMatchObject({ missionId: mission.id, missionName: mission.name, result: "success", difficulty: "engineer" });
    expect(g.lastFlight!.outcome.score!.total).toBe(g.scores[0].score);
    expect(g.scores[0].score).toBeGreaterThan(0);
  });

  it("applies the difficulty multiplier", () => {
    const easy = newGameState("single");
    easy.difficulty = "cadet";
    const hard = newGameState("single");
    hard.difficulty = "director";
    applyOutcome(easy, MISSIONS[0], "A", 1, outcome(), []);
    applyOutcome(hard, MISSIONS[0], "A", 1, outcome(), []);
    expect(hard.scores[0].score).toBeGreaterThan(easy.scores[0].score);
  });

  it("never scores or ranks a sandbox mission, but still applies the rewards", () => {
    const g = newGameState("single");
    g.sandbox = true;
    const o = outcome();
    applyOutcome(g, MISSIONS[0], "A", 1, o, []);
    expect(g.scores).toHaveLength(0);
    expect(o.score).toBeUndefined();
    expect(g.experience).toBe(4);
    expect(g.completedMissions).toContain(MISSIONS[0].id);
  });
});
