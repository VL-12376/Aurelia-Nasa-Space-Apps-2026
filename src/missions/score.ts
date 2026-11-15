import { DIFFICULTY_BY_ID, type Difficulty } from "../core/play";
import type { Outcome } from "./flight";
import type { MissionDef } from "./missions";

/** Pure scoring for a finished flight. No DOM, so the browser and the server compute it identically. */

export interface ScorePart {
  label: string;
  points: number;
  max: number;
}

export interface MissionScore {
  total: number;
  parts: ScorePart[];
  rank: string;
}

export const MAX_SCORE = 130;

/** Rank titles by final score (difficulty included). */
const RANKS: { from: number; title: string }[] = [
  { from: 98, title: "Legend" },
  { from: 82, title: "Flight Director" },
  { from: 65, title: "Mission Specialist" },
  { from: 45, title: "Flight Engineer" },
  { from: 25, title: "Technician" },
  { from: 0, title: "Trainee" },
];

export function rankTitle(score: number): string {
  return (RANKS.find((r) => score >= r.from) ?? RANKS[RANKS.length - 1]).title;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/**
 * How good a margin is, 0 to 1: full marks inside the sweet spot, less when it is thin (reckless)
 * and less again when it is far larger than needed (waste).
 */
function marginFactor(pct: number, lo: number, hi: number, wasteAt: number): number {
  if (pct < 0) return 0;
  if (pct < lo) return 0.35 + 0.65 * (pct / lo);
  if (pct <= hi) return 1;
  return 1 - 0.65 * clamp((pct - hi) / (wasteAt - hi), 0, 1);
}

const EVENT_VALUE = { ok: 1, info: 0.8, warn: 0.6, bad: 0.1 } as const;
/** A failed mission still earns a little, but not for how well it was run. */
const FAILED_FACTOR = 0.4;

export function computeScore(outcome: Outcome, _mission: MissionDef, difficulty: Difficulty): MissionScore {
  const failed = outcome.result === "failed";
  const quality = failed ? FAILED_FACTOR : 1;

  const objectives = Array.isArray(outcome.objectives) ? outcome.objectives : [];
  const objectiveShare = objectives.length ? objectives.filter((o) => o.done).length / objectives.length : outcome.result === "success" ? 1 : 0;

  const scienceShare = outcome.scienceApplicable === false ? 1 : clamp(num(outcome.scienceScore, 0), 0, 100) / 100;

  const efficiency = 10 * marginFactor(num(outcome.dvMarginPct, 0), 8, 25, 100) + 5 * marginFactor(num(outcome.propellantLeftPct, 0), 5, 40, 100);

  let resources = 8;
  const r = outcome.resources;
  if (r) {
    const needed = num(r.lifetimeNeededDays, 0);
    const lifetime = needed > 0 ? clamp(num(r.lifetimeDays, 0) / needed, 0, 1) : 1;
    resources =
      4 * clamp(num(r.dataReturnPct, 0), 0, 100) / 100 +
      4 * lifetime +
      3.5 * marginFactor(num(r.massMarginPct, 0), 5, 30, 100) +
      3.5 * marginFactor(num(r.powerMarginPct, 0), 10, 35, 100);
  }
  resources *= quality;

  const events = Array.isArray(outcome.events) ? outcome.events : [];
  const decisions = events.length ? (10 * events.reduce((s, e) => s + (EVENT_VALUE[e.tone] ?? EVENT_VALUE.info), 0)) / events.length : 7;

  const reliability = outcome.result === "success" ? 10 : outcome.result === "partial" ? 7 : 0;

  const parts: ScorePart[] = [
    { label: "Objectives completed", points: Math.round(35 * objectiveShare), max: 35 },
    { label: "Science return", points: Math.round(15 * scienceShare * (failed ? 0.5 : 1)), max: 15 },
    { label: "Efficiency", points: Math.round(efficiency * quality), max: 15 },
    { label: "Resource management", points: Math.round(resources), max: 15 },
    { label: "Decisions under pressure", points: Math.round(decisions * quality), max: 10 },
    { label: "Reliability", points: reliability, max: 10 },
  ];
  for (const p of parts) p.points = clamp(p.points, 0, p.max);

  const raw = parts.reduce((s, p) => s + p.points, 0);
  const mult = DIFFICULTY_BY_ID[difficulty]?.scoreMult ?? 1;
  const total = clamp(Math.round(raw * mult), 0, MAX_SCORE);
  return { total, parts, rank: rankTitle(total) };
}
