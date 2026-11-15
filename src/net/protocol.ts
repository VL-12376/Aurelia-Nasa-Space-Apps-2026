import type { RoleId } from "../crew/roles";
import type { GameState } from "../core/gameState";
import type { Design } from "../spacecraft/design";
import type { LogEntry, Outcome, PendingDecision, Status, Telemetry } from "../missions/flight";

/**
 * Wire protocol between browser clients and the AURELIA multiplayer server.
 * Clients only send intents; the server owns every rule and every piece of state.
 */

export const MAX_PLAYERS = 4;
export type Phase = "lobby" | "hangar" | "flight" | "debrief";

export type ClientMsg =
  | { t: "create"; name: string; sandbox: boolean; experience?: number }
  | { t: "join"; code: string; name: string; experience?: number }
  | { t: "leave" }
  | { t: "role"; role: RoleId | null }
  | { t: "ready"; ready: boolean }
  | { t: "chat"; text: string }
  | { t: "start" }
  | { t: "design"; design: Design }
  | { t: "aiHelp"; role: RoleId }
  | { t: "mission"; id: string }
  | { t: "build" }
  | { t: "launch"; craftId: string }
  | { t: "time"; mode: "pause" | "auto" | number }
  | { t: "decide"; option: string; skill?: number }
  | { t: "toHangar" }
  | { t: "rejoin"; code: string; token: string };

export interface PlayerView {
  id: string;
  name: string;
  role: RoleId | null;
  ready: boolean;
  host: boolean;
  connected: boolean;
  level?: number;
}

export interface RoomView {
  code: string;
  phase: Phase;
  sandbox: boolean;
  players: PlayerView[];
  /** Roles nobody is playing; the AI crew runs them. */
  aiRoles: RoleId[];
  missionId: string | null;
  design: Design;
  /** The shared campaign: funds, research, fleet and so on. */
  game: GameState;
}

export interface FlightSnapshot {
  t: number;
  status: Status;
  missionId: string;
  design: Design;
  telemetry: Telemetry;
  pending: (PendingDecision & { owner: RoleId; ownerIsAi: boolean; secondsLeft: number }) | null;
  /** The last entries of the mission log. */
  log: LogEntry[];
  logLength: number;
  timeline: { label: string; state: "done" | "active" | "todo"; kind: "burn" | "coast" | "ops" }[];
  objectives: { text: string; done: boolean; lost: boolean }[];
  activeTargets: string[];
  chunk: number;
  outcome: Outcome | null;
  paused: boolean;
  warp: "auto" | number;
  prelaunch?: { pollIndex: number; countdown: number | null } | null;
}

export type ServerMsg =
  | { t: "welcome"; id: string }
  | { t: "seat"; code: string; token: string }
  | { t: "room"; room: RoomView }
  | { t: "flight"; flight: FlightSnapshot }
  | { t: "chat"; from: string; role: RoleId | null; ai: boolean; text: string; at: number }
  | { t: "error"; message: string }
  | { t: "left" };

export const DEFAULT_PORT = 8787;
