import { describe, expect, it } from "vitest";
import { analyse, type Design } from "../spacecraft/design";
import { TEMPLATES } from "../spacecraft/templates";
import { Flight } from "./flight";
import { MISSIONS } from "./missions";
import { replayFlight, validateReplay, type ReplayInput } from "./replay";
import { computeScore } from "./score";

const craft = (id = "light-launcher"): Design => structuredClone(TEMPLATES.find((t) => t.id === id)!.design);

/** Flies like the browser does: many small steps, deciding as the player or crew would. */
function flyLikeABrowser(design: Design, missionId: string, seed: number, opts: { plan?: { launcher?: string; orbit?: string }; pick?: (ids: string[], n: number) => string } = {}): Flight {
  const m = MISSIONS.find((x) => x.id === missionId)!;
  const f = new Flight(design, m, seed, { plan: opts.plan, difficulty: "engineer", solarActivity: 1.2 });
  let n = 0;
  for (let i = 0; i < 200_000 && (f.status === "running" || f.status === "decision"); i++) {
    if (f.status === "decision") {
      const ids = f.pending!.options.filter((o) => !o.disabled).map((o) => o.id);
      const id = opts.pick ? opts.pick(ids, n++) : ids[n++ % ids.length];
      f.decide(id, f.pending!.options.find((o) => o.id === id)?.manual ? (n % 5) / 4 : undefined);
    } else f.step(37 + (i % 11) * 13);
  }
  return f;
}

describe("replaying a flight on the server", () => {
  it("replays crew checks, manual skill and timeout consequences without changing the result", () => {
    for (const timeout of [false, true]) {
      const f = new Flight(craft(), MISSIONS.find((m) => m.id === "s1-first-satellite")!, 3, { crewEvents: true, difficulty: "cadet" });
      for (let i = 0; i < 5000 && !f.outcome; i++) {
        if (f.pending) {
          if (timeout) f.decideTimeout();
          else f.decide(f.pending.options.find((o) => !o.disabled)!.id, 0.8);
        } else f.step(600);
      }
      const input = validateReplay(f.replayInput());
      expect(input.ok).toBe(true);
      if (!input.ok) continue;
      const replay = replayFlight(input.value);
      expect(replay.ok).toBe(true);
      if (replay.ok) expect(replay.outcome).toEqual(f.outcome);
    }
  });
  it("reproduces the browser's outcome and score exactly, across many seeds and choices", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const missionId of ["s1-first-satellite", "s1-earth-watch"]) {
        const design = craft(missionId === "s1-first-satellite" ? "light-launcher" : "earth-watch");
        const f = flyLikeABrowser(design, missionId, seed, { pick: (ids, n) => ids[(seed + n) % ids.length] });
        const input = f.replayInput();
        const r = replayFlight(input);
        expect(r.ok, `${missionId} seed ${seed}: ${r.ok ? "" : r.reason}`).toBe(true);
        if (!r.ok) continue;
        const mine = computeScore(f.outcome!, MISSIONS.find((m) => m.id === missionId)!, "engineer");
        expect(r.outcome.result).toBe(f.outcome!.result);
        expect(r.score.total).toBe(mine.total);
        checked++;
      }
    }
    expect(checked).toBe(120);
  });

  it("also replays a flight on a catalogue launcher with a chosen orbit", () => {
    const f = flyLikeABrowser(craft(), "s1-first-satellite", 9, { plan: { launcher: "lv-medium-heavy", orbit: "sso" } });
    const r = replayFlight(f.replayInput());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.outcome.plan?.launcher).toMatch(/Medium-heavy/);
  });

  it("rejects a tampered flight instead of scoring it", () => {
    const f = flyLikeABrowser(craft(), "s1-first-satellite", 3);
    const good = f.replayInput();
    // An invented decision that the flight never raises is refused.
    expect(replayFlight({ ...good, decisions: [...good.decisions, { eventId: "made-up", option: "win" }] }).ok).toBe(false);
    // A spacecraft that can never launch is refused.
    const empty: ReplayInput = { ...good, design: { name: "x", parts: [{ partId: "bus-s", target: "craft" }] } };
    expect(replayFlight(empty).ok).toBe(false);
  });

  it("validates the shape of a submission and never throws", () => {
    const f = flyLikeABrowser(craft(), "s1-first-satellite", 4);
    expect(validateReplay(f.replayInput()).ok).toBe(true);
    for (const junk of [null, 5, "x", {}, { ...f.replayInput(), missionId: "nope" }, { ...f.replayInput(), seed: -1 }, { ...f.replayInput(), difficulty: "god" }, { ...f.replayInput(), design: { name: "a", parts: [{ partId: "lv-small-s1-tank", target: "s1" }] } }, { ...f.replayInput(), decisions: new Array(100).fill({ eventId: "a", option: "b" }) }]) {
      expect(validateReplay(junk).ok).toBe(false);
    }
    expect(analyse(craft()).deltaV).toBeGreaterThan(0);
  });
});
