import type { GameState } from "../core/store";
import type { LogEntry, Outcome } from "./flight";
import { MISSIONS, type MissionDef } from "./missions";
import { computeScore } from "./score";
import { addFunding } from "../budget/budget";

const MAX_SCORES = 50;

/** Writes a finished flight into the saved game: money, standing, research, progression. */
export function applyOutcome(g: GameState, mission: MissionDef, craftName: string, seed: number, outcome: Outcome, log: LogEntry[]): { seasonUnlocked: number | null } {
  g.funds = addFunding(g.funds, g.allocation, outcome.fundsEarned);
  g.fundingEarned += outcome.fundsEarned;
  g.reputation = Math.max(0, g.reputation + outcome.reputation);
  g.researchPoints += outcome.researchPoints;
  g.experience += outcome.experience;

  // Sandbox missions are practice: never scored, never ranked.
  if (!g.sandbox) {
    outcome.score = computeScore(outcome, mission, g.difficulty ?? "engineer");
    g.scores = [{ missionId: mission.id, missionName: mission.name, craftName, score: outcome.score.total, result: outcome.result, difficulty: g.difficulty ?? "engineer", year: g.year, at: Date.now() }, ...(g.scores ?? [])].slice(0, MAX_SCORES);
  }

  if (outcome.result === "success") {
    if (!g.completedMissions.includes(mission.id)) g.completedMissions.push(mission.id);
    const badge = `${mission.name}: mission accomplished`;
    if (!g.achievements.includes(badge)) g.achievements.push(badge);
  }
  if (g.flights === 1 && !g.achievements.includes("First launch")) g.achievements.push("First launch");

  g.lastFlight = { flightNumber: g.flights, missionId: mission.id, craftName, seed, year: g.year, outcome, log };

  // Finishing every mission of the season opens the next one.
  let seasonUnlocked: number | null = null;
  const inSeason = MISSIONS.filter((m) => m.season === g.season);
  if (g.season < 4 && inSeason.length > 0 && inSeason.every((m) => g.completedMissions.includes(m.id))) {
    g.season += 1;
    seasonUnlocked = g.season;
    g.achievements.push(`Season ${g.season - 1} complete`);
  }
  if (!g.sandbox && MISSIONS.every((m) => g.completedMissions.includes(m.id)) && !g.achievements.includes("AURELIA campaign complete")) {
    g.achievements.push("Season 4 complete", "AURELIA campaign complete");
  }
  return { seasonUnlocked };
}
