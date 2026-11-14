import { describe, expect, it } from "vitest";
import { MISSIONS } from "../missions/missions";
import { addPart, analyse, emptyDesign, missionChecks, removePartAt } from "./design";
import { TEMPLATES } from "./templates";

describe("spacecraft design", () => {
  it("starter templates satisfy their target missions", () => {
    for (const t of TEMPLATES) {
      const stats = analyse(t.design);
      const mission = MISSIONS.find((m) => m.id === t.missionId)!;
      expect(stats.errors, t.name).toEqual([]);
      const failed = missionChecks(stats, mission).filter((c) => !c.ok);
      expect(failed, `${t.name}: ${failed.map((f) => f.label).join(", ")}`).toEqual([]);
    }
  });

  it("adding a fuel tank raises propellant, mass and delta-v", () => {
    let d = { ...emptyDesign() };
    for (const id of ["kestrel-1", "kestrel-1", "tank-m"]) d = addPart(d, id, "s1").design;
    d = addPart(d, "bus-s", "craft").design;
    const before = analyse(d);
    d = addPart(d, "tank-l", "s1").design;
    const after = analyse(d);
    expect(after.propellant).toBeGreaterThan(before.propellant);
    expect(after.totalMass).toBeGreaterThan(before.totalMass);
    expect(after.deltaV).toBeGreaterThan(before.deltaV);
  });

  it("a heavier payload lowers delta-v", () => {
    let d = emptyDesign();
    for (const id of ["kestrel-1", "tank-m"]) d = addPart(d, id, "s1").design;
    d = addPart(d, "bus-m", "craft").design;
    const light = analyse(d);
    d = addPart(d, "sci-cam", "craft").design;
    expect(analyse(d).deltaV).toBeLessThan(light.deltaV);
    expect(analyse(d).payloadMass).toBeGreaterThan(light.payloadMass);
  });

  it("refuses lift-off when thrust-to-weight is 1 or less", () => {
    let d = emptyDesign();
    for (const id of ["kestrel-1", "tank-l"]) d = addPart(d, id, "s1").design;
    d = addPart(d, "bus-s", "craft").design;
    const s = analyse(d);
    expect(s.liftoffTwr).toBeLessThan(1);
    expect(s.errors.some((e) => e.includes("thrust-to-weight"))).toBe(true);
  });

  it("enforces bus slots and requires a bus for payload parts", () => {
    let d = emptyDesign();
    expect(addPart(d, "solar-s", "craft").ok).toBe(false);
    d = addPart(d, "bus-s", "craft").design;
    for (const id of ["solar-s", "bat-s", "ant-uhf", "sci-cam"]) d = addPart(d, id, "craft").design;
    expect(addPart(d, "nav-star", "craft").ok).toBe(false);
  });

  it("removing the bus removes everything mounted on it", () => {
    let d = emptyDesign();
    d = addPart(d, "bus-s", "craft").design;
    d = addPart(d, "solar-s", "craft").design;
    expect(removePartAt(d, 0).parts).toHaveLength(0);
  });

  it("sums cost and splits it across budget categories", () => {
    let d = emptyDesign();
    for (const id of ["kestrel-1", "tank-s"]) d = addPart(d, id, "s1").design;
    d = addPart(d, "bus-s", "craft").design;
    d = addPart(d, "sci-cam", "craft").design;
    const s = analyse(d);
    expect(s.cost).toBe(52e6 + 4e6 + 3e6 + 14e6);
    expect(s.costByCategory.propulsion).toBe(52e6);
    expect(s.costByCategory.instruments).toBe(14e6);
    expect(s.costByCategory.spacecraft).toBe(7e6);
  });

  it("flags power shortfalls", () => {
    let d = emptyDesign();
    d = addPart(d, "bus-s", "craft").design;
    for (const id of ["sci-cam", "ant-uhf"]) d = addPart(d, id, "craft").design;
    expect(analyse(d).powerOk).toBe(false);
    d = addPart(d, "solar-s", "craft").design;
    d = addPart(d, "bat-s", "craft").design;
    expect(analyse(d).powerOk).toBe(true);
  });
});
