import { analyse, ascentPenalty, type Design, type Stats } from "../spacecraft/design";
import { preflight, type PreflightCheck } from "./flight";
import type { MissionDef } from "./missions";
import { effectiveMission, planChecks, planDesign, resolvePlan, type MissionPlan, type ResolvedPlan } from "./plan";

export interface Gate {
  checks: PreflightCheck[];
  stats: Stats;
  /** The spacecraft on its chosen launch vehicle (or the player's own rocket). */
  design: Design;
  plan: ResolvedPlan;
  /** The mission with the plan's extra delta-v and launch price included. */
  mission: MissionDef;
}

/** The launch checks for a design flown with a plan: orbit, launch vehicle, data, lifetime and everything preflight already covers. */
export function launchGate(design: Design, m: MissionDef, plan: MissionPlan | undefined, funds: number, sandbox = false): Gate {
  const resolved = resolvePlan(m, plan);
  const flown = planDesign(design, resolved);
  const stats = analyse(flown);
  const eff = effectiveMission(m, resolved);
  const checks = [...preflight(stats, flown, eff, sandbox ? Number.MAX_SAFE_INTEGER : funds), ...planChecks(stats, flown, m, resolved, eff.requiredDeltaV + ascentPenalty(stats.liftoffTwr))];
  if (sandbox) for (const c of checks) if (c.label === "Mission funding") c.detail = "Sandbox: funds are unlimited";
  return { checks, stats, design: flown, plan: resolved, mission: eff };
}
