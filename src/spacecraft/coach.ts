import type { MissionDef } from "../missions/missions";
import { addPart, analyse, bus, isUnlocked, partsIn, requiredCommRangeMkm, type Design, type Stats, type Target } from "./design";
import { PART_BY_ID, type PartCategory } from "./parts";

export interface CoachStep {
  id: string;
  /** Short instruction. */
  title: string;
  /** Why this matters, in plain words. */
  why: string;
  category: PartCategory;
  target: Target;
  /** The catalogue part to add, or null when the design is finished. */
  partId: string | null;
  done?: boolean;
}

/** First part in the list that is researched and physically fits, so the coach never suggests a locked or impossible part. */
function firstFit(design: Design, ids: string[], target: Target, researched: string[]): string | null {
  for (const id of ids) {
    const p = PART_BY_ID[id];
    if (p && isUnlocked(p, researched) && addPart(design, id, target).ok) return id;
  }
  return null;
}

const lacks = (stats: Stats, c: string) => !(stats.capabilities as string[]).includes(c);

/**
 * Works out the single most useful next action for a design, in the order an engineer would take
 * them: payload carrier, lift-off, then what the mission needs, then range of the rocket.
 */
export function nextBuildStep(design: Design, stats: Stats, mission: MissionDef | null, researched: string[]): CoachStep {
  const finished = (title: string, why: string): CoachStep => ({ id: "done", title, why, category: "structure", target: "s1", partId: null, done: true });
  const step = (id: string, title: string, why: string, category: PartCategory, target: Target, ids: string[]): CoachStep => ({ id, title, why, category, target, partId: firstFit(design, ids, target, researched) });
  const caps = mission?.requiredCapabilities ?? [];
  const s1 = partsIn(design, "s1");
  const s2 = partsIn(design, "s2");
  const needRange = mission ? requiredCommRangeMkm(mission) : 0;

  if (!bus(design)) return step("bus", "Add a spacecraft bus", "The bus is the body of your spacecraft. Everything useful, from solar panels to cameras, is mounted on it, and it is the payload the rocket delivers.", "structure", "craft", mission && mission.minPayloadKg > 250 ? ["bus-m", "bus-s"] : ["bus-s", "bus-m"]);
  if (!s1.some((x) => x.part.category === "engine")) return step("engine1", "Add a booster engine to Stage 1", "Stage 1 must push the whole rocket off the ground. Only engines made for sea level can do that; vacuum engines produce no useful thrust in thick air.", "engine", "s1", ["kestrel-1", "goliath-1"]);
  if (!s1.some((x) => x.part.category === "tank")) return step("tank1", "Add a fuel tank to Stage 1", "An engine is useless without propellant. Tanks are heavy, so more fuel means more speed but also more weight to lift.", "tank", "s1", ["tank-m", "tank-s", "tank-l"]);
  if (stats.liftoffTwr <= 1) return step("twr", "Add another engine to Stage 1", `Thrust divided by weight is ${stats.liftoffTwr.toFixed(2)}. It must be above 1 or the rocket just sits on the pad. Real launchers aim for about 1.2 to 1.5.`, "engine", "s1", ["kestrel-1", "goliath-1"]);

  if (caps.includes("science-payload") && lacks(stats, "science-payload")) return step("science", "Add a science instrument", "A mission exists to measure something. The instrument is the reason the spacecraft flies, and it draws power, so panels come next.", "science", "craft", ["sci-cam", "sci-spec", "sci-seis", "sci-drill"]);
  if (caps.includes("navigation") && lacks(stats, "navigation")) return step("nav", "Add navigation hardware", "A star tracker tells the spacecraft which way it is pointing by reading the stars. Without it, it cannot aim its engine or antenna.", "systems", "craft", ["nav-star", "nav-imu"]);
  if (caps.includes("landing") && lacks(stats, "landing")) return step("legs", "Add landing legs", "Legs absorb the shock of touchdown and keep the engine bell clear of the ground.", "systems", "craft", ["sys-legs"]);
  if (caps.includes("heat-shield") && lacks(stats, "heat-shield")) return step("shield", "Add a heat shield", "Entering an atmosphere at several km/s heats the air into a plasma. The shield burns away to carry that heat off.", "systems", "craft", ["sys-shield"]);

  if (lacks(stats, "communications") || stats.commRangeMkm < needRange) {
    const upgrade = stats.commRangeMkm > 0;
    const ids = needRange > 60 ? ["ant-hga"] : needRange > 0.6 ? ["ant-dish", "ant-hga"] : ["ant-uhf", "ant-dish"];
    return step("antenna", upgrade ? "Fit a longer-range antenna" : "Add an antenna", upgrade ? `This mission needs a radio link of ${needRange} million km. A bigger dish reaches farther but needs more power.` : "Without a radio the spacecraft cannot send you any data or receive commands. The farther it goes, the larger the antenna must be.", "antenna", "craft", ids);
  }
  if (stats.powerGen <= 0 || stats.powerDraw > stats.powerGen) return step("solar", "Add a solar panel", stats.powerGen <= 0 ? "Everything on board needs electricity, and in space the Sun is the supply. No panel means a dead spacecraft." : "The equipment draws more power than the panels make. Add a panel or the batteries will drain and the computer will reset.", "solar", "craft", ["solar-m", "solar-s", "solar-l"]);
  if (stats.powerDraw > 0 && stats.eclipseHours < 0.6) return step("battery", "Add a battery", "In low Earth orbit the spacecraft spends up to 36 minutes in Earth's shadow on every lap, with no sunlight. Batteries carry it through.", "battery", "craft", ["bat-s", "bat-m", "bat-l"]);

  if (mission && stats.payloadMass < mission.minPayloadKg) {
    return step("payload", "Upgrade the spacecraft payload", `This mission needs at least ${mission.minPayloadKg} kg delivered, and you have ${Math.round(stats.payloadMass)} kg. A bigger bus, or more equipment, adds payload mass.`, "structure", "craft", ["bus-m", "bus-l"]);
  }
  if (mission) {
    const penalty = stats.liftoffTwr < 1.3 ? Math.min(900, (1.3 - stats.liftoffTwr) * 600) : 0;
    const gap = Math.round(mission.requiredDeltaV + penalty - stats.deltaV);
    if (gap > 0) {
      if (!s2.some((x) => x.part.category === "engine")) return step("engine2", "Add an engine to Stage 2", `You are ${gap} m/s short of the speed this mission needs. A second stage lets you throw away empty tanks and keep going: the key trick of rocketry.`, "engine", "s2", ["ember-1", "vesper", "kestrel-v"]);
      if (!s2.some((x) => x.part.category === "tank")) return step("tank2", "Add a fuel tank to Stage 2", `Still ${gap} m/s short. The upper stage needs its own propellant.`, "tank", "s2", ["tank-m", "tank-s", "tank-l"]);
      // Try each tank in each stage and keep the one that adds the most speed while the rocket can still lift off.
      let best: { id: string; target: Target; dv: number } | null = null;
      for (const target of ["s2", "s1"] as Target[]) {
        for (const id of ["tank-s", "tank-m", "tank-l", "tank-xl", "tank-xxl"]) {
          const p = PART_BY_ID[id];
          if (!isUnlocked(p, researched)) continue;
          const r = addPart(design, id, target);
          if (!r.ok) continue;
          const a = analyse(r.design);
          if (a.liftoffTwr >= 1.15 && a.deltaV > stats.deltaV && (!best || a.deltaV > best.dv)) best = { id, target, dv: a.deltaV };
        }
      }
      if (best) return { id: "tank-more", title: `Add ${PART_BY_ID[best.id].name} to ${best.target === "s2" ? "Stage 2" : "Stage 1"}`, why: `Still ${gap} m/s short. This tank adds about ${Math.round(best.dv - stats.deltaV)} m/s and the rocket can still lift off. Remember that every tonne of fuel also has to be lifted by the stages below it.`, category: "tank", target: best.target, partId: best.id };
      return step("more-thrust", "Add another engine to Stage 1", "More fuel makes the rocket too heavy to lift. More thrust in Stage 1 lets it carry that fuel.", "engine", "s1", ["kestrel-1", "goliath-1"]);
    }
  }
  return finished("Your design is ready", mission ? `It meets every requirement for ${mission.name}. Press Build spacecraft, then open the mission briefing to launch.` : "Nothing is missing. Pick a mission to see whether it is enough.");
}
