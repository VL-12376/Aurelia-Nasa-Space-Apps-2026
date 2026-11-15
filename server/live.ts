/**
 * Live space data from NASA/JPL, fetched by the game server and cached.
 *
 * JPL's Horizons and Close-Approach services do not allow browsers to call them directly, so the
 * server makes the request and the game reads it from here. Only these fixed, whitelisted queries
 * are made (Moon and Mars from Horizons, close approaches, four DONKI space weather lists); the
 * browser cannot choose what the server fetches.
 */

import { buildWeather, type SpaceWeather } from "../src/data/weather";

const HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api";
const CAD = "https://ssd-api.jpl.nasa.gov/cad.api";
const DONKI_API = "https://api.nasa.gov/DONKI";
/** DONKI's own server. Used when the api.nasa.gov gateway does not answer, and it needs no key. */
const DONKI_CCMC = "https://ccmc.gsfc.nasa.gov/DONKI-API/get";
const DONKI_KINDS = ["FLR", "CME", "SEP", "GST"] as const;
type DonkiKind = (typeof DONKI_KINDS)[number];
const SPEED_OF_LIGHT_KMS = 299_792.458;
const AU_KM = 149_597_870.7;
const LUNAR_DISTANCE_KM = 384_400;
const CACHE_MS = 30 * 60_000;
/** Shorter cache while a source is missing, so a temporary failure does not hide data for half an hour. */
const RETRY_MS = 10 * 60_000;

export interface MoonNow {
  /** Centre-to-centre distance from Earth, km. */
  distanceKm: number;
  speedKms: number;
  /** One-way radio travel time, seconds. */
  lightTimeS: number;
  epoch: string;
}

export interface MarsNow {
  /** Centre-to-centre distance from Earth, km. */
  distanceKm: number;
  /** One-way radio travel time, seconds. */
  lightTimeS: number;
  epoch: string;
}

export interface Approach {
  name: string;
  date: string;
  distanceKm: number;
  distanceLd: number;
  speedKms: number;
  /** Absolute magnitude H: smaller means brighter and usually larger. */
  h: number;
  /** Rough diameter range in metres, from H assuming albedo between 0.05 and 0.25. */
  diameterM: [number, number];
}

export interface SpaceNow {
  fetchedAt: string;
  moon: MoonNow | null;
  mars: MarsNow | null;
  approaches: Approach[];
  weather: SpaceWeather | null;
  sources: string[];
}

const num = "([-+]?[0-9]*\\.?[0-9]+(?:[Ee][-+]?[0-9]+)?)";

/** Reads the first position and velocity row from a Horizons vector table. */
export function parseHorizons(result: string): { pos: [number, number, number]; vel: [number, number, number]; epoch: string } | null {
  const soe = result.indexOf("$$SOE");
  if (soe < 0) return null;
  const block = result.slice(soe, result.indexOf("$$EOE", soe));
  const p = new RegExp(`X\\s*=\\s*${num}\\s*Y\\s*=\\s*${num}\\s*Z\\s*=\\s*${num}`).exec(block);
  const v = new RegExp(`VX\\s*=\\s*${num}\\s*VY\\s*=\\s*${num}\\s*VZ\\s*=\\s*${num}`).exec(block);
  const e = /A\.D\.\s+([0-9]{4}-[A-Za-z]{3}-[0-9]{2}\s+[0-9:.]+)\s+TDB/.exec(block);
  if (!p || !v) return null;
  return { pos: [Number(p[1]), Number(p[2]), Number(p[3])], vel: [Number(v[1]), Number(v[2]), Number(v[3])], epoch: e ? `${e[1].trim()} TDB` : "" };
}

export function moonFromHorizons(result: string): MoonNow | null {
  const s = parseHorizons(result);
  if (!s) return null;
  const distanceKm = Math.hypot(...s.pos);
  return { distanceKm, speedKms: Math.hypot(...s.vel), lightTimeS: distanceKm / SPEED_OF_LIGHT_KMS, epoch: s.epoch };
}

export function marsFromHorizons(result: string): MarsNow | null {
  const s = parseHorizons(result);
  if (!s) return null;
  const distanceKm = Math.hypot(...s.pos);
  return { distanceKm, lightTimeS: distanceKm / SPEED_OF_LIGHT_KMS, epoch: s.epoch };
}

interface CadJson {
  fields?: string[];
  data?: string[][];
}

