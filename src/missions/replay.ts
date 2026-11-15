import { DIFFICULTY_BY_ID, type Difficulty } from "../core/play";
import { PART_BY_ID } from "../spacecraft/parts";
import type { Design, Target } from "../spacecraft/design";
import { Flight, launchBlockers, type Outcome } from "./flight";
import { launchGate } from "./launchGate";
import { MISSIONS, type MissionDef } from "./missions";
import type { MissionPlan } from "./plan";
import { computeScore, type MissionScore } from "./score";

/**
 * Everything needed to re-fly a single-player mission somewhere else: the spacecraft, the plan, the seed
 * and every decision in order. The simulation is deterministic, so a server can replay it and compute the
 * score itself instead of trusting a number from the browser.
 */
export interface ReplayInput {
  missionId: string;
  design: Design;
  seed: number;
  plan?: MissionPlan;
  difficulty: Difficulty;
  solarActivity?: number;
  decisions: { eventId: string; option: string; skill?: number }[];
}

export type ReplayResult = { ok: true; outcome: Outcome; score: MissionScore; mission: MissionDef; design: Design } | { ok: false; reason: string };

const TARGETS = new Set<string>(["s1", "s2", "s3", "craft"]);
const MAX_PARTS = 80;
const MAX_DECISIONS = 40;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/** Checks the shape and values of a replay before it is run. Never throws. */
export function validateReplay(x: unknown): { ok: true; value: ReplayInput } | { ok: false; reason: string } {
  const bad = (reason: string) => ({ ok: false as const, reason });
  if (!x || typeof x !== "object") return bad("No flight was sent.");
  const r = x as Record<string, unknown>;
  if (!text(r.missionId, 60) || !MISSIONS.some((m) => m.id === r.missionId)) return bad("Unknown mission.");
  if (typeof r.seed !== "number" || !Number.isInteger(r.seed) || r.seed < 0 || r.seed > 0xffffffff) return bad("Invalid flight seed.");
  if (!(typeof r.difficulty === "string" && r.difficulty in DIFFICULTY_BY_ID)) return bad("Unknown difficulty.");

  const d = r.design as { name?: unknown; parts?: unknown } | undefined;
  if (!d || typeof d !== "object" || !Array.isArray(d.parts) || d.parts.length === 0 || d.parts.length > MAX_PARTS) return bad("Invalid spacecraft.");
  const parts: Design["parts"] = [];
  for (const p of d.parts as unknown[]) {
    const ref = p as { partId?: unknown; target?: unknown };
    if (!ref || !text(ref.partId, 60) || !TARGETS.has(String(ref.target))) return bad("Invalid spacecraft part.");
    const def = PART_BY_ID[ref.partId];
    if (!def || (def as { launcher?: boolean }).launcher) return bad("Unknown spacecraft part.");
    parts.push({ partId: ref.partId, target: ref.target as Target });
  }
  const name = typeof d.name === "string" ? d.name.slice(0, 24) : "Spacecraft";

  let plan: MissionPlan | undefined;
  if (r.plan !== undefined && r.plan !== null) {
    const p = r.plan as { orbit?: unknown; launcher?: unknown };
    if (typeof p !== "object") return bad("Invalid plan.");
    if (p.orbit !== undefined && !text(p.orbit, 40)) return bad("Invalid plan.");
    if (p.launcher !== undefined && !text(p.launcher, 40)) return bad("Invalid plan.");
    plan = { orbit: p.orbit as string | undefined, launcher: p.launcher as string | undefined };
  }

  let solarActivity: number | undefined;
  if (r.solarActivity !== undefined && r.solarActivity !== null) {
    if (typeof r.solarActivity !== "number" || !Number.isFinite(r.solarActivity)) return bad("Invalid space-weather value.");
    solarActivity = Math.min(2, Math.max(0.5, r.solarActivity));
  }

  if (!Array.isArray(r.decisions) || r.decisions.length > MAX_DECISIONS) return bad("Invalid decisions.");
  const decisions: ReplayInput["decisions"] = [];
  for (const dec of r.decisions as unknown[]) {
    const x2 = dec as { eventId?: unknown; option?: unknown; skill?: unknown };
    if (!x2 || !text(x2.eventId, 40) || !text(x2.option, 40)) return bad("Invalid decision.");
    if (x2.skill !== undefined && (typeof x2.skill !== "number" || !Number.isFinite(x2.skill))) return bad("Invalid decision.");
    decisions.push({ eventId: x2.eventId, option: x2.option, ...(typeof x2.skill === "number" ? { skill: Math.min(1, Math.max(0, x2.skill)) } : {}) });
  }

  return { ok: true, value: { missionId: r.missionId, design: { name, parts }, seed: r.seed, plan, difficulty: r.difficulty as Difficulty, solarActivity, decisions } };
}

/**
 * Re-flies the mission and scores it. Fails if the spacecraft could never have passed the launch gate, or if
 * the recorded decisions do not fit the events that the flight actually raises.
 */
export function replayFlight(input: ReplayInput): ReplayResult {
  const mission = MISSIONS.find((m) => m.id === input.missionId);
  if (!mission) return { ok: false, reason: "Unknown mission." };
  const gate = launchGate(input.design, mission, input.plan, Number.MAX_SAFE_INTEGER, true);
  if (launchBlockers(gate.checks).length) return { ok: false, reason: "That spacecraft could not have launched this mission." };

  const f = new Flight(input.design, mission, input.seed, { plan: input.plan, difficulty: input.difficulty, solarActivity: input.solarActivity });
  let next = 0;
  for (let i = 0; i < 20_000 && (f.status === "running" || f.status === "decision"); i++) {
    if (f.status === "decision") {
      const want = input.decisions[next++];
      const p = f.pending!;
      if (!want || want.eventId !== p.eventId) return { ok: false, reason: "The recorded decisions do not match the flight." };
      const opt = p.options.find((o) => o.id === want.option);
      if (!opt || opt.disabled) return { ok: false, reason: "A recorded decision was not available." };
      f.decide(want.option, want.skill);
    } else f.step(Math.max(f.chunkSeconds(), 1));
  }
  if (!f.outcome) return { ok: false, reason: "The flight did not finish." };
  if (next !== input.decisions.length) return { ok: false, reason: "The recorded decisions do not match the flight." };
  return { ok: true, outcome: f.outcome, score: computeScore(f.outcome, mission, input.difficulty), mission, design: input.design };
}
