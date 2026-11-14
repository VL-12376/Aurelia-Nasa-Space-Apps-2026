export const ANNUAL_BUDGET_USD = 25_000_000_000;

export type BudgetCategoryId =
  | "spacecraft"
  | "propulsion"
  | "instruments"
  | "research"
  | "testing"
  | "operations"
  | "repairs";

export interface BudgetCategory {
  id: BudgetCategoryId;
  label: string;
  /** Default share of the annual budget (shares sum to 1). */
  share: number;
}

export const BUDGET_CATEGORIES: readonly BudgetCategory[] = [
  { id: "spacecraft", label: "Spacecraft development", share: 0.25 },
  { id: "propulsion", label: "Propulsion systems", share: 0.15 },
  { id: "instruments", label: "Scientific instruments", share: 0.12 },
  { id: "research", label: "Research & development", share: 0.18 },
  { id: "testing", label: "Testing & simulations", share: 0.08 },
  { id: "operations", label: "Mission operations", share: 0.15 },
  { id: "repairs", label: "Repairs & replacements", share: 0.07 },
];

export interface CategoryLedger {
  planned: number;
  spent: number;
}

export type Allocation = Record<BudgetCategoryId, CategoryLedger>;

export function defaultAllocation(annual = ANNUAL_BUDGET_USD): Allocation {
  const out = {} as Allocation;
  for (const c of BUDGET_CATEGORIES) {
    out[c.id] = { planned: Math.round(annual * c.share), spent: 0 };
  }
  return out;
}

export function formatUsd(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e10 ? 1 : 2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Spends from a category. Returns false (and changes nothing) if funds are short. */
export function trySpend(
  funds: number,
  allocation: Allocation,
  category: BudgetCategoryId,
  amount: number,
): { ok: boolean; funds: number } {
  if (amount < 0 || amount > funds) return { ok: false, funds };
  allocation[category].spent += amount;
  return { ok: true, funds: funds - amount };
}
