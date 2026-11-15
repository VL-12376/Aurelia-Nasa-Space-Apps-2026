import { GAME_VERSION, newGameState, type GameMode, type GameState } from "./gameState";
import type { Difficulty } from "./play";
import { TECHS } from "../research/tech";
import type { RoleChoice } from "../crew/roles";
import { awardFlight, newPlayerProgress, type PlayerProgress } from "./progression";
import type { FlightReport } from "./gameState";
import { addFunding, BUDGET_CATEGORIES } from "../budget/budget";

export type { ActiveMission, ActiveResearch, FlightReport, GameMode, GameState } from "./gameState";
export { newGameState } from "./gameState";

export interface Settings {
  reducedMotion: boolean;
  starDensity: "low" | "medium" | "high";
  /** 0 to 1 */
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  /** Original crew recordings, with device speech for unscripted explanations. */
  voice: boolean;
  playerName: string;
  serverUrl: string;
}

export interface AppState {
  settings: Settings;
  game: GameState | null;
  player: PlayerProgress;
}

const SAVE_KEY = "aurelia.save.v1";
const SETTINGS_KEY = "aurelia.settings.v1";
const PLAYER_KEY = "aurelia.player.v1";

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
    const game = this.loadGame();
    this.state = { settings: this.loadSettings(), game, player: this.loadPlayer(game) };
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
    const game = newGameState(mode, opts.sandbox ? season : 1);
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
    this.state = { ...this.state, game, player: opts.sandbox ? this.state.player : newPlayerProgress() };
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
    const player = structuredClone(this.state.player);
    const previous = this.state.game.lastFlight;
    if (game.lastFlight && !game.sandbox && (game.lastFlight.flightNumber !== previous?.flightNumber || game.lastFlight.seed !== previous?.seed || game.lastFlight.missionId !== previous?.missionId)) {
      const report = game.lastFlight;
      awardFlight(player, `solo:${game.flights}:${report.seed}:${report.missionId}`, report, game.achievements.filter((a) => !this.state.game!.achievements.includes(a)));
    }
    this.state = { ...this.state, game, player };
    this.persist();
  }

  /** Erases the saved campaign but keeps settings such as volume. */
  clearProgress(): boolean {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(PLAYER_KEY);
    } catch (error) {
      console.warn("Could not erase saved campaign and player progress.", error);
      return false;
    }
    this.state = { ...this.state, game: null, player: newPlayerProgress() };
    this.emit();
    return true;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.state = { ...this.state, settings: { ...this.state.settings, ...patch } };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.state.settings));
    this.emit();
  }

  awardMultiplayerFlight(roomCode: string, flights: number, report: FlightReport, awards: string[], sandbox: boolean): void {
    if (sandbox) return;
    const id = `room:${roomCode}:${flights}:${report.seed}:${report.missionId}`;
    if (this.state.player.receipts.includes(id)) return;
    const player = structuredClone(this.state.player);
    awardFlight(player, id, report, awards);
    this.state = { ...this.state, player };
    this.persist();
  }

  dismissRewards(): void {
    this.state = { ...this.state, player: { ...this.state.player, pendingRewards: [] } };
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(PLAYER_KEY, JSON.stringify(this.state.player));
      if (this.state.game) localStorage.setItem(SAVE_KEY, JSON.stringify(this.state.game));
    } catch (error) {
      console.warn("Could not save campaign and player progress.", error);
    }
    this.emit();
  }

  private loadPlayer(game: GameState | null): PlayerProgress {
    try {
      const raw = localStorage.getItem(PLAYER_KEY);
      if (raw) {
        const value = JSON.parse(raw) as PlayerProgress;
        if (Number.isFinite(value.experience) && value.experience >= 0 && Array.isArray(value.receipts) && Array.isArray(value.pendingRewards)) return { ...newPlayerProgress(), ...value };
        console.warn("Invalid player progression save; restoring from the campaign.");
      }
    } catch (error) {
      console.warn("Could not read player progression save.", error);
    }
    return { ...newPlayerProgress(), experience: game?.sandbox ? 0 : game?.experience ?? 0 };
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
      if (parsed.version !== GAME_VERSION) return null;
      const game = { ...newGameState(parsed.mode, parsed.season), ...parsed };
      if (!Number.isFinite(parsed.fundingEarned) || parsed.fundingEarned < 0) {
        const spent = BUDGET_CATEGORIES.reduce((sum, c) => sum + game.allocation[c.id].spent, 0);
        game.fundingEarned = Math.max(0, game.funds + spent - game.annualBudget);
        const planned = BUDGET_CATEGORIES.reduce((sum, c) => sum + game.allocation[c.id].planned, 0);
        const unallocated = Math.max(0, game.funds + spent - planned);
        addFunding(0, game.allocation, unallocated);
      }
      return game;
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
