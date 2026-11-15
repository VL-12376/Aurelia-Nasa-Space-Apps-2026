import type { FlightLike, Telemetry } from "../missions/flight";
import { MISSIONS } from "../missions/missions";
import type { Design, Target } from "../spacecraft/design";
import { mp } from "./session";

/**
 * A flight that is running on the server. Reading it returns whatever the server last sent;
 * it never advances the simulation itself, and decisions go back as messages.
 */
export class RemoteFlight implements FlightLike {
  get design(): Design {
    return mp.flight!.design;
  }
  get mission() {
    return MISSIONS.find((m) => m.id === mp.flight!.missionId)!;
  }
  get status() {
    return mp.flight?.status ?? "running";
  }
  get pending() {
    return mp.flight?.pending ?? null;
  }
  get log() {
    return mp.flight?.log ?? [];
  }
  get outcome() {
    return mp.flight?.outcome ?? null;
  }
  get t() {
    return mp.flight?.t ?? 0;
  }
  telemetry(): Telemetry {
    return mp.flight!.telemetry;
  }
  objectivesState() {
    return mp.flight!.objectives;
  }
  timeline() {
    return mp.flight!.timeline;
  }
  activeTargets(): Target[] {
    return mp.flight!.activeTargets as Target[];
  }
  chunkSeconds(): number {
    return mp.flight?.chunk ?? 1;
  }
  step(): void {
    /* The server steps the simulation. */
  }
  decide(optionId: string, skill?: number): void {
    mp.send({ t: "decide", option: optionId, skill });
  }
}
