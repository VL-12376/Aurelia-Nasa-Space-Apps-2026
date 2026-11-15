import { describe, expect, it } from "vitest";
import { createCalloutTracker, gLoad, LAUNCH_POLL, SHARED_LAUNCH_MS, sharedLaunchStage, type AscentSample } from "./launchSequence";

const s = (o: Partial<AscentSample>): AscentSample => ({ view: "ascent", burning: true, altKm: 0, velKms: 0, stagesActive: 2, ...o });

describe("launch sequence", () => {
  it("holds shared flights through each station poll and the full ten-second count", () => {
    expect(sharedLaunchStage(0)).toEqual({ pollIndex: 0, countdown: null });
    expect(sharedLaunchStage(5_000)).toEqual({ pollIndex: 1, countdown: null });
    expect(sharedLaunchStage(15_000)).toEqual({ pollIndex: 3, countdown: null });
    expect(sharedLaunchStage(20_000)).toEqual({ pollIndex: 4, countdown: null });
    expect(sharedLaunchStage(23_000)).toEqual({ pollIndex: 4, countdown: 10 });
    expect(sharedLaunchStage(SHARED_LAUNCH_MS - 1)).toEqual({ pollIndex: 4, countdown: 1 });
    expect(sharedLaunchStage(SHARED_LAUNCH_MS)).toBeNull();
  });
  it("polls every role and ends with the flight director", () => {
    expect(new Set(LAUNCH_POLL.map((p) => p.role)).size).toBe(4);
    expect(LAUNCH_POLL[LAUNCH_POLL.length - 1].role).toBe("controller");
  });

  it("reports each milestone once and in order, with Max Q after the pressure peak", () => {
    const track = createCalloutTracker();
    const seen: string[] = [];
    // Climb with the speed rising and the air thinning, like a real ascent.
    for (let i = 0; i <= 300; i++) {
      const alt = i * 0.1;
      const vel = 0.012 * i * 1.2;
      const stages = i > 270 ? 1 : 2;
      track(s({ altKm: alt, velKms: vel, stagesActive: stages })).forEach((c) => seen.push(c.id));
    }
    track(s({ view: "earth-orbit", burning: false, altKm: 300, velKms: 7.7 })).forEach((c) => seen.push(c.id));
    expect(seen).toEqual(["liftoff", "tower-clear", "mach-1", "max-q", "stage-sep", "orbit"]);
    expect(track(s({ view: "earth-orbit", burning: false })).length).toBe(0);
  });

  it("gives about 1 g sitting still and more under thrust, capped", () => {
    expect(gLoad(0, 1)).toBeCloseTo(1, 5);
    expect(gLoad(0.0294, 1)).toBeCloseTo(4, 1);
    expect(gLoad(10, 1)).toBe(6);
  });
});
