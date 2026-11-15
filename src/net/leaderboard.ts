import { mp } from "./session";
import type { ScoreRecord } from "../../server/scores";
import type { Difficulty } from "../core/play";

export type { ScoreRecord };

/** The game server's address for plain HTTP requests, taken from the same setting as multiplayer. */
function httpBase(): string {
  return mp.defaultUrl().replace(/^ws/, "http");
}

/** A sleeping free-tier server can take about a minute to wake, so requests wait that long. */
const WAKE_TIMEOUT_MS = 70_000;

/** The best scores, for one mission or all of them. Returns null if the server cannot be reached. */
export async function fetchScores(mission: string, limit = 50): Promise<ScoreRecord[] | null> {
  try {
    const res = await fetch(`${httpBase()}/api/scores?mission=${encodeURIComponent(mission)}&limit=${limit}`, { signal: AbortSignal.timeout(WAKE_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = (await res.json()) as { entries?: ScoreRecord[] };
    return Array.isArray(data.entries) ? data.entries : null;
  } catch {
    return null;
  }
}

export interface ScoreSubmission {
  name: string;
  missionId: string;
  craftName: string;
  score: number;
  result: "success" | "partial" | "failed";
  difficulty: Difficulty;
}

/** Sends one single-player result to the global list. It is stored as unverified. Returns false on any failure. */
export async function submitScore(sub: ScoreSubmission): Promise<boolean> {
  try {
    const res = await fetch(`${httpBase()}/api/scores`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub),
      signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
