import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MISSIONS } from "../missions/missions";
import { applyOutcome } from "../missions/results";
import type { Outcome } from "../missions/flight";
import type { FlightReport } from "./gameState";
import { newGameState } from "./gameState";
import { BUDGET_CATEGORIES, trySpend } from "../budget/budget";

const storage = new Map<string, string>();
const storageApi = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
};

const outcome = (): Outcome => ({
  result: "success", headline: "Mission accomplished", objectives: [], scienceScore: 0, scienceApplicable: false,
  dvDelivered: 9400, dvBudget: 9400, dvMarginPct: 10, propellantLeftPct: 10,
  fundsEarned: 100, reputation: 2, researchPoints: 5, experience: 100, lessons: [],
});

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal("localStorage", storageApi);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("persistent player progression", () => {
  it("restores previously earned funding into category budgets without crediting the balance twice", async () => {
    const old = newGameState("single");
    old.funds = trySpend(old.funds, old.allocation, "operations", 200).funds + 100;
    const saved: Record<string, unknown> = { ...old };
    delete saved.fundingEarned;
    storage.set("aurelia.save.v1", JSON.stringify(saved));
    const { store } = await import("./store");
    const game = store.get().game!;
    expect(game.funds).toBe(old.funds);
    expect(game.fundingEarned).toBe(100);
    const planned = BUDGET_CATEGORIES.reduce((sum, c) => sum + game.allocation[c.id].planned, 0);
    expect(planned - 200).toBe(game.funds);
  });

  it("saves XP and awards, restores them after reload, and dismisses reward popups permanently", async () => {
    const { store } = await import("./store");
    store.startNewGame("single", 4, "aerospace");
    expect(store.get().game!.season).toBe(1);
    store.updateGame((g) => {
      g.flights = 1;
      applyOutcome(g, MISSIONS[0], "Test", 3, outcome(), []);
    });
    expect(store.get().player.experience).toBe(100);
    expect(store.get().player.pendingRewards).toHaveLength(1);
    vi.resetModules();
    const reloaded = (await import("./store")).store;
    expect(reloaded.get().player.badges).toContain("Level 2 promotion badge");
    expect(reloaded.get().player.pendingRewards).toHaveLength(1);
    reloaded.dismissRewards();
    vi.resetModules();
    expect((await import("./store")).store.get().player.pendingRewards).toHaveLength(0);
  });

  it("deduplicates co-op rewards across room updates and clears solo and multiplayer XP on reset", async () => {
    const { store } = await import("./store");
    store.startNewGame("single");
    const report: FlightReport = { missionId: MISSIONS[0].id, craftName: "Test", seed: 3, year: 1, outcome: outcome(), log: [] };
    store.awardMultiplayerFlight("TEST", 1, report, ["First launch"], false);
    store.awardMultiplayerFlight("TEST", 1, report, ["First launch"], false);
    expect(store.get().player.experience).toBe(100);
    expect(store.get().player.pendingRewards).toHaveLength(1);
    expect(store.clearProgress()).toBe(true);
    vi.resetModules();
    const reset = (await import("./store")).store;
    expect(reset.get().game).toBeNull();
    expect(reset.get().player).toMatchObject({ experience: 0, badges: [], receipts: [], pendingRewards: [] });
    reset.startNewGame("single", 4);
    expect(reset.get().game!.season).toBe(1);
    expect(reset.get().player.experience).toBe(0);
  });
});
