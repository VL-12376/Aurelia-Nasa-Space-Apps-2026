import type { ScreenId } from "../core/router";
import type { GameState } from "../core/gameState";
import { missionsForSeason } from "../missions/missions";
import { TECHS } from "../research/tech";

export interface GuideStep {
  id: string;
  /** Concept maturity level this step belongs to (see the Academy). */
  cml: number;
  title: string;
  why: string;
  detail: string;
  screen: ScreenId;
  action: string;
}

/** What the player should do next, worked out from their saved game. Returns null when there is nothing to nudge. */
export function nextStep(g: GameState): GuideStep | null {
  if (g.flights === 0) {
    if (!g.fleet.length && !g.draft.parts.length) {
      return { id: "design", cml: 3, title: "Design your first rocket", why: "Every mission has a delta-v price. Stack tanks and engines until your rocket can pay it.", detail: "Open the Hangar and choose a starter design from the toolbar to see how it works. Watch the Delta-v number and the Mission suitability panel: when it turns green, your rocket can do the mission.", screen: "hangar", action: "Open the Hangar" };
    }
    if (!g.fleet.length) {
      return { id: "build", cml: 4, title: "Build your rocket", why: "Building pays for the design and puts it in your hangar bay, ready to launch.", detail: "Check Mission suitability first. If anything is red, the Design advisor tells you what to change. Then press Build (or ask the Aerospace Engineer, who approves every build).", screen: "hangar", action: "Back to the Hangar" };
    }
    return { id: "launch", cml: 5, title: "Pick a mission and launch", why: "The briefing explains the goal, the risks and the flight plan. Every launch check must pass.", detail: "Read the Flight plan to see the delta-v price of each burn. The launch checks compare your rocket with those prices, with a margin for surprises.", screen: "briefing", action: "Open Missions" };
  }
  const affordable = TECHS.some((t) => t.season <= g.season && !g.researchedTech.includes(t.id) && t.requires.every((r) => g.researchedTech.includes(r)) && t.cost <= g.researchPoints);
  if (affordable) {
    return { id: "research", cml: 3, title: "Spend your research points", why: "New technology unlocks better engines, tanks and instruments for harder missions.", detail: "Each technology unlocks real parts in the Hangar. Harder missions need them: heavier tanks for the Moon, better antennas for Mars.", screen: "research", action: "Open Research" };
  }
  if (missionsForSeason(g.season).some((m) => !g.completedMissions.includes(m.id))) {
    return { id: "next", cml: 1, title: "Plan your next mission", why: "Each mission asks a bit more of your engineering. Compare it with a real one, then design for it.", detail: "Open the briefing and read the real-world mission it is based on. Then adjust your design in the Hangar until every check is green.", screen: "briefing", action: "Open Missions" };
  }
  return null;
}
