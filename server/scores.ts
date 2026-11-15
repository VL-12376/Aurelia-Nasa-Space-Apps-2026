import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DIFFICULTIES, type Difficulty } from "../src/core/play";
import { MISSIONS } from "../src/missions/missions";

/**
 * The global leaderboard. Kept in memory and saved to a JSON file so it survives a restart.
 * On a host with an ephemeral disk (Render's free tier) the file can still be lost on redeploy.
 */

export interface ScoreRecord {
  id: string;
  name: string;
  missionId: string;
  missionName: string;
  craftName: string;
  score: number;
  result: "success" | "partial" | "failed";
  difficulty: Difficulty;
  /** True only for results the server computed itself (multiplayer rooms). */
  verified: boolean;
  team?: string[];
  at: number;
}

export interface Submission {
  name: string;
  missionId: string;
  craftName: string;
  score: number;
  result: ScoreRecord["result"];
  difficulty: Difficulty;
}

export const MAX_ENTRIES = 500;
export const MAX_LIST = 50;
export const NAME_MAX = 20;
const WRITE_DEBOUNCE_MS = 1500;

const RESULTS = new Set<string>(["success", "partial", "failed"]);
const DIFFICULTY_IDS = new Set<string>(DIFFICULTIES.map((d) => d.id));
const MISSION_NAME = new Map(MISSIONS.map((m) => [m.id, m.name]));

/** Removes control characters and anything that could be read as markup, then trims to length. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e<>&"`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/** Checks an untrusted submission. The mission name is looked up, never taken from the client. */
export function validateSubmission(body: unknown): { ok: true; value: Submission } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send a JSON object." };
  const b = body as Record<string, unknown>;
  const name = cleanText(b.name, NAME_MAX);
  if (!name) return { ok: false, error: "Enter a name (1 to 20 characters)." };
  if (typeof b.missionId !== "string" || !MISSION_NAME.has(b.missionId)) return { ok: false, error: "Unknown mission." };
  if (typeof b.score !== "number" || !Number.isInteger(b.score) || b.score < 0 || b.score > 130) return { ok: false, error: "The score must be a whole number from 0 to 130." };
  if (typeof b.result !== "string" || !RESULTS.has(b.result)) return { ok: false, error: "Unknown result." };
  if (typeof b.difficulty !== "string" || !DIFFICULTY_IDS.has(b.difficulty)) return { ok: false, error: "Unknown difficulty." };
  const craftName = cleanText(b.craftName, 24) || "Unnamed craft";
  return { ok: true, value: { name, missionId: b.missionId, craftName, score: b.score, result: b.result as ScoreRecord["result"], difficulty: b.difficulty as Difficulty } };
}

/** A short label for a crew, such as "Team Ana, Ben +2", that fits the name limit. */
export function teamLabel(names: string[]): string {
  const clean = names.map((n) => cleanText(n, NAME_MAX)).filter(Boolean);
  if (!clean.length) return "Team";
  let label = "Team";
  let used = 0;
  for (const n of clean) {
    const next = `${label}${used ? "," : ""} ${n}`;
    const rest = clean.length - used - 1;
    if (next.length + (rest ? ` +${rest}`.length : 0) > NAME_MAX && used > 0) break;
    label = next;
    used++;
  }
  const left = clean.length - used;
  return cleanText(left ? `${label} +${left}` : label, NAME_MAX);
}

function isRecord(r: unknown): r is ScoreRecord {
  if (!r || typeof r !== "object") return false;
  const e = r as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.name === "string" && typeof e.missionId === "string" && typeof e.missionName === "string" && typeof e.craftName === "string" && typeof e.score === "number" && RESULTS.has(String(e.result)) && DIFFICULTY_IDS.has(String(e.difficulty)) && typeof e.verified === "boolean" && typeof e.at === "number";
}

export interface RemoteStore {
  /** Base URL of a Redis-compatible REST service, for example the one a free hosted Redis gives you. */
  url: string;
  token: string;
  key?: string;
}

export interface ScoreStoreOptions {
  /** JSON file to load from and save to. Omit to keep scores in memory only. */
  file?: string | null;
  /** Durable storage that survives restarts on hosts with a throw-away disk. Used together with the file. */
  remote?: RemoteStore | null;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  max?: number;
  debounceMs?: number;
}

export class ScoreStore {
  private entries: ScoreRecord[] = [];
  private readonly file: string | null;
  private readonly remote: Required<RemoteStore> | null;
  private readonly fetchImpl: typeof fetch;
  private readonly max: number;
  private readonly debounceMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();
  /** Resolves once the durable copy (if any) has been merged in. */
  readonly ready: Promise<void>;

