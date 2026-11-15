import { mp } from "./session";
import type { SpaceNow } from "../../server/live";
import { describeFlare, type Flare, type SpaceWeather } from "../data/weather";
import { setSpaceWeather } from "./weatherCache";

export type { SpaceNow, Flare, SpaceWeather };

/** The game server's address for plain HTTP requests, taken from the same setting as multiplayer. */
function httpBase(): string {
  return mp.defaultUrl().replace(/^ws/, "http");
}

let cached: { at: number; data: SpaceNow } | null = null;

/**
 * Live NASA/JPL data from GET /api/space, cached by the server for 30 minutes (10 while a source is missing).
 * The server fetches it (browsers are not allowed to call JPL) and any source can be missing, so every
 * field except fetchedAt and sources can be null or empty. The screen says so instead of showing made-up numbers.
 *
 * Payload (SpaceNow):
 *   fetchedAt  ISO time the server built it
 *   sources    names of the NASA/JPL services that answered
 *   moon       { distanceKm, speedKms, lightTimeS, epoch } | null   JPL Horizons, from Earth's centre
 *   mars       { distanceKm, lightTimeS, epoch } | null             JPL Horizons, lightTimeS is the one-way radio delay
 *   approaches [{ name, date, distanceKm, distanceLd, speedKms, h, diameterM }]   JPL close approaches
 *   weather    NASA DONKI space weather, or null if DONKI could not be reached at all:
 *     flares            [{ classType, peakTime, activeRegion? }]  latest 5 in 30 days, newest first. "M1.3", "2026-10-16T15:42Z"
 *     flareCount30d     number | null   flares in 30 days (null = flare source unavailable)
 *     cmeCount30d       number | null   coronal mass ejections in 30 days (null = unavailable)
 *     sepCount30d       number | null   solar energetic particle events in 30 days (null = unavailable)
 *     geomagneticMaxKp  number?         highest Kp of any geomagnetic storm in 30 days; absent if none
 *     activity          number          0.5 (quiet Sun) to 2.0 (stormy), 1.0 if flare data is unavailable.
 *                                       An educational factor from data/weather.ts, not a NASA measure.
 * For the flight simulation, use weather.activity as the risk multiplier and weather.flares[0] for the latest-flare text.
 * Returns null if the server is not reachable.
 */
export async function loadSpaceNow(): Promise<SpaceNow | null> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.data;
  try {
    const res = await fetch(`${httpBase()}/api/space`, { signal: AbortSignal.timeout(70_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as SpaceNow;
    cached = { at: Date.now(), data };
    // Real recent solar activity shapes the flares players meet in flight.
    setSpaceWeather({ solarActivity: data.weather?.activity, latestFlare: data.weather?.flares?.[0] ? describeFlare(data.weather.flares[0]) : undefined });
    return data;
  } catch {
    return null;
  }
}

export const fmtKm = (km: number): string => `${Math.round(km).toLocaleString("en-US")} km`;
