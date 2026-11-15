import { GAME_VERSION, newGameState, type GameMode, type GameState } from "./gameState";
import type { Difficulty } from "./play";
import { TECHS } from "../research/tech";
import type { RoleChoice } from "../crew/roles";

export type { ActiveMission, ActiveResearch, FlightReport, GameMode, GameState } from "./gameState";
export { newGameState } from "./gameState";

export interface Settings {
  reducedMotion: boolean;
  starDensity: "low" | "medium" | "high";
  /** 0 to 1 */
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  /** Crew members speak their lines aloud with the browser's built-in voices. */
  voice: boolean;
  playerName: string;
  serverUrl: string;
}

export interface AppState {
  settings: Settings;
  game: GameState | null;
}

const SAVE_KEY = "aurelia.save.v1";
const SETTINGS_KEY = "aurelia.settings.v1";

const defaultSettings = (): Settings => ({
  reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  starDensity: "medium",
  musicVolume: 0.5,
  sfxVolume: 0.7,
  muted: false,
  voice: true,
  playerName: "",
  serverUrl: "",
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

  startNewGame(mode: GameMode, season = 1, role: RoleChoice | null = null, opts: { difficulty?: Difficulty; sandbox?: boolean } = {}): void {
    const game = newGameState(mode, season);
    game.role = role;
    game.difficulty = opts.difficulty ?? "engineer";
    if (opts.sandbox) {
      // Sandbox: experiment freely. Everything is unlocked and affordable, and nothing is scored.
      game.sandbox = true;
      game.season = 4;
      game.funds = 1e13;
      game.annualBudget = 1e13;
      game.researchedTech = TECHS.map((t) => t.id);
    }
    this.state = { ...this.state, game };
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

  /** Erases the saved campaign but keeps settings such as volume. */
  clearProgress(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage may be blocked; the in-memory game is still dropped */
    }
    this.state = { ...this.state, game: null };
    this.emit();
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
