import { describe, expect, it } from "vitest";
import { addFunding, BUDGET_CATEGORIES, defaultAllocation, trySpend } from "./budget";

describe("agency budget accounting", () => {
  it("spends build and mission costs, then reinvests funding without losing money to rounding", () => {
    const ledger = defaultAllocation(1000);
    let funds = trySpend(1000, ledger, "spacecraft", 50).funds;
    funds = trySpend(funds, ledger, "operations", 100).funds;
    expect(funds).toBe(850);
    for (const amount of [1, 10, 101]) funds = addFunding(funds, ledger, amount);
    const planned = BUDGET_CATEGORIES.reduce((sum, c) => sum + ledger[c.id].planned, 0);
    const spent = BUDGET_CATEGORIES.reduce((sum, c) => sum + ledger[c.id].spent, 0);
    expect(funds).toBe(962);
    expect(planned).toBe(1112);
    expect(spent).toBe(150);
    expect(planned - spent).toBe(funds);
    expect(ledger.spacecraft.spent).toBe(50);
    expect(ledger.operations.spent).toBe(100);
  });
});
