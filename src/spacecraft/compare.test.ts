import { describe, expect, it } from "vitest";
import { compareDesigns } from "./compare";
import { analyse } from "./design";
import { TEMPLATES } from "./templates";

const [light, observer, lunar] = TEMPLATES.map((t) => ({ name: t.design.name, stats: analyse(t.design) }));

describe("compareDesigns", () => {
  it("is symmetric: swapping the designs swaps the winners", () => {
    const ab = compareDesigns(light, lunar);
    const ba = compareDesigns(lunar, light);
    const flip = { a: "b", b: "a", tie: "tie", none: "none" } as const;
    expect(ba.rows.map((r) => r.better)).toEqual(ab.rows.map((r) => flip[r.better]));
    expect(ba.rows.map((r) => [r.a, r.b])).toEqual(ab.rows.map((r) => [r.b, r.a]));
    expect(new Set(ba.summary)).toEqual(new Set(ab.summary));
  });

  it("marks lower cost and higher delta-v as better", () => {
    const { rows } = compareDesigns(light, lunar);
    expect(rows.find((r) => r.label === "Delta-v")!.better).toBe("b");
    expect(rows.find((r) => r.label === "Total cost")!.better).toBe("a");
    expect(rows.find((r) => r.label === "Total mass")!.better).toBe("none");
  });

  it("explains trade-offs in two to four sentences and names the designs", () => {
    const { summary } = compareDesigns(light, lunar);
    expect(summary.length).toBeGreaterThanOrEqual(2);
    expect(summary.length).toBeLessThanOrEqual(4);
    expect(summary[0]).toMatch(/Selene reaches [\d.]+ km\/s more delta-v but costs/);
  });

  it("calls identical designs a tie everywhere", () => {
    const { rows, summary } = compareDesigns(observer, { ...observer, name: "Copy" });
    expect(rows.every((r) => r.better === "tie" || r.better === "none")).toBe(true);
    expect(summary[0]).toMatch(/almost the same/);
  });
});
