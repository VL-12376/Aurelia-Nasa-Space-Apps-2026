import { describe, expect, it } from "vitest";
import { MISSIONS } from "../missions/missions";
import { Flight, launchBlockers, preflight } from "../missions/flight";
import { PARTS } from "../spacecraft/parts";
import { analyse, emptyDesign, type Design } from "../spacecraft/design";
import { TECHS } from "../research/tech";
import { aiContribute, aiDecide } from "./ai";
import { canEditPart, roleForEvent, ROLE_BY_ID } from "./roles";

const ALL_TECH = TECHS.map((t) => t.id);

function crewDesign(missionId: string, researched: string[]): Design {
  const m = MISSIONS.find((x) => x.id === missionId)!;
  let d = emptyDesign();
  for (const role of ["aerospace", "controller", "science", "aerospace", "science", "propulsion"] as const) d = aiContribute(role, d, m, researched).design;
  return d;
}

describe("crew roles", () => {
  it("every part category is editable by exactly one role", () => {
    for (const p of PARTS) {
      const owners = (Object.keys(ROLE_BY_ID) as (keyof typeof ROLE_BY_ID)[]).filter((r) => canEditPart(r, p));
      expect(owners.length, p.id).toBe(1);
    }
  });

  it("every flight event has an owner role", () => {
    for (const e of ["engine-anomaly", "nav-error", "comm-dropout", "solar-flare", "power-brownout", "landing-hazard", "entry-heat", "instrument-fault"]) {
      expect(ROLE_BY_ID[roleForEvent(e)], e).toBeTruthy();
    }
  });
});

describe("AI crew design", () => {
  it("the crew can design both Season 1 missions from starter parts", () => {
    for (const id of ["s1-first-satellite", "s1-earth-watch"]) {
      const m = MISSIONS.find((x) => x.id === id)!;
      const d = crewDesign(id, []);
      const blockers = launchBlockers(preflight(analyse(d), d, m, 1e11)).map((b) => `${b.label}: ${b.detail}`);
      expect(blockers, id).toEqual([]);
    }
  });

  it("with everything researched the crew can design every mission", () => {
    const failed: string[] = [];
    for (const m of MISSIONS) {
      const d = crewDesign(m.id, ALL_TECH);
      const blockers = launchBlockers(preflight(analyse(d), d, m, 1e11));
      if (blockers.length) failed.push(`${m.name}: ${blockers.map((b) => b.label + " (" + b.detail + ")").join("; ")}`);
    }
    expect(failed).toEqual([]);
    // The crew searches for engine layouts, which takes several seconds on a slow machine.
  }, 60_000);
});

describe("AI crew decisions", () => {
  it("always choose an enabled option and explain it", () => {
    const m = MISSIONS.find((x) => x.id === "s1-first-satellite")!;
    const d = crewDesign(m.id, []);
    for (let seed = 1; seed <= 30; seed++) {
      const f = new Flight(d, m, seed);
      for (let i = 0; i < 4000 && (f.status === "running" || f.status === "decision"); i++) {
        if (f.status === "decision") {
          const r = aiDecide(f.pending!, f);
          expect(f.pending!.options.find((o) => o.id === r.option)?.disabled).toBeFalsy();
          expect(r.line.length).toBeGreaterThan(5);
          f.decide(r.option);
        } else f.step(600);
      }
      expect(["success", "partial", "failed"]).toContain(f.status);
    }
  });
});
