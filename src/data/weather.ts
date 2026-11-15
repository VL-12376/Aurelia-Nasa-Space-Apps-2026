/**
 * Space weather from an open government space-weather database.
 *
 * Shared by the game server (which fetches and parses it) and the browser (which describes it).
 * Pure functions only, so they can be tested without a network.
 */

export interface Flare {
  /** X-ray class, for example "M1.3" or "X2.0". */
  classType: string;
  /** When the flare peaked (UTC), for example "2026-10-16T15:42Z". */
  peakTime: string;
  /** Active region number, when the source gives one. */
  activeRegion?: number;
}

export interface SpaceWeather {
  /** The latest five flares from the last 30 days, newest first. Empty if none or unavailable. */
  flares: Flare[];
  /** Flares recorded in the last 30 days. null when the flare source could not be reached. */
  flareCount30d: number | null;
  /** Coronal mass ejections recorded in the last 30 days. null when unavailable. */
  cmeCount30d: number | null;
  /** Solar energetic particle events recorded in the last 30 days. null when unavailable. */
  sepCount30d: number | null;
  /** Highest Kp index of any geomagnetic storm in the last 30 days. Absent if there was none or the source was unavailable. */
  geomagneticMaxKp?: number;
  /** AURELIA's educational factor from 0.5 (quiet Sun) to 2.0 (very active Sun). See activityFromFlares. */
  activity: number;
}

export const ACTIVITY_MIN = 0.5;
export const ACTIVITY_MAX = 2.0;
/** A 30-day flare index at which the game's factor reaches its maximum. A game scaling choice, not an official measure. */
export const ACTIVITY_FULL_SCALE = 1000;
/** Factor used when no flare data is available: neither calm nor stormy. */
export const ACTIVITY_NEUTRAL = 1;

/** Peak X-ray flux of each flare class letter, in units of a C1 flare (1e-6 W/m²). */
const CLASS_FLUX: Record<string, number> = { A: 0.01, B: 0.1, C: 1, M: 10, X: 100 };

/** "M1.3" is 13 C1 flares worth of peak X-ray flux, "X2.0" is 200. Returns null for anything that is not a flare class. */
export function flareFlux(classType: string): number | null {
  const m = /^\s*([ABCMX])\s*([0-9]+(?:\.[0-9]+)?)\s*$/i.exec(classType);
  if (!m) return null;
  return CLASS_FLUX[m[1].toUpperCase()] * Number(m[2]);
}

/** Sum of the peak X-ray fluxes of the given flares, in C1 units. Classes weigh X (100) over M (10) over C (1). */
export function flareIndex(classes: string[]): number {
  return classes.reduce((n, c) => n + (flareFlux(c) ?? 0), 0);
}

/**
 * The educational activity factor: 0.5 + 1.5 × log10(1 + index) / log10(1 + 1000), limited to 0.5–2.0.
 * The index is the 30-day total of flare peak fluxes (see flareIndex). The logarithm keeps one big flare
 * from drowning out many small ones. This is a game scaling for teaching, not an official measure.
 */
export function activityFromFlares(classes: string[]): number {
  const k = Math.min(1, Math.log10(1 + flareIndex(classes)) / Math.log10(1 + ACTIVITY_FULL_SCALE));
  return Math.round((ACTIVITY_MIN + (ACTIVITY_MAX - ACTIVITY_MIN) * k) * 100) / 100;
}

/** A short label and a plain-language sentence for an activity factor. */
export function describeActivity(activity: number): { label: string; text: string } {
  if (activity < 0.8) return { label: "Quiet", text: "The Sun has been quiet lately, so the game keeps its space-weather risks low." };
  if (activity < 1.25) return { label: "Moderate", text: "A normal amount of solar activity: the game uses its usual space-weather risks." };
  if (activity < 1.75) return { label: "Active", text: "Plenty of recent flares, so the game makes solar storms during a flight more likely." };
  return { label: "Stormy", text: "Very strong recent flares, so the game makes solar storms during a flight much more likely." };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "M1.3 flare, 16 Oct 2026 15:42 UTC": a one-line description of a flare, from its UTC peak time. */
export function describeFlare(f: Flare): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(f.peakTime);
  const when = m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]} ${m[4]} UTC` : f.peakTime;
  return `${f.classType} flare, ${when}`;
}

/** All valid flares in a flare-list response, newest first. */
export function flaresFromRecords(json: unknown): Flare[] {
  if (!Array.isArray(json)) return [];
  const out: Flare[] = [];
  for (const e of json) {
    if (!isRecord(e) || typeof e.classType !== "string" || flareFlux(e.classType) === null) continue;
    const peak = typeof e.peakTime === "string" ? e.peakTime : typeof e.beginTime === "string" ? e.beginTime : "";
    if (!peak) continue;
    const f: Flare = { classType: e.classType.trim().toUpperCase(), peakTime: peak };
    if (typeof e.activeRegionNum === "number") f.activeRegion = e.activeRegionNum;
    out.push(f);
  }
  return out.sort((a, b) => (a.peakTime < b.peakTime ? 1 : a.peakTime > b.peakTime ? -1 : 0));
}

/** Number of events in an event-list response, or null if the response was not a list. */
export function countEvents(json: unknown): number | null {
  return Array.isArray(json) ? json.length : null;
}

/** Highest Kp index across the storms in a geomagnetic-storm response. Undefined if there were none. */
export function maxKpFromGst(json: unknown): number | undefined {
  if (!Array.isArray(json)) return undefined;
  let max: number | undefined;
  for (const s of json) {
    const list = isRecord(s) && Array.isArray(s.allKpIndex) ? s.allKpIndex : [];
    for (const k of list) if (isRecord(k) && typeof k.kpIndex === "number" && (max === undefined || k.kpIndex > max)) max = k.kpIndex;
  }
  return max;
}

/** Raw space-weather responses for the last 30 days. null means that source could not be fetched. */
export interface WeatherRaw {
  flr: unknown | null;
  cme: unknown | null;
  sep: unknown | null;
  gst: unknown | null;
}

/** Combines whatever sources answered. Returns null only if none did. */
export function buildWeather(raw: WeatherRaw): SpaceWeather | null {
  if (raw.flr === null && raw.cme === null && raw.sep === null && raw.gst === null) return null;
  const all = raw.flr === null ? null : flaresFromRecords(raw.flr);
  const w: SpaceWeather = {
    flares: all ? all.slice(0, 5) : [],
    flareCount30d: all ? all.length : null,
    cmeCount30d: countEvents(raw.cme),
    sepCount30d: countEvents(raw.sep),
    activity: all ? activityFromFlares(all.map((f) => f.classType)) : ACTIVITY_NEUTRAL,
  };
  const kp = maxKpFromGst(raw.gst);
  if (kp !== undefined) w.geomagneticMaxKp = kp;
  return w;
}
