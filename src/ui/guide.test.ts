import { describe, expect, it } from "vitest";
import { newGameState } from "../core/gameState";
import { nextStep } from "./guideLogic";

describe("guide: what to do next", () => {
  it("walks a new player through design, build, launch", () => {
    const g = newGameState("single", 1);
    expect(nextStep(g)?.id).toBe("design");
    g.draft.parts.push({ partId: "tank-s1", target: "s1" });
    expect(nextStep(g)?.id).toBe("build");
    g.fleet.push({ id: "c1", name: "AUR-1", parts: [], costPaid: 1, year: 1, deltaV: 1, payloadKg: 1 });
    expect(nextStep(g)?.id).toBe("launch");
  });

  it("after a flight it points to research when points can buy something, else to the next mission", () => {
    const g = newGameState("single", 1);
    g.flights = 1;
    g.researchPoints = 0;
    expect(nextStep(g)?.id).toBe("next");
    g.researchPoints = 500;
    expect(nextStep(g)?.id).toBe("research");
  });

  it("every step links to a real level of the maturity ladder", () => {
    const g = newGameState("single", 1);
    const s = nextStep(g)!;
    expect(s.cml).toBeGreaterThanOrEqual(1);
    expect(s.cml).toBeLessThanOrEqual(6);
  });
});
