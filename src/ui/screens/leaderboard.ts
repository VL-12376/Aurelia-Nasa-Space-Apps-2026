import { fill, h } from "../../core/dom";
import { DIFFICULTY_BY_ID, type Difficulty } from "../../core/play";
import { store } from "../../core/store";
import { MISSIONS } from "../../missions/missions";
import { rankTitle } from "../../missions/score";
import { fetchScores, type ScoreRecord } from "../../net/leaderboard";
import { gameShell } from "../layout";

/** "just now", "5 min ago", "3 days ago". */
export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  const units: [number, string][] = [[60, "min"], [3600, "hour"], [86_400, "day"], [604_800, "week"]];
  let label = "";
  for (const [size, name] of units) {
    if (s >= size) {
      const n = Math.floor(s / size);
      label = `${n} ${name}${name === "min" || n === 1 ? "" : "s"} ago`;
    }
  }
  return label || new Date(at).toLocaleDateString();
}

const difficultyBadge = (d: Difficulty) => h("span", { class: `lb-diff ${d}` }, DIFFICULTY_BY_ID[d]?.label ?? d);

interface Row {
  name: string;
  verified: boolean;
  team?: string[];
  missionName: string;
  craftName: string;
  score: number;
  result: string;
  difficulty: Difficulty;
  at: number;
}

function table(rows: Row[], showName: boolean): HTMLElement {
  const head = ["#", ...(showName ? ["Name"] : []), "Mission", "Craft", "Score", "Rank", "Difficulty", "When"];
  return h(
    "div",
    { class: "lb-scroll" },
    h(
      "table",
      { class: "lb-table" },
      h("thead", null, h("tr", null, ...head.map((c) => h("th", { class: c === "Score" || c === "#" ? "num" : "" }, c)))),
      h(
        "tbody",
        null,
        ...rows.map((r, i) =>
          h(
            "tr",
            { class: r.result === "failed" ? "failed" : "" },
            h("td", { class: "num mono" }, String(i + 1)),
            showName
              ? h("td", { class: "lb-name" }, h("span", { title: r.team?.join(", ") ?? "" }, r.name), r.verified ? h("span", { class: "lb-verified", title: "Computed by the game server in a multiplayer room" }, "✓ verified") : null)
              : null,
            h("td", null, r.missionName),
            h("td", { class: "muted" }, r.craftName),
            h("td", { class: "num mono lb-score" }, String(r.score)),
            h("td", null, rankTitle(r.score)),
            h("td", null, difficultyBadge(r.difficulty)),
            h("td", { class: "muted small" }, relativeTime(r.at)),
          ),
        ),
      ),
    ),
  );
}

export function leaderboardScreen(): HTMLElement {
  let tab: "global" | "mine" = "global";
  let mission = "all";
  let request = 0;

  const list = h("div", { class: "lb-list", "aria-live": "polite" });
  const tabs = h("div", { class: "lb-tabs", role: "tablist" });
  const filter = h(
    "select",
    { "aria-label": "Mission filter", onchange: (e: Event) => { mission = (e.target as HTMLSelectElement).value; void load(); } },
    h("option", { value: "all" }, "All missions"),
    ...MISSIONS.map((m) => h("option", { value: m.id }, m.name)),
  );
  const filterRow = h("label", { class: "lb-filter" }, h("span", { class: "muted small" }, "Mission"), filter);
  const note = h("p", { class: "muted small lb-note" }, "Single-player scores are self-reported. A ✓ verified score was computed by the game server in a multiplayer room.");

  const drawTabs = () =>
    fill(
      tabs,
      ...([["global", "Global"], ["mine", "My bests"]] as const).map(([id, label]) =>
        h("button", { class: `lb-tab${tab === id ? " active" : ""}`, role: "tab", "aria-selected": tab === id ? "true" : "false", onclick: () => { tab = id; drawTabs(); void load(); } }, label),
      ),
    );

  const load = async () => {
    const mine = tab === "mine";
    filterRow.style.display = mine ? "none" : "";
    note.style.display = mine ? "none" : "";
    const mark = ++request;
    if (mine) {
      const own = [...(store.get().game?.scores ?? [])].sort((a, b) => b.score - a.score || b.at - a.at);
      fill(list, own.length ? table(own.map((s) => ({ ...s, name: "", verified: false })), false) : h("div", { class: "notice" }, "Nothing here yet. Fly a scored mission (not a sandbox one) and your best results are kept on this device."));
      return;
    }
    const wake = window.setTimeout(() => {
      if (mark === request) fill(list, h("div", { class: "notice" }, "The leaderboard server is waking up. Free servers sleep when idle, so this can take up to a minute…"));
    }, 4000);
    fill(list, h("div", { class: "notice" }, "Loading the leaderboard…"));
    const entries: ScoreRecord[] | null = await fetchScores(mission, 50);
    clearTimeout(wake);
    if (mark !== request) return;
    if (!entries) {
      fill(list, h("div", { class: "notice" }, "The leaderboard server is waking up, try again in a minute."), h("div", { class: "lb-retry" }, h("button", { class: "btn small", onclick: () => void load() }, "Try again")));
    } else if (!entries.length) {
      fill(list, h("div", { class: "notice" }, mission === "all" ? "No scores yet. Be the first: finish a mission and submit your score from the debrief." : "No scores for this mission yet. Be the first."));
    } else {
      fill(list, table(entries, true));
    }
  };

  drawTabs();
  void load();
  return gameShell(
    "leaderboard",
    h(
      "div",
      { class: "grid lb" },
      h("h2", null, "Leaderboard"),
      h("p", { class: "muted" }, "Mission scores out of 100, scaled by difficulty: Cadet counts for less and Director can reach 130."),
      h("div", { class: "lb-bar" }, tabs, filterRow),
      h("div", { class: "panel lb-panel" }, list),
      note,
    ),
  );
}
