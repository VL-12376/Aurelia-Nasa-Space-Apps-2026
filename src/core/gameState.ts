import { ANNUAL_BUDGET_USD, defaultAllocation, type Allocation } from "../budget/budget";
import type { RoleChoice } from "../crew/roles";
import type { LogEntry, Outcome } from "../missions/flight";
import type { ReplayInput } from "../missions/replay";
import { emptyDesign, type BuiltCraft, type Design } from "../spacecraft/design";
import type { Difficulty, ScoreEntry } from "./play";

/** Pure game-state types and constructors. Shared by the browser store and the multiplayer server. */

export type GameMode = "single" | "multiplayer";

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

export interface FlightReport {
  flightNumber?: number;
  missionId: string;
  craftName: string;
  seed: number;
  year: number;
  outcome: Outcome;
  log: LogEntry[];
  /** The recorded flight (single-player only): lets the leaderboard server re-fly it and calculate the score itself. */
  replay?: ReplayInput;
}

export interface GameState {
  version: number;
  mode: GameMode;
  /** The role the player runs. Other roles are played by AI crew. */
  role: RoleChoice | null;
  agencyName: string;
  season: number;
  year: number;
  funds: number;
  annualBudget: number;
  fundingEarned: number;
  allocation: Allocation;
  reputation: number;
  researchPoints: number;
  researchedTech: string[];
  activeResearch: ActiveResearch | null;
  activeMissions: ActiveMission[];
  /** The design currently open in the hangar. Free to edit; nothing is spent until it is built. */
  draft: Design;
  /** Spacecraft the player has paid for and built. */
  fleet: BuiltCraft[];
  /** Number of launches so far; part of the seed so repeat flights differ. */
  flights: number;
  /** Most recent flight, kept for the debrief screen. */
  lastFlight: FlightReport | null;
  completedMissions: string[];
  achievements: string[];
  experience: number;
  /** How hard the mission trouble is, and how much a score is worth. */
  difficulty: Difficulty;
  /** Sandbox: unlimited funds, every part unlocked, any mission open, and no scoring or leaderboard. */
  sandbox: boolean;
  /** Personal best list, newest first. */
  scores: ScoreEntry[];
  /** The orbit and launch vehicle chosen for each mission. */
  plans: Record<string, { orbit?: string; launcher?: string }>;
}

export const GAME_VERSION = 1;

export function newGameState(mode: GameMode, season = 1): GameState {
  return {
    version: GAME_VERSION,
    mode,
    role: null,
    agencyName: "AURELIA",
    season,
    year: 1,
    funds: ANNUAL_BUDGET_USD,
    annualBudget: ANNUAL_BUDGET_USD,
    fundingEarned: 0,
    allocation: defaultAllocation(),
    reputation: 10,
    researchPoints: 0,
    researchedTech: [],
    activeResearch: null,
    activeMissions: [],
    draft: emptyDesign(),
    fleet: [],
    flights: 0,
    lastFlight: null,
    completedMissions: [],
    achievements: [],
    experience: 0,
    difficulty: "engineer",
    sandbox: false,
    scores: [],
    plans: {},
  };
}
