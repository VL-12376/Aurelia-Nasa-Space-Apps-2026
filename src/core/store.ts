import { ANNUAL_BUDGET_USD, defaultAllocation, type Allocation } from "../budget/budget";

export type GameMode = "single" | "multiplayer";

export interface Settings {
  reducedMotion: boolean;
  starDensity: "low" | "medium" | "high";
}

export interface ActiveMission {
  missionId: string;
  craftName: string;
  phase: string;
  /** 0 to 1 */
  progress: number;
  status: "nominal" | "caution";
}

export interface ActiveResearch {
  techId: string;
  /** Research points invested so far. */
  progress: number;
}

export interface GameState {
  version: number;
  mode: GameMode;
  agencyName: string;
  season: number;
  year: number;
  funds: number;
  annualBudget: number;
  allocation: Allocation;
  reputation: number;
  researchPoints: number;
  researchedTech: string[];
  activeResearch: ActiveResearch | null;
  activeMissions: ActiveMission[];
  completedMissions: string[];
  achievements: string[];
  experience: number;
}

export interface AppState {
  settings: Settings;
  game: GameState | null;
}

const SAVE_KEY = "aurelia.save.v1";
const SETTINGS_KEY = "aurelia.settings.v1";
const GAME_VERSION = 1;

export function newGameState(mode: GameMode, season = 1): GameState {
  return {
    version: GAME_VERSION,
    mode,
    agencyName: "AURELIA",
    season,
    year: 1,
    funds: ANNUAL_BUDGET_USD,
    annualBudget: ANNUAL_BUDGET_USD,
    allocation: defaultAllocation(),
    reputation: 10,
    researchPoints: 0,
    researchedTech: [],
    activeResearch: null,
    activeMissions: [],
    completedMissions: [],
    achievements: [],
    experience: 0,
  };
}

const defaultSettings = (): Settings => ({
  reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  starDensity: "medium",
});

type Listener = (state: AppState) => void;

class Store {
  private state: AppState;
  private listeners = new Set<Listener>();

  constructor() {
    this.state = { settings: this.loadSettings(), game: this.loadGame() };
  }

  get(): AppState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  hasSave(): boolean {
    return this.loadGame() !== null;
  }

  startNewGame(mode: GameMode, season = 1): void {
    this.state = { ...this.state, game: newGameState(mode, season) };
    this.persist();
  }

  continueGame(): boolean {
    const game = this.loadGame();
    if (!game) return false;
    this.state = { ...this.state, game };
    this.emit();
    return true;
  }

  updateGame(mutator: (game: GameState) => void): void {
    if (!this.state.game) return;
    const game = structuredClone(this.state.game);
    mutator(game);
    this.state = { ...this.state, game };
    this.persist();
  }

  updateSettings(patch: Partial<Settings>): void {
    this.state = { ...this.state, settings: { ...this.state.settings, ...patch } };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.state.settings));
    this.emit();
  }

  private persist(): void {
    if (this.state.game) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.state.game));
      } catch {
        /* storage may be full or blocked; the session still works */
      }
    }
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  private loadGame(): GameState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GameState;
      // Fill any fields added since the save was written so older saves keep working.
      return parsed.version === GAME_VERSION ? { ...newGameState(parsed.mode, parsed.season), ...parsed } : null;
    } catch {
      return null;
    }
  }

  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...defaultSettings(), ...(JSON.parse(raw) as Partial<Settings>) } : defaultSettings();
    } catch {
      return defaultSettings();
    }
  }
}

export const store = new Store();
