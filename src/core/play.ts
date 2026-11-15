/** Shared play settings: difficulty, sandbox, and score records. Pure types and data, safe for the server. */

export type Difficulty = "cadet" | "engineer" | "director";

export interface DifficultyDef {
  id: Difficulty;
  label: string;
  blurb: string;
  /** Multiplies the chance of every random event. */
  eventMult: number;
  /** Multiplies the final score. */
  scoreMult: number;
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
  { id: "cadet", label: "Cadet", blurb: "Fewer anomalies. Best for learning; every response has 45 seconds.", eventMult: 0.6, scoreMult: 0.8 },
  { id: "engineer", label: "Engineer", blurb: "The standard mission: realistic trouble, with 45 seconds per response.", eventMult: 1, scoreMult: 1 },
  { id: "director", label: "Director", blurb: "More anomalies. Scores count for more; responses still have 45 seconds.", eventMult: 1.5, scoreMult: 1.3 },
];

export const DIFFICULTY_BY_ID: Record<Difficulty, DifficultyDef> = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d])) as Record<Difficulty, DifficultyDef>;

/** One finished mission, kept on the device for the personal best list. */
export interface ScoreEntry {
  missionId: string;
  missionName: string;
  craftName: string;
  score: number;
  result: "success" | "partial" | "failed";
  difficulty: Difficulty;
  year: number;
  /** Epoch ms. */
  at: number;
}