/** Turns the Close-Approach table into friendly records. Diameter follows D = 1329 / sqrt(albedo) * 10^(-H/5) km. */
export function approachesFromCad(json: CadJson, limit = 8): Approach[] {
  const f = json.fields ?? [];
  const col = (n: string) => f.indexOf(n);
  const [iDes, iCd, iDist, iV, iH] = [col("des"), col("cd"), col("dist"), col("v_rel"), col("h")];
  if ([iDes, iCd, iDist, iV, iH].some((i) => i < 0)) return [];
  return (json.data ?? []).slice(0, limit).map((row) => {
    const au = Number(row[iDist]);
    const h = Number(row[iH]);
    const d = (albedo: number) => (1329 / Math.sqrt(albedo)) * Math.pow(10, -h / 5) * 1000;
    return { name: row[iDes], date: row[iCd], distanceKm: au * AU_KM, distanceLd: (au * AU_KM) / LUNAR_DISTANCE_KM, speedKms: Number(row[iV]), h, diameterM: [Math.round(d(0.25)), Math.round(d(0.05))] as [number, number] };
  });
}

const hz = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "AURELIA-game/1.0 (educational)" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

/** A fixed Horizons vector query from the centre of the Earth, for one body ('301' Moon, '499' Mars). */
function horizonsUrl(command: string, now: Date): string {
  return `${HORIZONS}?format=json&COMMAND=%27${command}%27&OBJ_DATA=%27NO%27&MAKE_EPHEM=%27YES%27&EPHEM_TYPE=%27VECTORS%27&CENTER=%27500@399%27&START_TIME=%27${encodeURIComponent(hz(now))}%27&STOP_TIME=%27${encodeURIComponent(hz(new Date(now.getTime() + 120_000)))}%27&STEP_SIZE=%271%20min%27&VEC_TABLE=%272%27&OUT_UNITS=%27KM-S%27`;
}

/**
 * One DONKI list for the last 30 days, or null if no server answered with a list.
 * Uses NASA_API_KEY on api.nasa.gov; the shared DEMO_KEY allows only about 30 requests an hour per IP
 * address, which the 30 minute cache below stays well inside. If the gateway fails (it currently
 * returns 404 for flares), DONKI's own server is asked instead.
 */
async function donki(kind: DonkiKind, now: Date): Promise<unknown | null> {
  const range = `startDate=${ymd(new Date(now.getTime() - 30 * 86_400_000))}&endDate=${ymd(now)}`;
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  for (const url of [`${DONKI_API}/${kind}?${range}&api_key=${encodeURIComponent(key)}`, `${DONKI_CCMC}/${kind}?${range}`]) {
    try {
      const json = await getJson<unknown>(url);
      if (Array.isArray(json)) return json;
    } catch {
      /* try the next server */
    }
  }
  return null;
}

let cache: { at: number; ttl: number; data: SpaceNow } | null = null;
let inflight: Promise<SpaceNow> | null = null;

async function build(): Promise<SpaceNow> {
  const now = new Date();
  const cad = `${CAD}?dist-max=0.05&date-min=now&date-max=%2B45&sort=date&limit=8`;
  const [moonRes, marsRes, cadRes, flr, cme, sep, gst] = await Promise.allSettled([
    getJson<{ result: string }>(horizonsUrl("301", now)),
    getJson<{ result: string }>(horizonsUrl("499", now)),
    getJson<CadJson>(cad),
    ...DONKI_KINDS.map((k) => donki(k, now)),
  ]);
  const raw = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? (r.value ?? null) : null);
  const data: SpaceNow = {
    fetchedAt: now.toISOString(),
    moon: moonRes.status === "fulfilled" ? moonFromHorizons(moonRes.value.result) : null,
    mars: marsRes.status === "fulfilled" ? marsFromHorizons(marsRes.value.result) : null,
    approaches: cadRes.status === "fulfilled" ? approachesFromCad(cadRes.value) : [],
    weather: buildWeather({ flr: raw(flr), cme: raw(cme), sep: raw(sep), gst: raw(gst) }),
    sources: [],
  };
  if (data.moon || data.mars) data.sources.push("NASA/JPL Horizons System");
  if (data.approaches.length) data.sources.push("NASA/JPL SBDB Close-Approach Data API");
  if (data.weather) data.sources.push("NASA DONKI space weather database (CCMC)");
  if (!data.sources.length) throw new Error("No data");
  return data;
}

/** The last data fetched, if any, without waiting for a refresh: used to colour a flight with real space weather. */
export function peekSpaceNow(): SpaceNow | null {
  return cache?.data ?? null;
}

/** Latest data, refreshed at most every 30 minutes (10 while a source is missing). If NASA is down, the last good copy is served. */
export async function spaceNow(): Promise<SpaceNow> {
  if (cache && Date.now() - cache.at < cache.ttl) return cache.data;
  inflight ??= build()
    .then((data) => {
      const complete = data.moon && data.mars && data.weather && data.weather.flareCount30d !== null && data.weather.cmeCount30d !== null && data.weather.sepCount30d !== null;
      cache = { at: Date.now(), ttl: complete ? CACHE_MS : RETRY_MS, data };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  try {
    return await inflight;
  } catch (e) {
    if (cache) return cache.data;
    throw e;
  }
}
