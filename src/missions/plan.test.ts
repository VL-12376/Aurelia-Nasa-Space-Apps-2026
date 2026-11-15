import { describe, expect, it } from "vitest";
import { capacityCheck, composeDesign, LAUNCHERS, LAUNCHER_BY_ID } from "../launch/vehicles";
import { analyse, type Design } from "../spacecraft/design";
import { dataBudget, lifetime } from "../spacecraft/resources";
import { TEMPLATES } from "../spacecraft/templates";
import { Flight } from "./flight";
import { MISSIONS } from "./missions";
import { EARTH_ORBITS, MOON_ORBITS, orbitsFor } from "./orbits";
import { effectiveMission, phasesFor, resolvePlan } from "./plan";

const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;
const craftOnly = (id = "light-launcher"): Design => structuredClone(TEMPLATES.find((t) => t.id === id)!.design);

describe("orbit choices", () => {
  it("costs more delta-v the higher the orbit, derived from orbital mechanics", () => {
    const dv = Object.fromEntries(EARTH_ORBITS.map((o) => [o.id, o.extraDv]));
    expect(dv.leo).toBe(0);
    expect(dv.sso).toBeGreaterThan(100);
    expect(dv.meo).toBeGreaterThan(dv.sso);
    expect(dv.geo).toBeGreaterThan(dv.meo);
    expect(dv.geo).toBeGreaterThan(3_500);
    expect(dv.geo).toBeLessThan(4_100);
  });

  it("an elliptical lunar capture saves braking compared with a circular one", () => {
    const ellipse = MOON_ORBITS.find((o) => o.id === "lunar-ellipse")!;
    expect(ellipse.extraDv).toBeLessThan(-300);
    expect(ellipse.extraDv).toBeGreaterThan(-500);
  });

  it("offers a choice only where the mission leaves one", () => {
    expect(orbitsFor(mission("s1-first-satellite")).length).toBe(4);
    expect(orbitsFor(mission("s3-mars-orbiter")).length).toBe(1);
  });

  it("adds an orbit-raising burn for a higher orbit and keeps the default profile unchanged", () => {
    const m = mission("s1-first-satellite");
    const geo = resolvePlan(m, { orbit: "geo" });
    expect(phasesFor(m, geo).some((p) => p.id === "orbit-raise")).toBe(true);
    expect(effectiveMission(m, geo).requiredDeltaV).toBe(m.requiredDeltaV + geo.extraDv);
    expect(phasesFor(m, resolvePlan(m)).some((p) => p.id === "orbit-raise")).toBe(false);
  });
});

describe("launch vehicle catalogue", () => {
  it("every vehicle lifts off and has delta-v when carrying a light spacecraft", () => {
    for (const v of LAUNCHERS) {
      const s = analyse(composeDesign(craftOnly(), v));
      expect(s.liftoffTwr, v.name).toBeGreaterThan(1);
      expect(s.deltaV, v.name).toBeGreaterThan(7_000);
    }
  });

  it("checks the spacecraft against the published capacity for the orbit", () => {
    const m1 = mission("s1-first-satellite");
    const leo = EARTH_ORBITS[0];
    expect(capacityCheck(LAUNCHER_BY_ID.electron, m1, leo, 100).ok).toBe(true);
    expect(capacityCheck(LAUNCHER_BY_ID.electron, m1, leo, 500).ok).toBe(false);
    const moon = mission("s2-lunar-orbiter");
    expect(capacityCheck(LAUNCHER_BY_ID.electron, moon, MOON_ORBITS[0], 100).ok).toBe(false);
    expect(capacityCheck(LAUNCHER_BY_ID.saturn5, moon, MOON_ORBITS[0], 20_000).ok).toBe(true);
    expect(capacityCheck(LAUNCHER_BY_ID.electron, m1, EARTH_ORBITS[3], 100).detail).toMatch(/not rated/);
  });

  it("flies a mission on a catalogue launcher to the end and records the plan", () => {
    const f = new Flight(craftOnly(), mission("s1-first-satellite"), 5, { plan: { launcher: "atlas5-401" } });
    for (let i = 0; i < 4000 && (f.status === "running" || f.status === "decision"); i++) {
      if (f.status === "decision") f.decide(f.pending!.options.filter((o) => !o.disabled)[0].id);
      else f.step(600);
    }
    expect(f.outcome).not.toBeNull();
    expect(f.outcome!.plan?.launcher).toBe("Atlas V 401");
    expect(f.outcome!.resources).toBeDefined();
  });
});

describe("data and lifetime", () => {
  const withAntenna = (id: string): Design => {
    const d = craftOnly("earth-watch");
    d.parts = d.parts.filter((r) => !r.partId.startsWith("ant-"));
    d.parts.push({ partId: id, target: "craft" });
    return d;
  };

  it("a bigger antenna and longer ground contact return more of the data", () => {
    const m = mission("s1-earth-watch");
    const patch = dataBudget(withAntenna("ant-uhf"), m, EARTH_ORBITS[0]);
    const dish = dataBudget(withAntenna("ant-dish"), m, EARTH_ORBITS[0]);
    expect(dish.returnPct).toBeGreaterThan(patch.returnPct);
    const geo = dataBudget(withAntenna("ant-uhf"), m, EARTH_ORBITS[3]);
    expect(geo.contactMinPerDay).toBeGreaterThan(patch.contactMinPerDay);
  });

  it("lifetime grows with spare delta-v in a decaying orbit, and a high orbit outlasts a low one", () => {
    const m = mission("s1-first-satellite");
    const s = analyse(craftOnly());
    const tight = { ...s, deltaV: m.requiredDeltaV + 30 };
    const low = lifetime(tight, m, EARTH_ORBITS[0], m.requiredDeltaV);
    const high = lifetime(tight, m, EARTH_ORBITS[1], m.requiredDeltaV);
    expect(high.days).toBeGreaterThan(low.days);
    const more = lifetime({ ...tight, deltaV: tight.deltaV + 300 }, m, EARTH_ORBITS[0], m.requiredDeltaV);
    expect(more.days).toBeGreaterThan(low.days);
  });
});
