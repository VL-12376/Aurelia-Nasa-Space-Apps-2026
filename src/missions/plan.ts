import { capacityCheck, composeDesign, LAUNCHER_BY_ID, OWN_ROCKET, type LaunchVehicle } from "../launch/vehicles";
import type { Design, Stats } from "../spacecraft/design";
import { dataBudget, fmtDays, fmtGb, lifetime, powerMarginPct } from "../spacecraft/resources";
import type { PreflightCheck } from "./flight";
import type { MissionDef } from "./missions";
import { defaultOrbit, orbitById, planExtraDv, type OrbitOption } from "./orbits";
import { profileFor, type BurnPhase, type Phase } from "./profiles";

/** What the player chose in the mission briefing. Missing values mean "the mission's default". */
export interface MissionPlan {
  orbit?: string;
  /** "own" for the rocket built in the hangar, or a catalogue vehicle id. */
  launcher?: string;
}

export interface ResolvedPlan {
  orbit: OrbitOption;
  launcher: LaunchVehicle | null;
  /** Delta-v the chosen orbit adds to the mission budget, m/s (negative if cheaper). */
  extraDv: number;
  /** What the launch vehicle costs on top of the mission's operations cost, USD. */
  launchCostUsd: number;
}

export function resolvePlan(m: MissionDef, plan?: MissionPlan): ResolvedPlan {
  const orbit = plan?.orbit ? orbitById(m, plan.orbit) : defaultOrbit(m);
  const launcher = plan?.launcher && plan.launcher !== OWN_ROCKET ? (LAUNCHER_BY_ID[plan.launcher] ?? null) : null;
  return { orbit, launcher, extraDv: planExtraDv(m, orbit), launchCostUsd: launcher?.priceUsd ?? 0 };
}

/** The mission with the plan's delta-v and launch cost folded in, for the launch gate and funding check. */
export function effectiveMission(m: MissionDef, r: ResolvedPlan): MissionDef {
  return { ...m, requiredDeltaV: m.requiredDeltaV + r.extraDv, costUsd: m.costUsd + r.launchCostUsd };
}

export function planDesign(design: Design, r: ResolvedPlan): Design {
  return composeDesign(design, r.launcher);
}

/** The mission's phases with the orbit change applied: an extra burn to climb, or a cheaper capture burn. */
export function phasesFor(m: MissionDef, r: ResolvedPlan): Phase[] {
  const phases = profileFor(m).map((p) => ({ ...p })) as Phase[];
  if (r.extraDv > 0) {
    const i = phases.findIndex((p) => p.id === "ascent");
    const burn: BurnPhase = {
      kind: "burn", id: "orbit-raise", label: `Raise the orbit to ${r.orbit.altKm.toLocaleString("en-US")} km`, view: "earth-orbit", deltaV: r.extraDv,
      explain: `A higher orbit costs more delta-v. The classic way is a Hohmann transfer: one burn stretches the orbit up to the new height, and a second burn circularises it. Orbital mechanics puts the total at about ${r.extraDv} m/s here.`,
    };
    phases.splice(i + 1, 0, burn);
  } else if (r.extraDv < 0) {
    const p = phases.find((x) => x.kind === "burn" && (x.id === "loi" || x.id === "plane")) as BurnPhase | undefined;
    if (p) p.deltaV = Math.max(100, p.deltaV + r.extraDv);
  }
  return phases;
}

/** Launch-vehicle compatibility, data return, lifetime and eclipse checks that depend on the plan. */
export function planChecks(stats: Stats, design: Design, m: MissionDef, r: ResolvedPlan, requiredDv: number): PreflightCheck[] {
  const checks: PreflightCheck[] = [];
  if (r.launcher) {
    const cap = capacityCheck(r.launcher, m, r.orbit, stats.payloadMass);
    checks.push({ label: "Launch vehicle capacity", ok: cap.ok, detail: cap.detail });
  }
  const data = dataBudget(design, m, r.orbit);
  if (data.instrumentMbps > 0) {
    checks.push({ label: "Data return", ok: data.returnPct >= 50, soft: true, detail: `${fmtGb(data.generatedGbPerDay)} recorded per day, ${fmtGb(data.downlinkGbPerDay)} can reach Earth (${Math.round(data.returnPct)}%). A bigger antenna or more ground contact raises it.` });
  }
  const life = lifetime(stats, m, r.orbit, requiredDv);
  checks.push({ label: "Mission lifetime", ok: life.days >= life.neededDays, soft: true, detail: `About ${fmtDays(life.days)} (limited by ${life.limiter}); ${fmtDays(life.neededDays)} wanted.` });
  if (stats.powerDraw > 0 && stats.eclipseHours < r.orbit.eclipseHours) {
    checks.push({ label: "Eclipse power", ok: false, soft: true, detail: `${r.orbit.label}: up to ${Math.round(r.orbit.eclipseHours * 60)} minutes in Earth's shadow per orbit, and the batteries cover ${Math.round(stats.eclipseHours * 60)}.` });
  }
  const margin = powerMarginPct(stats);
  if (stats.powerDraw > 0 && margin < 10) checks.push({ label: "Power margin", ok: margin >= 0, soft: true, detail: `Solar generation is ${margin.toFixed(0)}% above what the systems draw. Panels also age, so some margin is wise.` });
  return checks;
}
