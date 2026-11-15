import { describe, expect, it } from "vitest";
import { markerAt, roundScore, ROUNDS, zoneFor } from "./minigameLogic";

describe("manual-control mini-game", () => {
  it("scores a hit, a near miss and a miss", () => {
    const zone = { start: 0.4, width: 0.2 };
    expect(roundScore(0.5, zone)).toBe(1);
    expect(roundScore(0.59, zone)).toBe(1);
    expect(roundScore(0.68, zone)).toBe(0.5);
    expect(roundScore(0.95, zone)).toBe(0);
  });

  it("sweeps the marker back and forth between 0 and 1 and gets faster each round", () => {
    for (let ms = 0; ms < 10_000; ms += 137) {
      const p = markerAt(ms, 0);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(markerAt(1_000, 0)).toBeCloseTo(0.7, 5);
    expect(markerAt(1_000, 2)).toBeCloseTo(0.6, 5);
  });

  it("keeps every zone on the track and shrinks it each round", () => {
    let last = 1;
    for (let r = 0; r < ROUNDS; r++) {
      for (const rnd of [0, 0.5, 0.999]) {
        const z = zoneFor(r, () => rnd);
        expect(z.start).toBeGreaterThanOrEqual(0);
        expect(z.start + z.width).toBeLessThanOrEqual(1);
      }
      const w = zoneFor(r, () => 0.5).width;
      expect(w).toBeLessThan(last);
      last = w;
    }
  });
});
