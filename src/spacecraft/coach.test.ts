import { describe, expect, it } from "vitest";
import { MISSIONS } from "../missions/missions";
import { analyse, emptyDesign, missionChecks, type Design } from "./design";
import { nextBuildStep } from "./coach";

const m = (id: string) => MISSIONS.find((x) => x.id === id)!;
const d = (...ids: [string, "craft" | "s1" | "s2" | "s3"][]): Design => ({ ...emptyDesign(), parts: ids.map(([partId, target]) => ({ partId, target })) });
const step = (design: Design, mission = m("s1-first-satellite")) => nextBuildStep(design, analyse(design), mission, []);

describe("build coach", () => {
  it("walks an empty design through bus, engine, tank", () => {
    expect(step(d()).partId).toBe("bus-s");
    expect(step(d(["bus-s", "craft"])).id).toBe("engine1");
    expect(step(d(["bus-s", "craft"], ["kestrel-1", "s1"])).id).toBe("tank1");
  });

  it("never suggests a part that is locked or does not fit", () => {
    const full = d(["bus-s", "craft"], ["kestrel-1", "s1"], ["tank-m", "s1"], ["ant-uhf", "craft"], ["solar-s", "craft"], ["bat-s", "craft"], ["nav-star", "craft"]);
    const s = step(full, m("s3-mars-orbiter"));
    if (s.partId) expect(["ant-dish", "ant-hga"]).not.toContain(s.partId);
  });

  it.each(["s1-first-satellite", "s1-earth-watch"])("following the coach to the end gives a design that passes every check: %s", (id) => {
    const mission = m(id);
    let design = d();
    for (let i = 0; i < 30; i++) {
      const s = step(design, mission);
      if (s.done) break;
      expect(s.partId).not.toBeNull();
      design = { ...design, parts: [...design.parts, { partId: s.partId!, target: s.target }] };
    }
    expect(step(design, mission).done).toBe(true);
    expect(missionChecks(analyse(design), mission).every((c) => c.ok)).toBe(true);
  });
});
