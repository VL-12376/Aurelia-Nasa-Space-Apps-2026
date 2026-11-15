/**
 * Live space data from NASA/JPL, fetched by the game server and cached.
 *
 * JPL's Horizons and Close-Approach services do not allow browsers to call them directly, so the
 * server makes the request and the game reads it from here. Only these two fixed queries are made;
 * the browser cannot choose what the server fetches.
 */

const HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api";
const CAD = "https://ssd-api.jpl.nasa.gov/cad.api";
const SPEED_OF_LIGHT_KMS = 299_792.458;
const AU_KM = 149_597_870.7;
const LUNAR_DISTANCE_KM = 384_400;
const CACHE_MS = 30 * 60_000;

export interface MoonNow {
  /** Centre-to-centre distance from Earth, km. */
  distanceKm: number;
  speedKms: number;
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
  approaches: Approach[];
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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "AURELIA-game/1.0 (educational)" } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

let cache: { at: number; data: SpaceNow } | null = null;
let inflight: Promise<SpaceNow> | null = null;

async function build(): Promise<SpaceNow> {
  const now = new Date();
  const horizons = `${HORIZONS}?format=json&COMMAND=%27301%27&OBJ_DATA=%27NO%27&MAKE_EPHEM=%27YES%27&EPHEM_TYPE=%27VECTORS%27&CENTER=%27500@399%27&START_TIME=%27${encodeURIComponent(hz(now))}%27&STOP_TIME=%27${encodeURIComponent(hz(new Date(now.getTime() + 120_000)))}%27&STEP_SIZE=%271%20min%27&VEC_TABLE=%272%27&OUT_UNITS=%27KM-S%27`;
  const cad = `${CAD}?dist-max=0.05&date-min=now&date-max=%2B45&sort=date&limit=8`;
  const [moonRes, cadRes] = await Promise.allSettled([getJson<{ result: string }>(horizons), getJson<CadJson>(cad)]);
  const data: SpaceNow = {
    fetchedAt: now.toISOString(),
    moon: moonRes.status === "fulfilled" ? moonFromHorizons(moonRes.value.result) : null,
    approaches: cadRes.status === "fulfilled" ? approachesFromCad(cadRes.value) : [],
    sources: ["NASA/JPL Horizons System", "NASA/JPL SBDB Close-Approach Data API"],
  };
  if (!data.moon && !data.approaches.length) throw new Error("No data");
  return data;
}

/** Latest data, refreshed at most every 30 minutes. If JPL is down, the last good copy is served. */
export async function spaceNow(): Promise<SpaceNow> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  inflight ??= build()
    .then((data) => {
      cache = { at: Date.now(), data };
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
