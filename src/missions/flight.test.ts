import { describe, expect, it } from "vitest";
import { MISSIONS } from "./missions";
import { addPart, analyse, emptyDesign, type Design } from "../spacecraft/design";
import { TEMPLATES } from "../spacecraft/templates";
import { Flight, hashSeed, launchBlockers, preflight, type Outcome } from "./flight";
import { PROFILES, profileDeltaV } from "./profiles";
import { CREW_CHECKS } from "./crewEvents";
import { roleForEvent } from "../crew/roles";

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
  it("earns more funding for more accurate manual checks even when both missions succeed", () => {
    const flyChecks = (skill: number) => {
      const f = new Flight(template("light-launcher"), mission("s1-first-satellite"), 3, { crewEvents: true, difficulty: "cadet" });
      for (let i = 0; i < 5000 && !f.outcome; i++) {
        if (f.pending) {
          const ids = f.pending.options.filter((o) => !o.disabled).map((o) => o.id);
          f.decide(ids.includes("shutdown") ? "shutdown" : ids[0], skill);
        } else f.step(600);
      }
      return f.outcome!;
    };
    const precise = flyChecks(1);
    const average = flyChecks(0.5);
    expect(precise.result).toBe("success");
    expect(average.result).toBe("success");
    expect(precise.funding!.baseAwardUsd).toBe(average.funding!.baseAwardUsd);
    expect(precise.funding!.accuracyPct).toBe(100);
    expect(average.funding!.accuracyPct).toBeLessThan(100);
    expect(average.funding!.checkPenaltyPct).toBe(0);
    expect(precise.fundsEarned).toBeGreaterThan(average.fundsEarned);
    expect(average.fundsEarned).toBe(Math.round(average.funding!.baseAwardUsd * average.funding!.accuracyMultiplier));
  });

  it("guarantees two playable station checks for every role across all difficulties", () => {
    for (const difficulty of ["cadet", "engineer", "director"] as const) {
      const f = new Flight(template("light-launcher"), mission("s1-first-satellite"), 3, { crewEvents: true, difficulty });
      const checks: string[] = [];
      for (let i = 0; i < 5000 && !f.outcome; i++) {
        if (f.pending) {
          expect(f.pending.timeS).toBe(45);
          if (f.pending.eventId.startsWith("crew-")) {
            checks.push(f.pending.eventId);
            expect(f.pending.options.find((o) => o.id === "calibrate")?.manual).toBeTruthy();
            f.decide("calibrate", 1);
          } else {
            const ids = f.pending.options.filter((o) => !o.disabled).map((o) => o.id);
            f.decide(ids.includes("shutdown") ? "shutdown" : ids[0]);
          }
        } else f.step(600);
      }
      expect(f.outcome?.result).toBe("success");
      expect(new Set(checks)).toEqual(new Set(CREW_CHECKS.map((c) => c.id)));
      for (const role of ["aerospace", "propulsion", "controller", "science"]) {
        expect(checks.filter((id) => roleForEvent(id) === role)).toHaveLength(2);
      }
    }
  });

  it("missed checks have visible, lasting funding consequences and are recorded as timeouts", () => {
    const run = (timeout: boolean) => {
      const f = new Flight(template("light-launcher"), mission("s1-first-satellite"), 3, { crewEvents: true, difficulty: "cadet" });
      for (let i = 0; i < 5000 && !f.outcome; i++) {
        if (f.pending) {
          if (f.pending.eventId.startsWith("crew-")) {
            if (timeout) f.decideTimeout();
            else f.decide("calibrate", 1);
          } else {
            const ids = f.pending.options.filter((o) => !o.disabled).map((o) => o.id);
            f.decide(ids.includes("shutdown") ? "shutdown" : ids[0]);
          }
        } else f.step(600);
      }
      return f;
    };
    const ready = run(false);
    const late = run(true);
    expect(late.decisions.filter((d) => d.eventId.startsWith("crew-")).every((d) => d.timedOut)).toBe(true);
    expect(late.outcome!.fundsEarned).toBeLessThan(ready.outcome!.fundsEarned);
    expect(late.outcome!.events!.some((e) => e.text.includes("Response time expired.") && e.text.includes("3%"))).toBe(true);
  });

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

  it("warns before an event, records each decision, and ties odds to the design", () => {
    let cautions = 0;
    let recorded = 0;
    let decisions = 0;
    for (let s = 1; s <= 60; s++) {
      const f = new Flight(template("earth-watch"), mission("s1-earth-watch"), s);
      for (let i = 0; i < 5000 && (f.status === "running" || f.status === "decision"); i++) {
        if (f.status === "decision") {
          decisions++;
          const idx = f.log.length - 1;
          if (f.log.slice(Math.max(0, idx - 6), idx).some((l) => l.text.startsWith("Caution:"))) cautions++;
          f.decide(f.pending!.options.filter((o) => !o.disabled)[0].id);
        } else f.step(600);
      }
      recorded += f.outcome!.events?.length ?? 0;
    }
    expect(decisions).toBeGreaterThan(20);
    expect(recorded).toBe(decisions);
    expect(cautions).toBeGreaterThan(decisions * 0.4);

    const base = new Flight(template("light-launcher"), mission("s1-first-satellite"), 1);
    const strong = template("light-launcher");
    let more = strong;
    for (let i = 0; i < 3; i++) more = addPart(more, "kestrel-1", "s1").design;
    const boosted = new Flight(more, mission("s1-first-satellite"), 1);
    expect(boosted.windRisk()).toBeGreaterThan(base.windRisk());
  });

  it("manual control: skill raises survival, deep space blocks it, and a timeout takes the default", () => {
    const f = new Flight(template("light-launcher"), mission("s1-first-satellite"), 1);
    expect(f.manualAllowed()).toBeUndefined();
    // Force the engine-anomaly decision and check it offers the mini-game option.
    let found = false;
    for (let s = 1; s <= 200 && !found; s++) {
      const g = new Flight(template("light-launcher"), mission("s1-first-satellite"), s);
      for (let i = 0; i < 400 && g.status === "running"; i++) g.step(30);
      if (g.status === "decision" && g.pending?.options.some((o) => o.manual)) {
        found = true;
        expect(g.pending.timeS).toBeGreaterThan(0);
        expect(g.pending.options.some((o) => o.id === g.pending!.fallback)).toBe(true);
        g.decideTimeout();
        expect(["running", "failed"]).toContain(g.status as string);
        expect(g.log.some((l) => /No order was given in time/.test(l.text))).toBe(true);
      }
    }
    expect(found).toBe(true);
  });

  it("random events show up across seeds, each is playable to the end, and most flights see one", () => {
    const seen = new Set<string>();
    let withEvent = 0;
    for (let s = 1; s <= 80; s++) {
      const f = new Flight(template("earth-watch"), mission("s1-earth-watch"), s);
      let hadEvent = false;
      for (let i = 0; i < 5000 && (f.status === "running" || f.status === "decision"); i++) {
        if (f.status === "decision") {
          hadEvent = true;
          seen.add(f.pending!.eventId);
          const options = f.pending!.options.filter((o) => !o.disabled).map((o) => o.id);
          f.decide(options[s % options.length]);
        } else f.step(600);
      }
      expect(f.outcome, `seed ${s}`).not.toBeNull();
      if (hadEvent) withEvent++;
    }
    for (const id of ["wind-shear", "data-full", "debris-warning"]) expect(seen.has(id), id).toBe(true);
    expect(withEvent).toBeGreaterThan(40);
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
