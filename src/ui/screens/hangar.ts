import { fill, h, toast } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { BUDGET_CATEGORIES, formatUsd, trySpend, type BudgetCategoryId } from "../../budget/budget";
import { MISSIONS, missionsForSeason } from "../../missions/missions";
import { TECHS } from "../../research/tech";
import { HangarScene } from "../../scene/hangar";
import {
  STAGE_TARGETS, TARGET_LABEL, addPart, analyse, emptyDesign, isUnlocked, missionChecks, part, partsIn, removePartAt,
  type Design, type Stats, type Target,
} from "../../spacecraft/design";
import { CATEGORIES, PART_BY_ID, partsInCategory, type Part, type PartCategory } from "../../spacecraft/parts";
import { CATEGORY_LORE, GLOSSARY, PART_NOTES, derived } from "../../spacecraft/explain";
import { advise, unstagedDeltaV, workedExample } from "../../spacecraft/advisor";
import { TEMPLATES } from "../../spacecraft/templates";
import { gameShell } from "../layout";
import { session } from "../session";
import { aiContribute } from "../../crew/ai";
import { ROLES, ROLE_BY_ID, roleForPart, type RoleChoice, type RoleId } from "../../crew/roles";
import { mp } from "../../net/session";
import { avatar, chatDock } from "../crew";

