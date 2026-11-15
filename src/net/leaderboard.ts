import { mp } from "./session";
import type { ScoreRecord } from "../../server/scores";
import type { ReplayInput } from "../missions/replay";

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

export type SubmitResult = { ok: true; score: number } | { ok: false; error: string; unreachable?: boolean };

/**
 * Sends a single-player flight for the server to re-fly and score. The browser never sends a score: the
 * server replays the flight from its seed and decisions and ranks the result it computes itself.
 */
export async function submitFlight(name: string, flight: ReplayInput): Promise<SubmitResult> {
  try {
    const res = await fetch(`${httpBase()}/api/scores`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, flight }),
      signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; score?: { total?: number }; entry?: { score?: number } };
    if (res.ok) return { ok: true, score: body.score?.total ?? body.entry?.score ?? 0 };
    return { ok: false, error: body.error ?? "The server did not accept that flight." };
  } catch {
    return { ok: false, error: "The leaderboard server isn't answering right now.", unreachable: true };
  }
}
