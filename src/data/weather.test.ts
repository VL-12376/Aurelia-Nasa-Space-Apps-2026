import { describe, expect, it } from "vitest";
import { ACTIVITY_NEUTRAL, activityFromFlares, buildWeather, countEvents, describeActivity, describeFlare, flareFlux, flareIndex, flaresFromRecords, maxKpFromGst } from "./weather";

// Trimmed from real open space-weather responses, October 2026.
const FLR = [
  { flrID: "2026-10-16T15:38:00-FLR-001", beginTime: "2026-10-16T15:38Z", peakTime: "2026-10-16T15:42Z", endTime: "2026-10-16T15:45Z", classType: "M1.3", sourceLocation: "S16W15", activeRegionNum: 14551 },
  { flrID: "2026-10-19T08:54:00-FLR-001", beginTime: "2026-10-19T08:54Z", peakTime: "2026-10-19T09:03Z", classType: "M1.6", activeRegionNum: 14551 },
  { flrID: "2026-10-23T03:43:00-FLR-001", beginTime: "2026-10-23T03:43Z", peakTime: "2026-10-23T03:55Z", classType: "C1.3", activeRegionNum: 14557 },
  { flrID: "2026-10-26T08:21:00-FLR-001", beginTime: "2026-10-26T08:21Z", peakTime: "2026-10-26T08:38Z", classType: "C1.9", activeRegionNum: 14561 },
  { flrID: "2026-10-27T01:00:00-FLR-001", beginTime: "2026-10-27T01:00Z", classType: "C2.0", activeRegionNum: null },
  { flrID: "2026-10-28T01:00:00-FLR-001", beginTime: "2026-10-28T01:00Z", peakTime: "2026-10-28T01:10Z", classType: "C4.4", activeRegionNum: 14561 },
  { flrID: "2026-10-29T01:00:00-FLR-001", beginTime: "2026-10-29T01:00Z", peakTime: "2026-10-29T01:10Z", classType: "B9.0" },
];
const GST = [{ gstID: "2026-10-31T18:00:00-GST-001", startTime: "2026-10-31T18:00Z", allKpIndex: [{ kpIndex: 5.0 }, { kpIndex: 6.0, observedTime: "2026-10-31T21:00Z", source: "observatory" }] }];

describe("open space weather records", () => {
  it("turns an X-ray flare class into a flux, with X above M above C", () => {
    expect(flareFlux("M1.3")).toBeCloseTo(13);
    expect(flareFlux("x2.0")).toBeCloseTo(200);
    expect(flareFlux("C9.9")).toBeLessThan(flareFlux("M1.0")!);
    expect(flareFlux("M9.9")).toBeLessThan(flareFlux("X1.0")!);
    expect(flareFlux("hello")).toBeNull();
    expect(flareIndex(["M1.0", "C5.0", "nonsense"])).toBeCloseTo(15);
  });

  it("keeps the activity factor between 0.5 and 2.0 and raises it with stronger flares", () => {
    expect(activityFromFlares([])).toBe(0.5);
    expect(activityFromFlares(["C1.0"])).toBeGreaterThan(0.5);
    expect(activityFromFlares(["C5.0", "C5.0"])).toBeLessThan(activityFromFlares(["M5.0"]));
    expect(activityFromFlares(["M5.0"])).toBeLessThan(activityFromFlares(["X5.0"]));
    expect(activityFromFlares(Array(30).fill("X9.0"))).toBe(2);
    expect(describeActivity(0.5).label).toBe("Quiet");
    expect(describeActivity(2).label).toBe("Stormy");
  });

  it("lists flares newest first and falls back to the begin time when there is no peak", () => {
    const f = flaresFromRecords(FLR);
    expect(f).toHaveLength(7);
    expect(f[0]).toEqual({ classType: "B9.0", peakTime: "2026-10-29T01:10Z" });
    expect(f.at(-1)).toEqual({ classType: "M1.3", peakTime: "2026-10-16T15:42Z", activeRegion: 14551 });
    expect(f.find((x) => x.classType === "C2.0")?.peakTime).toBe("2026-10-27T01:00Z");
    expect(flaresFromRecords({ error: "x" })).toEqual([]);
  });

  it("reads the highest Kp index and counts events", () => {
    expect(maxKpFromGst(GST)).toBe(6);
    expect(maxKpFromGst([])).toBeUndefined();
    expect(countEvents([{}, {}])).toBe(2);
    expect(countEvents({ nope: true })).toBeNull();
  });

  it("describes a flare in one line", () => {
    expect(describeFlare({ classType: "M1.3", peakTime: "2026-10-16T15:42Z", activeRegion: 14551 })).toBe("M1.3 flare, 16 Oct 2026 15:42 UTC");
    expect(describeFlare({ classType: "C1.0", peakTime: "odd" })).toBe("C1.0 flare, odd");
  });

  it("builds the payload from every source", () => {
    const w = buildWeather({ flr: FLR, cme: [{}, {}, {}], sep: [], gst: GST })!;
    expect(w.flares).toHaveLength(5);
    expect(w.flares[0].classType).toBe("B9.0");
    expect(w.flareCount30d).toBe(7);
    expect(w.cmeCount30d).toBe(3);
    expect(w.sepCount30d).toBe(0);
    expect(w.geomagneticMaxKp).toBe(6);
    expect(w.activity).toBeGreaterThan(0.5);
    expect(w.activity).toBeLessThan(2);
  });

  it("still gives partial data when sources fail, and nothing when all of them do", () => {
    const w = buildWeather({ flr: null, cme: [{}], sep: null, gst: null })!;
    expect(w.flares).toEqual([]);
    expect(w.flareCount30d).toBeNull();
    expect(w.sepCount30d).toBeNull();
    expect(w.cmeCount30d).toBe(1);
    expect(w.activity).toBe(ACTIVITY_NEUTRAL);
    expect("geomagneticMaxKp" in w).toBe(false);
    expect(buildWeather({ flr: null, cme: null, sep: null, gst: null })).toBeNull();
  });
});
