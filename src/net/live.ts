import { mp } from "./session";
import type { SpaceNow } from "../../server/live";

export type { SpaceNow };

/** The game server's address for plain HTTP requests, taken from the same setting as multiplayer. */
function httpBase(): string {
  return mp.defaultUrl().replace(/^ws/, "http");
}

let cached: { at: number; data: SpaceNow } | null = null;

/**
 * Live NASA/JPL data: the Moon's position right now and upcoming asteroid close approaches.
 * The game server fetches it from JPL (browsers are not allowed to) and caches it for 30 minutes.
 * Returns null if the server is not reachable, and the screen says so instead of showing made-up numbers.
 */
export async function loadSpaceNow(): Promise<SpaceNow | null> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.data;
  try {
    const res = await fetch(`${httpBase()}/api/space`, { signal: AbortSignal.timeout(70_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as SpaceNow;
    cached = { at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

export const fmtKm = (km: number): string => `${Math.round(km).toLocaleString("en-US")} km`;
