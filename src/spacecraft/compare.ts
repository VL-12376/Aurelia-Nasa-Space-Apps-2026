import { formatUsd } from "../budget/budget";
import type { Stats } from "./design";

export type Better = "a" | "b" | "tie" | "none";

export interface CompareRow {
  label: string;
  a: string;
  b: string;
  better: Better;
  note?: string;
}

export interface Comparison {
  rows: CompareRow[];
  summary: string[];
}

interface Side {
  name: string;
  stats: Stats;
}

const fmtMass = (kg: number) => (kg >= 10_000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg).toLocaleString("en-US")} kg`);
const fmtThrust = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} MN` : `${Math.round(n / 1000).toLocaleString("en-US")} kN`);
const fmtDv = (v: number) => `${(v / 1000).toFixed(2)} km/s`;
const fmtPower = (w: number) => (w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`);
const fmtBattery = (wh: number) => `${(wh / 1000).toFixed(1)} kWh`;
const fmtRange = (mkm: number) => (mkm > 0 ? `${mkm.toLocaleString("en-US")} M km` : "None");

/** Differences under 1% count as a tie, so rounding noise never crowns a winner. */
function pick(a: number, b: number, higherIsBetter: boolean): Better {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0 || Math.abs(a - b) / scale < 0.01) return "tie";
  return (a > b) === higherIsBetter ? "a" : "b";
}

export function compareDesigns(a: Side, b: Side): Comparison {
  const sa = a.stats;
  const sb = b.stats;
  const row = (label: string, va: number, vb: number, fmt: (n: number) => string, higherIsBetter: boolean | null, note?: string): CompareRow => ({
    label,
    a: fmt(va),
    b: fmt(vb),
    better: higherIsBetter === null ? "none" : pick(va, vb, higherIsBetter),
    ...(note ? { note } : {}),
  });

  const rows: CompareRow[] = [
    row("Total mass", sa.totalMass, sb.totalMass, fmtMass, null, "Lighter is cheaper to launch, but heavier often means more fuel"),
    row("Lift-off thrust", sa.thrustSl, sb.thrustSl, fmtThrust, true),
    row("Lift-off thrust-to-weight", sa.liftoffTwr, sb.liftoffTwr, (n) => n.toFixed(2), true, "Must be above 1 to leave the pad"),
    row("Delta-v", sa.deltaV, sb.deltaV, fmtDv, true),
    row("Payload mass", sa.payloadMass, sb.payloadMass, fmtMass, true),
    row("Power generation", sa.powerGen, sb.powerGen, fmtPower, true),
    row("Battery", sa.batteryWh, sb.batteryWh, fmtBattery, true),
    row("Radio range", sa.commRangeMkm, sb.commRangeMkm, fmtRange, true),
    row("Total cost", sa.cost, sb.cost, formatUsd, false, "Lower is better"),
  ];

  return { rows, summary: summarise(a, b) };
}

function summarise(a: Side, b: Side): string[] {
  const nameA = a.name.trim();
  const nameB = b.name.trim();
  const generic = nameA === nameB || !nameA || !nameB;
  const label = (side: "a" | "b") => (generic ? (side === "a" ? "Design A" : "Design B") : side === "a" ? nameA : nameB);
  const stats = { a: a.stats, b: b.stats };
  const out: string[] = [];

  const dvWinner = pick(stats.a.deltaV, stats.b.deltaV, true);
  if (dvWinner === "a" || dvWinner === "b") {
    const lo = dvWinner === "a" ? "b" : "a";
    const dv = (stats[dvWinner].deltaV - stats[lo].deltaV) / 1000;
    const dCost = stats[dvWinner].cost - stats[lo].cost;
    const cost =
      Math.abs(dCost) < 1
        ? "at about the same cost"
        : dCost > 0
          ? `but costs ${formatUsd(dCost)} more`
          : `and costs ${formatUsd(-dCost)} less, so look at what ${label(lo)} offers in return`;
    out.push(`${label(dvWinner)} reaches ${dv.toFixed(2)} km/s more delta-v ${cost}.`);
  } else {
    const costWinner = pick(stats.a.cost, stats.b.cost, false);
    if (costWinner === "a" || costWinner === "b") {
      const hi = costWinner === "a" ? "b" : "a";
      out.push(`Both reach a similar delta-v, but ${label(costWinner)} costs ${formatUsd(stats[hi].cost - stats[costWinner].cost)} less.`);
    } else out.push("The two designs have almost the same delta-v and cost.");
  }

  const payloadWinner = pick(stats.a.payloadMass, stats.b.payloadMass, true);
  if (payloadWinner === "a" || payloadWinner === "b") {
    const lo = payloadWinner === "a" ? "b" : "a";
    const extra = stats[payloadWinner].payloadMass - stats[lo].payloadMass;
    const lacks: string[] = [];
    if (pick(stats[payloadWinner].powerGen, stats[lo].powerGen, true) === "b") lacks.push("less power");
    if (pick(stats[payloadWinner].commRangeMkm, stats[lo].commRangeMkm, true) === "b") lacks.push("a shorter radio range");
    const tail = lacks.length ? `, with ${lacks.join(" and ")} than ${label(lo)}` : ", which can mean more instruments or a larger bus";
    out.push(`${label(payloadWinner)} carries ${fmtMass(extra)} more spacecraft mass${tail}.`);
  }

  const twrWinner = pick(stats.a.liftoffTwr, stats.b.liftoffTwr, true);
  if (twrWinner === "a" || twrWinner === "b") {
    const lo = twrWinner === "a" ? "b" : "a";
    out.push(
      `${label(twrWinner)} lifts off with thrust-to-weight ${stats[twrWinner].liftoffTwr.toFixed(2)} against ${stats[lo].liftoffTwr.toFixed(2)}: a stronger lift-off wastes less delta-v fighting gravity, but it needs more engine thrust.`,
    );
  }

  out.push("Neither design is best everywhere: the right choice depends on what the mission demands and what the budget allows.");
  return out.slice(0, 4);
}
