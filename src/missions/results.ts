import type { GameState } from "../core/store";
import type { LogEntry, Outcome } from "./flight";
import { MISSIONS, type MissionDef } from "./missions";

/** Writes a finished flight into the saved game: money, standing, research, progression. */
export function applyOutcome(g: GameState, mission: MissionDef, craftName: string, seed: number, outcome: Outcome, log: LogEntry[]): { seasonUnlocked: number | null } {
  g.funds += outcome.fundsEarned;
  g.reputation = Math.max(0, g.reputation + outcome.reputation);
  g.researchPoints += outcome.researchPoints;
  g.experience += outcome.experience;

  if (outcome.result === "success") {
    if (!g.completedMissions.includes(mission.id)) g.completedMissions.push(mission.id);
    const badge = `${mission.name}: mission accomplished`;
    if (!g.achievements.includes(badge)) g.achievements.push(badge);
  }
  if (g.flights === 1 && !g.achievements.includes("First launch")) g.achievements.push("First launch");

  g.lastFlight = { missionId: mission.id, craftName, seed, year: g.year, outcome, log };

  // Finishing every mission of the season opens the next one.
  let seasonUnlocked: number | null = null;
  const inSeason = MISSIONS.filter((m) => m.season === g.season);
  if (g.season < 4 && inSeason.length > 0 && inSeason.every((m) => g.completedMissions.includes(m.id))) {
    g.season += 1;
    seasonUnlocked = g.season;
    g.achievements.push(`Season ${g.season - 1} complete`);
  }
  return { seasonUnlocked };
}