  constructor(opts: ScoreStoreOptions = {}) {
    this.file = opts.file ?? null;
    this.remote = opts.remote ? { key: "aurelia:scores", ...opts.remote, url: opts.remote.url.replace(/\/+$/, "") } : null;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.max = opts.max ?? MAX_ENTRIES;
    this.debounceMs = opts.debounceMs ?? WRITE_DEBOUNCE_MS;
    this.load();
    this.ready = this.loadRemote();
  }

  get size(): number {
    return this.entries.length;
  }

  /** Pulls the durable copy in and merges it with anything already here, so a restart never loses the board. */
  private async loadRemote(): Promise<void> {
    const r = this.remote;
    if (!r) return;
    try {
      const res = await this.fetchImpl(`${r.url}/get/${encodeURIComponent(r.key)}`, { headers: { authorization: `Bearer ${r.token}` }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { result?: string | null };
      if (!body.result) return;
      const data = JSON.parse(body.result) as { entries?: unknown };
      if (!Array.isArray(data.entries)) return;
      const have = new Set(this.entries.map((e) => e.id));
      for (const e of data.entries) if (isRecord(e) && !have.has(e.id)) this.entries.push(e);
      this.trim();
    } catch (e) {
      console.warn("Could not read the durable leaderboard; using what this server has.", (e as Error).message);
    }
  }

  private load(): void {
    if (!this.file) return;
    try {
      if (!existsSync(this.file)) return;
      const data = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
      const list = Array.isArray(data) ? data : (data as { entries?: unknown })?.entries;
      if (Array.isArray(list)) this.entries = list.filter(isRecord).slice(0, this.max * 2);
      this.trim();
    } catch (e) {
      console.warn("Could not read the scores file; starting with an empty leaderboard.", (e as Error).message);
      this.entries = [];
    }
  }

  /** Stores a validated result and returns the saved record. */
  add(sub: Submission, opts: { verified: boolean; team?: string[] }): ScoreRecord {
    const rec: ScoreRecord = {
      id: randomBytes(6).toString("hex"),
      name: sub.name,
      missionId: sub.missionId,
      missionName: MISSION_NAME.get(sub.missionId) ?? sub.missionId,
      craftName: sub.craftName,
      score: sub.score,
      result: sub.result,
      difficulty: sub.difficulty,
      verified: opts.verified,
      ...(opts.team?.length ? { team: opts.team.map((n) => cleanText(n, NAME_MAX)).filter(Boolean).slice(0, 4) } : {}),
      at: Date.now(),
    };
    this.entries.push(rec);
    this.trim();
    this.schedule();
    return rec;
  }

  /** Best first; ties go to the newest. */
  list(mission: string | null, limit: number): ScoreRecord[] {
    const n = Math.min(Math.max(Math.floor(limit) || 20, 1), MAX_LIST);
    return this.entries
      .filter((e) => !mission || mission === "all" || e.missionId === mission)
      .sort((a, b) => b.score - a.score || b.at - a.at)
      .slice(0, n);
  }

  /** Over the cap, the lowest scores go first and, among equals, the oldest. */
  private trim(): void {
    if (this.entries.length <= this.max) return;
    this.entries.sort((a, b) => b.score - a.score || b.at - a.at);
    this.entries.length = this.max;
  }

  private schedule(): void {
    if ((!this.file && !this.remote) || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save();
    }, this.debounceMs);
    this.timer.unref?.();
  }

  /** Writes to a temporary file and renames it, so a crash never leaves half a file; also updates the durable copy. */
  private save(): Promise<void> {
    const file = this.file;
    const remote = this.remote;
    if (!file && !remote) return Promise.resolve();
    this.writing = this.writing
      .then(async () => {
        // Never overwrite the durable copy before it has been read, or a restart could erase the board.
        await this.ready;
        const json = JSON.stringify({ entries: this.entries });
        if (file) {
          mkdirSync(dirname(file), { recursive: true });
          const tmp = `${file}.${process.pid}.tmp`;
          await writeFile(tmp, json, "utf8");
          await rename(tmp, file);
        }
        if (remote) {
          const res = await this.fetchImpl(`${remote.url}/set/${encodeURIComponent(remote.key)}`, { method: "POST", headers: { authorization: `Bearer ${remote.token}` }, body: json, signal: AbortSignal.timeout(10_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
      })
      .catch((e: Error) => console.warn("Could not save the leaderboard.", e.message));
    return this.writing;
  }

  /** Writes any pending change now. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      await this.save();
    } else {
      await this.writing;
    }
  }
}

/** Per-address limit for submissions: at most `limit` in `windowMs`. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private limit = 8, private windowMs = 60_000) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
    return true;
  }
}
