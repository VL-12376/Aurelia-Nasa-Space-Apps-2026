import { G0 } from "../physics/orbital";
import type { MissionDef } from "../missions/missions";
import { PARTS } from "./parts";
import { STAGE_TARGETS, TARGET_LABEL, addPart, analyse, isUnlocked, missionChecks, type Design, type Stats, type Target } from "./design";

export interface WorkedStage {
  label: string;
  isp: number;
  m0: number;
  mf: number;
  deltaV: number;
}

/** The rocket equation filled in with this design's own numbers. */
export function workedExample(stats: Stats): WorkedStage[] {
  return stats.stages
    .filter((s) => s.active && s.deltaV > 0)
    .map((s) => ({ label: TARGET_LABEL[s.target], isp: s.isp, m0: s.m0, mf: s.mf, deltaV: s.deltaV }));
}

/** Delta-v the same hardware would give with no staging: one burn, all propellant, one set of engines. */
export function unstagedDeltaV(stats: Stats): number {
  const used = stats.stages.filter((s) => s.active && s.isp > 0);
  const prop = used.reduce((n, s) => n + s.propellant, 0);
  if (!prop) return 0;
  const isp = used.reduce((n, s) => n + s.isp * s.propellant, 0) / prop;
  const m0 = stats.totalMass;
  return isp * G0 * Math.log(m0 / (m0 - prop));
}

export interface Tip {
  tone: "bad" | "warn" | "info" | "ok";
  title: string;
  body: string;
}

export function advise(design: Design, stats: Stats, mission: MissionDef | null, researched: string[]): Tip[] {
  const tips: Tip[] = [];
  const hasBus = stats.slotsCapacity > 0;
  if (!design.parts.length) {
    return [{ tone: "info", title: "Where to start", body: "Pick a starter design from the toolbar, or build from the top: a bus for the payload, then a stage with tanks and engines. Watch the Delta-v number as you add parts." }];
  }
  if (!hasBus) tips.push({ tone: "warn", title: "Add a spacecraft bus", body: "The bus carries your payload. Without it the rocket has nothing to deliver. Open Structures and pick a bus." });

  const s1 = stats.stages[0];
  if (s1.active && s1.thrustSl === 0 && s1.engines > 0) {
    tips.push({ tone: "bad", title: "These engines cannot lift off", body: "Vacuum-optimised engines produce no useful thrust at sea level. Use a booster engine such as Kestrel-1 in Stage 1." });
  } else if (s1.active && s1.engines > 0 && s1.propellant > 0 && s1.twr <= 1) {
    const need = Math.ceil(((stats.totalMass * 9.80665) / (s1.thrustSl / s1.engines)) * 1.2);
    tips.push({ tone: "bad", title: "Too heavy to lift off", body: `Thrust (${Math.round(s1.thrustSl / 1000)} kN) is below the vehicle's weight (${Math.round((stats.totalMass * 9.80665) / 1000)} kN). Add engines to Stage 1 (about ${need} in total would give a comfortable margin), or remove propellant.` });
  }
  const s2 = stats.stages[1];
  if (s2.active && s2.engines > 0 && s2.twr < 1) {
    tips.push({ tone: "info", title: "Low upper-stage thrust is normal", body: `Stage 2 has thrust-to-weight ${s2.twr.toFixed(2)}. That is fine: it burns in orbit where gravity is not pulling it straight down, so it can take longer. The price is a longer burn (${Math.round(s2.burnTime / 60)} min).` });
  }

  const unstaged = unstagedDeltaV(stats);
  if (stats.stages.filter((s) => s.active && s.deltaV > 0).length > 1 && stats.deltaV > 0) {
    tips.push({ tone: "ok", title: "Staging is paying off", body: `With the same tanks and engines but no staging, the vehicle would only reach ${(unstaged / 1000).toFixed(2)} km/s instead of ${(stats.deltaV / 1000).toFixed(2)} km/s. Dropping empty tanks is worth ${((stats.deltaV - unstaged) / 1000).toFixed(2)} km/s.` });
  }

  if (stats.powerDraw > stats.powerGen && hasBus) tips.push({ tone: "warn", title: "Not enough power", body: "The instruments draw more than the panels generate. Add a solar panel or remove a power-hungry instrument." });
  else if (stats.powerDraw > 0 && stats.eclipseHours < 0.6) tips.push({ tone: "warn", title: "Batteries too small for eclipse", body: "In low Earth orbit the spacecraft spends up to 36 minutes in shadow per orbit. Add a battery." });

  if (mission) {
    const checks = missionChecks(stats, mission);
    const dvGap = mission.requiredDeltaV - stats.deltaV;
    if (dvGap > 0 && stats.errors.length === 0) {
      const best = bestDeltaVAddition(design, stats, researched);
      tips.push({ tone: "bad", title: `${mission.name}: needs ${Math.round(dvGap)} m/s more delta-v`, body: best ? `Adding ${best.name} to ${TARGET_LABEL[best.target]} gives about +${Math.round(best.gain)} m/s. Remember that extra propellant also adds mass for the stages below it to lift.` : "Add propellant or reduce payload mass. Every kilogram saved on top is worth more than one saved on a lower stage." });
    }
    const missing = checks.filter((c) => !c.ok && c.label !== "Delta-v");
    for (const c of missing.slice(0, 2)) tips.push({ tone: "warn", title: `${mission.name}: ${c.label}`, body: c.detail });
    if (checks.every((c) => c.ok)) tips.push({ tone: "ok", title: `Ready for ${mission.name}`, body: "This design meets every requirement. Build it, then open the mission briefing to launch." });
  }
  return tips.slice(0, 5);
}

function bestDeltaVAddition(design: Design, stats: Stats, researched: string[]): { name: string; target: Target; gain: number } | null {
  let best: { name: string; target: Target; gain: number } | null = null;
  for (const t of STAGE_TARGETS) {
    if (!stats.stages.find((s) => s.target === t)?.active) continue;
    for (const p of PARTS.filter((x) => x.category === "tank" && isUnlocked(x, researched))) {
      const res = addPart(design, p.id, t);
      if (!res.ok) continue;
      const next = analyse(res.design);
      if (next.errors.length > stats.errors.length) continue;
      const gain = next.deltaV - stats.deltaV;
      if (gain > 0 && (!best || gain > best.gain)) best = { name: p.name, target: t, gain };
    }
  }
  return best;
}