const fmtMass = (kg: number) => (kg >= 10_000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg).toLocaleString("en-US")} kg`);
const fmtThrust = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} MN` : `${Math.round(n / 1000).toLocaleString("en-US")} kN`);
const fmtDv = (v: number) => `${(v / 1000).toFixed(2)} km/s`;
const fmtPower = (w: number) => (w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`);

function icon(path: string, size = 22): HTMLElement {
  const span = h("span", { class: "ico" });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  return span;
}

function keyStat(p: Part): string {
  switch (p.category) {
    case "structure": return `${p.capacity} slots`;
    case "tank": return `${fmtMass(p.propellant)} propellant`;
    case "engine": return `${fmtThrust(p.thrustVac)} · Isp ${p.ispVac} s`;
    case "solar": return fmtPower(p.watts);
    case "battery": return `${(p.wh / 1000).toFixed(1)} kWh`;
    case "antenna": return `Range ${p.rangeMkm} M km`;
    case "science": return `${p.draw} W`;
    case "systems": return p.capability.replace("-", " ");
  }
}

function details(p: Part): [string, string][] {
  const rows: [string, string][] = [["Mass", fmtMass(p.mass)], ["Cost", formatUsd(p.cost)]];
  switch (p.category) {
    case "structure": rows.push(["Diameter", `${p.size} m`], ["Component slots", String(p.capacity)]); break;
    case "tank": rows.push(["Propellant", fmtMass(p.propellant)], ["Diameter", `${p.diameter} m`], ["Fuel fraction", `${Math.round((p.propellant / (p.propellant + p.mass)) * 100)}%`]); break;
    case "engine":
      rows.push(["Thrust (vacuum)", fmtThrust(p.thrustVac)], ["Thrust (sea level)", p.thrustSl ? fmtThrust(p.thrustSl) : "Cannot lift off"], ["Isp (vacuum)", `${p.ispVac} s`]);
      if (p.ispSl) rows.push(["Isp (sea level)", `${p.ispSl} s`]);
      break;
    case "solar": rows.push(["Power", fmtPower(p.watts)]); break;
    case "battery": rows.push(["Storage", `${(p.wh / 1000).toFixed(1)} kWh`]); break;
    case "antenna": rows.push(["Link range", `${p.rangeMkm} million km`], ["Power draw", `${p.draw} W`]); break;
    case "science": rows.push(["Power draw", `${p.draw} W`]); break;
    case "systems": rows.push(["Provides", p.capability.replace("-", " ")], ["Power draw", `${p.draw} W`]); break;
  }
  return rows;
}

const techName = (id: string | null) => TECHS.find((t) => t.id === id)?.name ?? id ?? "";

export function hangarScreen(): HTMLElement {
  const remote = mp.active;
  const first = remote ? mp.room!.game : store.get().game;
  if (!first) return gameShell("hangar", h("div", { class: "notice" }, "No active game. Start a new campaign from the main menu."));
  const game = () => (remote ? mp.room!.game : store.get().game!);
  const role: RoleChoice | null = remote ? mp.role : first.role;
  /** Whether this player may act for a role: their own, or an AI-run one if they are the host (the server applies the same rule). */
  const acts = (owner: RoleId): boolean => (remote ? mp.role === owner || (!mp.room!.players.some((p) => p.role === owner) && mp.isHost) : role === null || role === "all" || role === owner);
  const owns = (p: Part) => acts(roleForPart(p));
  const ownerLine = (p: Part): string => {
    const owner = ROLE_BY_ID[roleForPart(p)];
    if (remote) {
      const holder = mp.room!.players.find((x) => x.role === owner.id);
      return holder ? `${p.name} belongs to the ${owner.title}, played by ${holder.name}.` : `${p.name} belongs to the ${owner.title}. Ask the AI crew to handle it.`;
    }
    return `${p.name} is ${owner.name}'s area. Ask ${owner.name.split(" ").slice(-1)[0]} to contribute, or play all four roles.`;
  };
  /** Returns a reason if any part this change adds or removes belongs to a role the player cannot act for. */
  const forbidden = (next: Design): string | null => {
    const count = (d: Design) => {
      const m = new Map<string, number>();
      for (const r of d.parts) m.set(r.partId, (m.get(r.partId) ?? 0) + 1);
      return m;
    };
    const a = count(design);
    const b = count(next);
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      if ((a.get(id) ?? 0) !== (b.get(id) ?? 0) && !owns(PART_BY_ID[id])) return ownerLine(PART_BY_ID[id]);
    }
    return null;
  };

  let design: Design = structuredClone(remote ? mp.room!.design : first.draft);
  let target: Target = "s1";
  let category: PartCategory = "tank";
  let selected: number | null = null;
  /** A catalogue part opened with the (i) button, shown without adding it. */
  let preview: Part | null = null;
  let missionId: string = (remote ? mp.room!.missionId : null) ?? missionsForSeason(first.season).find((m) => m.id === session.selectedMissionId)?.id ?? missionsForSeason(first.season)[0]?.id ?? MISSIONS[0].id;
  const undo: string[] = [];
  let stats: Stats = analyse(design);

  /* ----- scene ----- */
  const view = h("div", { class: "h-view" });
  const scene = new HangarScene(view, {
    onPick: (idx) => {
      selected = idx;
      if (idx !== null) {
        const r = design.parts[idx];
        target = r.target;
        category = part(r).category;
        renderPalette();
        renderStages();
      }
      renderCard();
    },
  });
  scene.setDesign(design);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__hangar = scene;
  const keyHandler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected !== null) removeAt(selected);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      doUndo();
    }
  };
  window.addEventListener("keydown", keyHandler);
  router.onLeave(() => {
    window.removeEventListener("keydown", keyHandler);
    scene.dispose();
  });

  /* ----- state changes ----- */
  function commit(next: Design, newIndex?: number, free = false): boolean {
    if (remote || !free) {
      const why = forbidden(next);
      if (why) {
        toast(why);
        return false;
      }
    }
    undo.push(JSON.stringify(design));
    if (undo.length > 60) undo.shift();
    apply(next, newIndex);
    return true;
  }

  function persist(): void {
    if (remote) mp.send({ t: "design", design });
    else
      store.updateGame((g) => {
        g.draft = design;
      });
  }

  function apply(next: Design, newIndex?: number): void {
    design = next;
    persist();
    stats = analyse(design);
    scene.setDesign(design, newIndex);
    if (selected !== null && selected >= design.parts.length) selected = null;
    renderAll();
  }

  function doUndo(): void {
    const prev = undo[undo.length - 1];
    if (!prev) return toast("Nothing to undo.");
    const why = forbidden(JSON.parse(prev) as Design);
    if (why && (remote || role !== "all")) return toast(why);
    undo.pop();
    selected = null;
    apply(JSON.parse(prev) as Design);
  }

  function add(partId: string): void {
    const p = PART_BY_ID[partId];
    if (!isUnlocked(p, game().researchedTech)) return toast(`Locked. Research ${techName(p.tech)} first.`);
    if (!owns(p)) return toast(ownerLine(p));
    const res = addPart(design, partId, target);
    if (!res.ok) return toast(res.reason ?? "Cannot add that part.");
    if (res.target) target = res.target;
    // The bus replaces itself, so the new part's index is wherever it landed.
    const idx = res.design.parts.length - 1;
    selected = idx;
    if (commit(res.design, idx)) scene.select(idx);
  }

  function removeAt(index: number): void {
    const next = removePartAt(design, index);
    if (!remote && !owns(part(design.parts[index]))) return toast(ownerLine(part(design.parts[index])));
    selected = null;
    scene.select(null);
    commit(next);
  }

  /* ----- palette ----- */
  const rail = h("div", { class: "h-rail", role: "tablist", "aria-label": "Part categories" });
  const paletteTitle = h("div", { class: "h-pal-title" });
  const paletteGrid = h("div", { class: "h-pal-grid" });
  const palette = h("div", { class: "h-palette" }, paletteTitle, paletteGrid);

  function renderPalette(): void {
    rail.replaceChildren(
      ...CATEGORIES.map((c) =>
        h("button", { class: "h-rail-btn", role: "tab", "aria-selected": String(c.id === category), title: c.label, "aria-label": c.label, onclick: () => { category = c.id; renderPalette(); } }, icon(c.icon)),
      ),
    );
    const meta = CATEGORIES.find((c) => c.id === category)!;
    const forStage = category === "tank" || category === "engine";
    paletteTitle.replaceChildren(h("span", null, meta.label), forStage ? h("span", { class: "muted mono" }, `adds to ${TARGET_LABEL[target === "craft" ? "s1" : target]}`) : h("span", { class: "muted mono" }, "adds to spacecraft"));
    paletteGrid.replaceChildren(
      ...partsInCategory(category).map((p) => {
        const unlocked = isUnlocked(p, game().researchedTech);
        const mine = owns(p);
        const afford = p.cost <= game().funds;
        return h(
          "div",
          { class: "h-part-wrap" },
          h(
            "button",
            { class: `h-part${unlocked ? "" : " locked"}${mine ? "" : " foreign"}`, "aria-disabled": unlocked && mine ? null : "true", title: !unlocked ? `Locked: research ${techName(p.tech)}` : mine ? p.blurb : ownerLine(p), onclick: () => add(p.id) },
            h("div", { class: "hp-head" }, icon(meta.icon, 18), h("strong", null, p.name), unlocked ? null : h("span", { class: "hp-lock" }, "🔒")),
            h("div", { class: "hp-stat mono" }, keyStat(p)),
            h("div", { class: "hp-foot mono" }, h("span", null, fmtMass(p.mass)), h("span", { class: afford ? "" : "bad" }, formatUsd(p.cost))),
            unlocked ? (mine ? null : h("div", { class: "hp-req" }, `${ROLE_BY_ID[roleForPart(p)].name.split(" ").slice(-1)[0]}'s area`)) : h("div", { class: "hp-req" }, `Requires ${techName(p.tech)}`),
          ),
          h("button", { class: "hp-info", "aria-label": `What is ${p.name}?`, title: "What is this and why would I use it?", onclick: () => { preview = p; selected = null; scene.select(null); renderCard(); renderStages(); } }, "i"),
        );
      }),
    );
  }

  /* ----- right column ----- */
  const hud = h("div", { class: "h-hud" });
  const crewPanel = h("div", { class: "h-panel crew-panel" });
  const stages = h("div", { class: "h-panel" });
  const systems = h("div", { class: "h-panel" });
  const budget = h("div", { class: "h-panel" });
  const mission = h("div", { class: "h-panel" });
  const fleet = h("div", { class: "h-panel" });
  const advisor = h("div", { class: "h-panel" });
  const learn = h("div", { class: "h-panel" });
  const right = h("div", { class: "h-right" }, hud, crewPanel, advisor, stages, systems, budget, mission, learn, fleet);

  function bigStat(label: string, value: string, tone = "", term?: string): HTMLElement {
    const g = term ? GLOSSARY[term] : null;
    return h("div", { class: `hs ${tone}`, title: g ? `${g.short} ${g.detail}` : null }, h("span", { class: "hs-l" }, label, g ? h("span", { class: "hs-q" }, " ?") : null), h("span", { class: "hs-v mono" }, value));
  }

  function renderHud(): void {
    const twrTone = stats.liftoffTwr === 0 ? "" : stats.liftoffTwr > 1.2 ? "ok" : stats.liftoffTwr > 1 ? "warn" : "bad";
    hud.replaceChildren(
      bigStat("Mass", fmtMass(stats.totalMass), "", "mass"),
      bigStat("Thrust", stats.thrustSl ? fmtThrust(stats.thrustSl) : "0", "", "thrust"),
      bigStat("Thrust / weight", stats.liftoffTwr ? stats.liftoffTwr.toFixed(2) : "0.00", twrTone, "twr"),
      bigStat("Delta-v", fmtDv(stats.deltaV), "", "deltav"),
    );
  }

  function renderStages(): void {
    const rows = ([...STAGE_TARGETS, "craft"] as Target[]).map((t) => {
      const items = partsIn(design, t);
      const grouped = new Map<string, number[]>();
      for (const it of items) grouped.set(it.ref.partId, [...(grouped.get(it.ref.partId) ?? []), it.index]);
      const st = t === "craft" ? null : stats.stages.find((s) => s.target === t)!;
      const sub = t === "craft"
        ? `${fmtMass(stats.payloadMass)} · ${stats.slotsUsed}/${stats.slotsCapacity || "–"} slots`
        : st && st.active ? `Δv ${fmtDv(st.deltaV)} · TWR ${st.twr.toFixed(2)} · burn ${Math.round(st.burnTime)} s` : "Empty";
      return h(
        "div",
        { class: `h-stage${t === target ? " active" : ""}` },
        h(
          "button",
          { class: "h-stage-head", "aria-pressed": String(t === target), onclick: () => { target = t; if (t === "craft" && (category === "tank" || category === "engine")) category = "structure"; if (t !== "craft" && category !== "tank" && category !== "engine") category = "tank"; renderPalette(); renderStages(); } },
          h("span", null, TARGET_LABEL[t]),
          h("span", { class: "muted mono" }, sub),
        ),
        grouped.size
          ? h(
              "ul",
              { class: "h-parts" },
              ...[...grouped].map(([id, idxs]) => {
                const p = PART_BY_ID[id];
                return h(
                  "li",
                  { class: idxs.includes(selected ?? -1) ? "sel" : "" },
                  h("button", { class: "h-part-name", onclick: () => { selected = idxs[idxs.length - 1]; scene.select(selected); renderCard(); renderStages(); } }, `${p.name}${idxs.length > 1 ? ` ×${idxs.length}` : ""}`),
                  h("span", { class: "mono muted" }, formatUsd(p.cost * idxs.length)),
                  h("button", { class: "h-mini", "aria-label": `Remove one ${p.name}`, onclick: () => removeAt(idxs[idxs.length - 1]) }, "−"),
                  p.category === "structure" ? null : h("button", { class: "h-mini", "aria-label": `Add another ${p.name}`, onclick: () => { target = t; add(id); } }, "+"),
                );
              }),
            )
          : null,
      );
    });
    stages.replaceChildren(h("h4", null, "Stages"), ...rows);
  }

  function meter(pct: number, label: string, tone = ""): HTMLElement {
    return h("div", { class: `bar ${tone}`, role: "progressbar", "aria-label": label, "aria-valuenow": Math.round(Math.min(100, pct)), "aria-valuemin": 0, "aria-valuemax": 100 }, h("span", { style: { width: `${Math.max(0, Math.min(100, pct))}%` } }));
  }

  function renderSystems(): void {
    const eclipse = !Number.isFinite(stats.eclipseHours) ? "no load" : stats.eclipseHours > 24 ? "over 24 h" : stats.eclipseHours >= 1 ? `${stats.eclipseHours.toFixed(1)} h` : `${(stats.eclipseHours * 60).toFixed(0)} min`;
    systems.replaceChildren(
      h("h4", null, "Spacecraft systems"),
      kv("Payload mass", fmtMass(stats.payloadMass)),
      kv("Fuel capacity", fmtMass(stats.propellant)),
      kv("Power generation", fmtPower(stats.powerGen)),
      kv("Power draw", fmtPower(stats.powerDraw)),
      meter(stats.powerGen ? (stats.powerDraw / stats.powerGen) * 100 : 0, "Power use", stats.powerDraw > stats.powerGen ? "bad" : ""),
      kv("Battery", `${(stats.batteryWh / 1000).toFixed(1)} kWh · ${eclipse} runtime`),
      kv("Radio range", stats.commRangeMkm ? `${stats.commRangeMkm} million km` : "None"),
      stats.errors.length || stats.warnings.length
        ? h("ul", { class: "h-issues" }, ...stats.errors.map((e) => h("li", { class: "bad" }, `✕ ${e}`)), ...stats.warnings.map((w) => h("li", { class: "warn" }, `! ${w}`)))
        : h("p", { class: "muted small" }, design.parts.length ? "No issues found." : "Add parts to begin. A launch stage needs an engine and a tank."),
    );
  }

  const kv = (k: string, v: string) => h("div", { class: "kv" }, h("span", { class: "k" }, k), h("span", { class: "v mono" }, v));

  function renderBudget(): void {
    const g = game();
    const after = g.funds - stats.cost;
    const catRows = (["spacecraft", "propulsion", "instruments"] as BudgetCategoryId[]).map((id) => {
      const l = g.allocation[id];
      const left = l.planned - l.spent;
      const over = stats.costByCategory[id] > left;
      const meta = BUDGET_CATEGORIES.find((c) => c.id === id)!;
      return h("div", { class: "h-cat" }, h("div", { class: "kv" }, h("span", { class: "k" }, meta.label), h("span", { class: `v mono ${over ? "warn" : ""}` }, `${formatUsd(stats.costByCategory[id])} of ${formatUsd(Math.max(left, 0))}`)), meter(left > 0 ? (stats.costByCategory[id] / left) * 100 : 100, `${meta.label} spending`, over ? "bad" : ""));
    });
    fill(
      budget,
      h("h4", null, "Budget"),
      kv("Available funds", formatUsd(g.funds)),
      kv("This design", formatUsd(stats.cost)),
      h("div", { class: "kv" }, h("span", { class: "k" }, "Funds after build"), h("span", { class: `v mono ${after < 0 ? "bad" : "ok"}` }, formatUsd(after))),
      ...catRows,
      stats.costByCategory.spacecraft + stats.costByCategory.propulsion + stats.costByCategory.instruments > 0 &&
      (["spacecraft", "propulsion", "instruments"] as BudgetCategoryId[]).some((id) => stats.costByCategory[id] > g.allocation[id].planned - g.allocation[id].spent)
        ? h("p", { class: "warn small" }, "A category is over its planned allocation. You can still build, but it takes funds from the rest of the year.")
        : null,
    );
  }

  function renderMission(): void {
    const g = game();
    const list = missionsForSeason(g.season);
    const m = list.find((x) => x.id === missionId) ?? list[0];
    const checks = missionChecks(stats, m);
    const failed = checks.filter((c) => !c.ok).length;
    const select = h(
      "select",
      { "aria-label": "Target mission", disabled: remote && !acts("controller"), title: remote && !acts("controller") ? "The Mission Controller chooses the mission" : undefined, onchange: (e: Event) => { missionId = (e.target as HTMLSelectElement).value; session.selectedMissionId = missionId; if (remote) mp.send({ t: "mission", id: missionId }); renderMission(); renderAdvisor(); renderCrew(); } },
      ...list.map((x) => h("option", { value: x.id, selected: x.id === m.id }, x.name)),
    );
    mission.replaceChildren(
      h("h4", null, "Mission suitability"),
      select,
      h("div", { class: `verdict ${failed === 0 ? "ok" : "bad"}` }, failed === 0 ? "Ready for this mission" : `${failed} requirement${failed > 1 ? "s" : ""} not met`),
      h("ul", { class: "h-checks" }, ...checks.map((c) => h("li", { class: c.ok ? "ok" : "bad" }, h("span", null, `${c.ok ? "✓" : "✕"} ${c.label}`), h("span", { class: "mono muted" }, c.detail)))),
      h("p", { class: "muted small" }, "Delta-v is a simplified teaching estimate from the rocket equation. Mission totals already include allowance for drag and gravity losses."),
    );
  }

  function renderFleet(): void {
    const f = game().fleet;
    fleet.replaceChildren(
      h("h4", null, `Built spacecraft (${f.length})`),
      f.length
        ? h("ul", { class: "h-parts" }, ...f.map((c) => h("li", null, h("span", null, c.name), h("span", { class: "mono muted" }, `${fmtDv(c.deltaV)} · ${fmtMass(c.payloadKg)} · ${formatUsd(c.costPaid)}`), h("button", { class: "h-mini wide", onclick: () => { selected = null; if (commit({ name: `AUR-${game().fleet.length + 1}`, parts: structuredClone(c.parts) }, undefined, true)) toast(`${c.name} loaded as a new draft.`); } }, "Reuse"))))
        : h("p", { class: "muted small" }, "Nothing built yet. Approve a design to pay for it and add it to your fleet."),
    );
  }

  /* ----- top budget strip + build ----- */
  const nameInput = h("input", { class: "h-name", type: "text", maxlength: 24, "aria-label": "Spacecraft name", value: design.name, oninput: (e: Event) => { design = { ...design, name: (e.target as HTMLInputElement).value }; if (!remote) persist(); }, onchange: () => { if (remote) persist(); } }) as HTMLInputElement;
  const buildBtn = h("button", { class: "btn small h-build", onclick: () => build() }, "Build spacecraft");
  const strip = h("div", { class: "h-strip" });

  function renderStrip(): void {
    const g = game();
    const aero = ROLE_BY_ID.aerospace;
    const mayBuild = acts("aerospace") || (!remote && role !== "all");
    const blocked = stats.errors.length > 0 || stats.cost > g.funds || !design.parts.length || !mayBuild;
    buildBtn.toggleAttribute("disabled", blocked);
    buildBtn.textContent = !remote && !acts("aerospace") ? `Ask ${aero.name.split(" ").slice(-1)[0]} to build` : "Build spacecraft";
    buildBtn.title = !mayBuild ? `Only the ${aero.title} approves a build.` : stats.errors[0] ?? (stats.cost > g.funds ? "Not enough funds." : design.parts.length ? "Pay for this design and add it to your fleet." : "Add parts first.");
    strip.replaceChildren(
      h("div", { class: "hs" }, h("span", { class: "hs-l" }, "Funds"), h("span", { class: "hs-v mono" }, formatUsd(g.funds))),
      h("div", { class: "hs" }, h("span", { class: "hs-l" }, "Design cost"), h("span", { class: "hs-v mono" }, formatUsd(stats.cost))),
      h("div", { class: `hs ${g.funds - stats.cost < 0 ? "bad" : ""}` }, h("span", { class: "hs-l" }, "After build"), h("span", { class: "hs-v mono" }, formatUsd(g.funds - stats.cost))),
      nameInput,
      buildBtn,
    );
  }

  function build(): void {
    const g = game();
    if (stats.errors.length || stats.cost > g.funds) return;
    if (remote) {
      mp.send({ t: "build" });
      return;
    }
    const finalName = design.name.trim() || `AUR-${g.fleet.length + 1}`;
    const built = { id: `craft-${Date.now()}`, name: finalName, parts: structuredClone(design.parts), costPaid: stats.cost, year: g.year, deltaV: stats.deltaV, payloadKg: stats.payloadMass };
    store.updateGame((gg) => {
      for (const [cat, amount] of Object.entries(stats.costByCategory) as [BudgetCategoryId, number][]) {
        if (amount > 0) gg.funds = trySpend(gg.funds, gg.allocation, cat, amount).funds;
      }
      gg.fleet.push(built);
      gg.draft = { name: `AUR-${gg.fleet.length + 1}`, parts: structuredClone(design.parts) };
    });
    design = { ...design, name: `AUR-${game().fleet.length + 1}` };
    nameInput.value = design.name;
    toast(`${finalName} built for ${formatUsd(built.costPaid)}.`);
    renderAll();
  }

  /* ----- selected-part card ----- */
  const card = h("div", { class: "h-card" });
  function renderCard(): void {
    const sel = selected !== null ? design.parts[selected] : null;
    const p: Part | null = sel ? part(sel) : preview;
    if (!p) {
      card.classList.remove("open");
      return;
    }
    const lore = CATEGORY_LORE[p.category];
    card.classList.add("open");
    const close = () => { selected = null; preview = null; scene.select(null); renderCard(); renderStages(); };
    fill(
      card,
      h("div", { class: "hc-title" }, h("span", null, p.name), h("button", { class: "h-mini", "aria-label": "Close", onclick: close }, "×")),
      h("p", { class: "small" }, p.blurb),
      ...details(p).map(([k, v]) => kv(k, v)),
      h("div", { class: "lore" }, h("h5", null, "What it is"), h("p", null, lore.what), h("h5", null, "Why use it"), h("p", null, lore.why), h("h5", null, "The trade-off"), h("p", null, lore.tradeoff)),
      h("div", { class: "lore" }, h("h5", null, "The numbers behind it"), h("ul", null, ...derived(p).map((d) => h("li", null, d)))),
      PART_NOTES[p.id] ? h("p", { class: "muted small" }, `Real-world context: ${PART_NOTES[p.id]}`) : null,
      p.tech && !isUnlocked(p, game().researchedTech) ? h("p", { class: "warn small" }, `Locked until you research ${techName(p.tech)}.`) : null,
      sel
        ? h("button", { class: "btn small ghost", onclick: () => removeAt(selected!) }, "Remove part")
        : h("button", { class: "btn small", onclick: () => { add(p.id); preview = null; renderCard(); } }, "Add to design"),
    );
  }

  function renderAdvisor(): void {
    const g = game();
    const m = missionsForSeason(g.season).find((x) => x.id === missionId) ?? null;
    const tips = advise(design, stats, m, g.researchedTech);
    fill(
      advisor,
      h("h4", null, "Design advisor"),
      ...tips.map((t) => h("div", { class: `tip ${t.tone}` }, h("strong", null, t.title), h("p", null, t.body))),
    );
  }

  function renderLearn(): void {
    const worked = workedExample(stats);
    const terms = ["deltav", "isp", "massRatio", "staging", "twr", "eclipse", "range"].map((k) => GLOSSARY[k]);
    fill(
      learn,
      h("h4", null, "How your numbers work"),
      worked.length
        ? h(
            "div",
            { class: "worked" },
            h("p", { class: "small" }, "The rocket equation, filled in with this design:"),
            h("p", { class: "mono eq" }, "Δv = Isp × g₀ × ln(m₀ ÷ m_f)"),
            ...worked.map((w) =>
              h(
                "div",
                { class: "mono small" },
                `${w.label}: ${w.isp.toFixed(0)} s × 9.81 × ln(${fmtMass(w.m0)} ÷ ${fmtMass(w.mf)}) = `,
                h("strong", null, fmtDv(w.deltaV)),
              ),
            ),
            worked.length > 1 ? h("p", { class: "muted small" }, `Total ${fmtDv(stats.deltaV)}. Without staging, the same hardware would reach only ${fmtDv(unstagedDeltaV(stats))}.`) : null,
          )
        : h("p", { class: "muted small" }, "Add an engine and a tank to a stage to see the rocket equation worked out for your design."),
      ...terms.map((t) => h("details", null, h("summary", null, t.term), h("p", { class: "small" }, t.short), h("p", { class: "muted small" }, t.detail))),
    );
  }

  /* ----- tools ----- */
  let exploded = false;
  let spin = false;
  let fire = false;
  const toggleBtn = (label: string, title: string, fn: (on: boolean) => void): HTMLElement => {
    let on = false;
    const b = h("button", { class: "h-tool", "aria-pressed": "false", title, onclick: () => { on = !on; b.setAttribute("aria-pressed", String(on)); fn(on); } }, label);
    return b;
  };
  const templateSelect = h(
    "select",
    { class: "h-tool select", "aria-label": "Load a starter design", onchange: (e: Event) => {
      const sel = e.target as HTMLSelectElement;
      const t = TEMPLATES.find((x) => x.id === sel.value);
      sel.value = "";
      if (!t) return;
      const locked = [...new Set(t.design.parts.map((r) => PART_BY_ID[r.partId]).filter((p) => !isUnlocked(p, game().researchedTech)).map((p) => techName(p.tech)))];
      if (locked.length) return toast(`Research needed first: ${locked.join(", ")}.`);
      selected = null;
      if (commit({ name: `AUR-${game().fleet.length + 1}`, parts: structuredClone(t.design.parts) }, undefined, true)) toast(`Loaded: ${t.name}`);
    } },
    h("option", { value: "" }, "Starter designs…"),
    ...TEMPLATES.map((t) => h("option", { value: t.id, title: t.blurb }, t.name)),
  );
  const tools = h(
    "div",
    { class: "h-tools", role: "toolbar", "aria-label": "Hangar tools" },
    h("button", { class: "h-tool", title: "Undo (Ctrl+Z)", onclick: doUndo }, "↶ Undo"),
    h("button", { class: "h-tool", title: "Remove every part", onclick: () => { if (!design.parts.length) return; selected = null; commit({ ...emptyDesign(), name: design.name }, undefined, true); } }, "Clear"),
    templateSelect,
    toggleBtn("Exploded view", "Separate the stages to inspect them", (on) => { exploded = on; scene.setExploded(exploded); }),
    toggleBtn("Turntable", "Slowly rotate the camera", (on) => { spin = on; scene.setAutoRotate(spin); }),
    toggleBtn("Static fire", "Light the engines on the pad", (on) => { fire = on; scene.setFire(fire); }),
    h("button", { class: "h-tool", title: "Reset camera", onclick: () => scene.resetCamera() }, "Recentre"),
  );

  /* ----- crew ----- */
  const crewNotes: { role: RoleId; text: string }[] = [];

  function askCrew(roles: RoleId[]): void {
    if (remote) {
      for (const r of roles) mp.send({ t: "aiHelp", role: r });
      return;
    }
    const m = MISSIONS.find((x) => x.id === missionId);
    if (!m) return toast("Choose a mission first so the crew knows what to design for.");
    let next = design;
    for (const r of roles) {
      const res = aiContribute(r, next, m, game().researchedTech);
      next = res.design;
      for (const text of res.notes) crewNotes.push({ role: r, text });
    }
    selected = null;
    commit(next, undefined, true);
    if (crewNotes.length > 8) crewNotes.splice(0, crewNotes.length - 8);
    renderCrew();
  }

  function renderCrew(): void {
    const aiRoles: RoleId[] = [];
    const rows = ROLES.map((r) => {
      const holder = remote ? mp.room!.players.find((p) => p.role === r.id) : undefined;
      const mine = remote ? holder?.id === mp.id : role === null || role === "all" || role === r.id;
      const ai = remote ? !holder : !mine;
      if (ai) aiRoles.push(r.id);
      return h(
        "div",
        { class: `crew-row${mine ? " me" : ""}`, style: { "--rc": r.color } },
        avatar(r, mine),
        h("div", { class: "crew-text" }, h("div", { class: "crew-name" }, r.name, h("span", { class: `crew-who ${ai ? "ai" : "human"}` }, mine ? "YOU" : ai ? "AI" : holder!.name)), h("div", { class: "crew-title mono" }, r.title), h("div", { class: "crew-line" }, r.duties[0])),
        ai ? h("button", { class: "h-mini wide", title: `Let ${r.name} add the parts in their area for the chosen mission`, onclick: () => askCrew([r.id]) }, "Ask") : null,
      );
    });
    const order: RoleId[] = (["aerospace", "controller", "science", "propulsion"] as RoleId[]).filter((r) => aiRoles.includes(r));
    fill(
      crewPanel,
      h("h4", null, remote ? "Your crew" : "Your team"),
      h("p", { class: "muted small" }, remote ? "Each role can only fit its own parts. Roles with no player are run by AI crew, who the host can ask to help." : role === "all" ? "You are running all four roles." : "You fit your own parts. Ask an AI crew member to handle theirs, or approve the build once it looks right."),
      ...rows,
      order.length && (!remote || mp.isHost) ? h("button", { class: "btn small ghost", onclick: () => askCrew(order) }, "Let the AI crew complete the design") : null,
      ...(remote ? mp.chat.filter((l) => l.ai && l.role).slice(-3).map((l) => ({ role: l.role as RoleId, text: l.text })) : crewNotes.slice(-4)).map((n) => h("p", { class: "crew-note small", style: { "--rc": ROLE_BY_ID[n.role].color } as unknown as Record<string, string> }, h("strong", null, `${ROLE_BY_ID[n.role].name.split(" ").slice(-1)[0]}: `), n.text)),
    );
  }

  function renderAll(): void {
    renderPalette();
    renderHud();
    renderCrew();
    renderAdvisor();
    renderStages();
    renderSystems();
    renderBudget();
    renderMission();
    renderLearn();
    renderFleet();
    renderStrip();
    renderCard();
  }

  renderAll();

  if (remote) {
    let lastRoom = mp.room;
    let lastChat = mp.chat.length;
    const off = mp.subscribe(() => {
      const r = mp.room;
      if (!r) return;
      if (mp.chat.length !== lastChat) {
        lastChat = mp.chat.length;
        renderCrew();
      }
      if (r === lastRoom) return;
      lastRoom = r;
      if (JSON.stringify(r.design.parts) !== JSON.stringify(design.parts)) {
        design = structuredClone(r.design);
        stats = analyse(design);
        selected = null;
        scene.setDesign(design);
      }
      if (document.activeElement !== nameInput) nameInput.value = r.design.name;
      missionId = r.missionId ?? missionId;
      renderAll();
    });
    const offErr = mp.onError((m) => toast(m));
    router.onLeave(() => {
      off();
      offErr();
    });
  }

  const left = h("div", { class: "h-left" }, rail, palette);
  const stage = h("div", { class: "h-stage-wrap" }, view, h("div", { class: "h-top" }, strip), left, right, card, tools, h("div", { class: "h-hint mono" }, "Drag to orbit · scroll to zoom · click a part to inspect it"), remote ? chatDock() : null);
  return gameShell("hangar", h("div", { class: "solar-wrap" }, stage), { fill: true });
}
