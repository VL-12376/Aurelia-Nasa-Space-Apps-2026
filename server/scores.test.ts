import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MISSIONS } from "../src/missions/missions";
import { startServer, type RunningServer } from "./index";
import { RateLimiter, ScoreStore, teamLabel, validateSubmission, type Submission } from "./scores";

const mission = MISSIONS[0].id;
const sub = (over: Partial<Submission> = {}): Submission => ({ name: "Ada", missionId: mission, craftName: "AUR-1", score: 80, result: "success", difficulty: "engineer", ...over });
const dir = mkdtempSync(join(tmpdir(), "aurelia-scores-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("score validation", () => {
  it("accepts a good submission and takes the mission name from the server", () => {
    const v = validateSubmission({ ...sub(), missionName: "Fake" });
    expect(v.ok).toBe(true);
  });

  it("strips markup and control characters from names", () => {
    const v = validateSubmission(sub({ name: "  <b>Ada</b>\u0007  Lovelace " }));
    expect(v).toMatchObject({ ok: true, value: { name: "Ada Lovelace" } });
    const long = validateSubmission(sub({ name: "x".repeat(50) }));
    expect(long.ok && long.value.name).toHaveLength(20);
  });

  it.each([
    ["empty name", { name: "<>" }],
    ["unknown mission", { missionId: "nope" }],
    ["fractional score", { score: 80.5 }],
    ["negative score", { score: -1 }],
    ["too-high score", { score: 131 }],
    ["string score", { score: "99" }],
    ["unknown result", { result: "won" }],
    ["unknown difficulty", { difficulty: "god" }],
  ])("rejects %s", (_label, over) => {
    expect(validateSubmission({ ...sub(), ...over }).ok).toBe(false);
  });

  it("rejects non-objects", () => {
    for (const bad of [null, 5, "x", undefined]) expect(validateSubmission(bad).ok).toBe(false);
  });

  it("makes a short team label", () => {
    expect(teamLabel(["Ana", "Ben"])).toBe("Team Ana, Ben");
    const four = teamLabel(["Ada", "Ben", "Cleo", "Dev"]);
    expect(four.length).toBeLessThanOrEqual(20);
    expect(four).toMatch(/^Team Ada, Ben \+2$/);
  });
});

describe("ScoreStore", () => {
  it("sorts best first, newest first among equals, and filters by mission", async () => {
    const s = new ScoreStore();
    const a = s.add(sub({ name: "A", score: 70 }), { verified: false });
    await new Promise((r) => setTimeout(r, 3));
    const b = s.add(sub({ name: "B", score: 70 }), { verified: false });
    s.add(sub({ name: "C", score: 95, missionId: MISSIONS[1].id }), { verified: true, team: ["x"] });
    expect(s.list("all", 10).map((e) => e.name)).toEqual(["C", "B", "A"]);
    expect(s.list(mission, 10).map((e) => e.id)).toEqual([b.id, a.id]);
    expect(s.list("all", 1)).toHaveLength(1);
    expect(s.list("all", 9999).length).toBeLessThanOrEqual(50);
  });

  it("drops the lowest scores first when over the cap", () => {
    const s = new ScoreStore({ max: 5 });
    for (let i = 0; i < 8; i++) s.add(sub({ name: `P${i}`, score: i * 10 }), { verified: false });
    expect(s.size).toBe(5);
    expect(s.list("all", 50).map((e) => e.score)).toEqual([70, 60, 50, 40, 30]);
  });

  it("saves to a JSON file and loads it back", async () => {
    const file = join(dir, "nested", "scores.json");
    const s = new ScoreStore({ file, debounceMs: 5 });
    s.add(sub({ name: "Persist", score: 88 }), { verified: false });
    await s.flush();
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8")).entries).toHaveLength(1);
    expect(new ScoreStore({ file }).list("all", 5)[0]).toMatchObject({ name: "Persist", score: 88 });
  });

  it("starts empty when the file is missing or corrupt", () => {
    expect(new ScoreStore({ file: join(dir, "absent.json") }).size).toBe(0);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{ not json");
    expect(new ScoreStore({ file: bad }).size).toBe(0);
    const partial = join(dir, "partial.json");
    writeFileSync(partial, JSON.stringify({ entries: [{ id: "x" }, null, 3] }));
    expect(new ScoreStore({ file: partial }).size).toBe(0);
  });
});

describe("RateLimiter", () => {
  it("allows a burst up to the limit per address, then recovers", () => {
    const r = new RateLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => r.allow("a", 0))).toEqual([true, true, true, false]);
    expect(r.allow("b", 0)).toBe(true);
    expect(r.allow("a", 1500)).toBe(true);
  });
});

describe("leaderboard HTTP API", () => {
  let server: RunningServer;
  let base: string;
  beforeAll(async () => {
    server = await startServer(0, "127.0.0.1");
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(async () => {
    await server.close();
  });
  const post = (body: unknown, raw = false) => fetch(`${base}/api/scores`, { method: "POST", headers: { "content-type": "application/json" }, body: raw ? String(body) : JSON.stringify(body) });

  it("stores a submission as unverified and lists it with CORS", async () => {
    const res = await post(sub({ name: "Grace", score: 91 }));
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect((await res.json()).entry).toMatchObject({ name: "Grace", verified: false, score: 91, missionName: MISSIONS[0].name });
    const list = await fetch(`${base}/api/scores?mission=${mission}&limit=5`);
    const { entries } = await list.json();
    expect(entries[0]).toMatchObject({ name: "Grace", score: 91 });
    const other = await (await fetch(`${base}/api/scores?mission=${MISSIONS[2].id}`)).json();
    expect(other.entries).toEqual([]);
  });

  it("answers the browser's preflight request", async () => {
    const res = await fetch(`${base}/api/scores`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toMatch(/content-type/);
  });

  it("rejects invalid, malformed and oversized bodies", async () => {
    expect((await post(sub({ score: 500 }))).status).toBe(400);
    expect((await post("{nope", true)).status).toBe(400);
    expect((await post("x".repeat(5000), true)).status).toBe(413);
  });

  it("rate-limits repeated submissions from one address", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post(sub({ name: `R${i}` }))).status);
    expect(codes).toContain(429);
    expect(codes[0]).toBe(201);
  });
});
