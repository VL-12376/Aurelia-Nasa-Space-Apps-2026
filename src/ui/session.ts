import type { Flight } from "../missions/flight";
import type { Difficulty } from "../core/play";

/** UI-only state. Never saved: it resets when the page reloads. */
export const session = {
  /** Season picked on the mode screen, carried to the role-select step. */
  pendingSeason: 1,
  pendingDifficulty: "engineer" as Difficulty,
  pendingSandbox: false,
  selectedMissionId: null as string | null,
  destination: null as string | null,
  /** Craft chosen in the mission briefing. */
  selectedCraftId: null as string | null,
  /** The flight currently being flown (not saved). */
  flight: null as Flight | null,
  flightMissionId: null as string | null,
  flightSeed: 0,
  /** Set once the finished flight has been written to the save, so reloading the debrief cannot pay twice. */
  flightApplied: false,
};
