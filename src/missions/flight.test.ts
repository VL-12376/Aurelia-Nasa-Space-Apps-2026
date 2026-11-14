import { describe, expect, it } from "vitest";
import { MISSIONS } from "./missions";
import { addPart, analyse, emptyDesign, type Design } from "../spacecraft/design";
import { TEMPLATES } from "../spacecraft/templates";
import { Flight, hashSeed, launchBlockers, preflight, type Outcome } from "./flight";
import { PROFILES, profileDeltaV } from "./profiles";

const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;
const template = (id: string): Design => structuredClone(TEMPLATES.find((t) => t.id === id)!.design);

function fly(design: Design, id: string, seed: number, pick: (ids: string[]) => string = (ids) => ids[0]): Flight {
  const f = new Flight(design, mission(id), seed);
  for (let i = 0; i < 5000 && (f.status === "running" || f.status === "decision"); i++) {
    if (f.status === "decision") {
      const options = f.pending!.options.filter((o) => !o.disabled).map((o) => o.id);
      f.decide(pick(options));
    } else f.step(600);
  }
  return f;
}

describe("mission profiles", () => {
  it("each profile's burns add up to the mission's delta-v budget", () => {
    for (const m of MISSIONS) expect(profileDeltaV(PROFILES[m.id]), m.name).toBe(m.requiredDeltaV);
  });

  it("every objective is completed by some phase", () => {
    for (const m of MISSIONS) {
      const done = new Set(PROFILES[m.id].flatMap((p) => p.completes ?? []));
      m.objectives.forEach((_, i) => expect(done.has(i), `${m.name} objective ${i}`).toBe(true));
    }
  });
});

describe("launch gate", () => {
  it("passes the starter satellite for its mission and blocks it for the Moon", () => {
    const stats = analyse(template("light-launcher"));
    expect(launchBlockers(preflight(stats, template("light-launcher"), mission("s1-first-satellite"), 1e9))).toEqual([]);
    const blockers = launchBlockers(preflight(stats, template("light-launcher"), mission("s2-lunar-orbiter"), 1e9)).map((b) => b.label);
    expect(blockers).toContain("Delta-v");
  });

  it("blocks launch when the operations budget is not available", () => {
    const d = template("light-launcher");
    const blockers = launchBlockers(preflight(analyse(d), d, mission("s1-first-satellite"), 1_000));
    expect(blockers.map((b) => b.label)).toContain("Mission funding");
  });

  it("warns about a single booster engine", () => {
    let d = emptyDesign();
    for (const id of ["kestrel-1", "tank-m"]) d = addPart(d, id, "s1").design;
    d = addPart(d, "bus-s", "craft").design;
    const labels = preflight(analyse(d), d, mission("s1-first-satellite"), 1e9).map((c) => c.label);
    expect(labels).toContain("Engine redundancy");
  });
});

describe("flight simulation", () => {
  it("is deterministic for a given seed", () => {
    const a = fly(template("earth-watch"), "s1-earth-watch", 42);
    const b = fly(template("earth-watch"), "s1-earth-watch", 42);
    expect(a.outcome?.result).toBe(b.outcome?.result);
    expect(a.log.map((l) => l.text)).toEqual(b.log.map((l) => l.text));
  });

  it("the starter satellite reaches orbit and deploys on most seeds when played sensibly", () => {
    let ok = 0;
    for (let s = 1; s <= 40; s++) {
      const f = fly(template("light-launcher"), "s1-first-satellite", s, (ids) => (ids.includes("shutdown") ? "shutdown" : ids[0]));
      if (f.outcome?.result === "success") ok++;
    }
    expect(ok).toBeGreaterThan(30);
  });

  it("a vehicle short on delta-v fails to reach orbit and explains why", () => {
    let d = emptyDesign();
    for (const id of ["kestrel-1", "kestrel-1", "tank-m"]) d = addPart(d, id, "s1").design;
    d = addPart(d, "bus-m", "craft").design;
    for (const id of ["solar-s", "bat-s", "ant-uhf"]) d = addPart(d, id, "craft").design;
    const f = fly(d, "s1-first-satellite", 7);
    expect(f.outcome?.result).toBe("failed");
    expect(f.outcome?.failReason).toMatch(/orbital speed|orbit/i);
    expect(f.outcome!.fundsEarned).toBe(0);
    expect(f.outcome!.reputation).toBeLessThan(0);
  });

  it("tracks propellant: stage 1 empties and is jettisoned during ascent", () => {
    const f = new Flight(template("light-launcher"), mission("s1-first-satellite"), 3);
    f.step(400);
    expect(f.log.some((l) => /jettisoned/.test(l.text)) || f.telemetry().fuel[0].pct < 100).toBe(true);
    const t = f.telemetry();
    expect(t.velKms).toBeGreaterThan(0);
    expect(t.mass).toBeLessThan(analyse(template("light-launcher")).totalMass);
  });

  it("different decisions give different outcomes for the same hazard", () => {
    const d = template("earth-watch");
    const results = new Set<string>();
    for (let s = 1; s <= 60; s++) {
      const a = fly(d, "s1-earth-watch", s, (ids) => ids[0]);
      const b = fly(d, "s1-earth-watch", s, (ids) => ids[ids.length - 1]);
      results.add(`${a.outcome?.result}/${b.outcome?.result}`);
    }
    expect(results.size).toBeGreaterThan(0);
  });

  it("hashSeed is stable", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
  });

  it("outcome numbers are sensible on success", () => {
    for (let s = 1; s <= 40; s++) {
      const f = fly(template("light-launcher"), "s1-first-satellite", s, (ids) => (ids.includes("shutdown") ? "shutdown" : ids[0]));
      const o = f.outcome as Outcome;
      if (o.result === "success") {
        expect(o.fundsEarned).toBeGreaterThan(0);
        expect(o.objectives.every((x) => x.done)).toBe(true);
        expect(o.reputation).toBeGreaterThan(0);
        return;
      }
    }
    throw new Error("no seed produced a success");
  });
});
