import type { ActiveMission, ActiveResearch } from "../core/store";

/**
 * DEMO DATA ONLY.
 * Everything here is invented sample content used to preview the dashboard.
 * It is never written to the save file and is only shown when the player
 * switches on "Demo data" in the headquarters view.
 */
export const DEMO_ACTIVE_MISSIONS: ActiveMission[] = [
  { missionId: "s1-first-satellite", craftName: "AUR-1 Dawnline", phase: "Orbit circularisation burn", progress: 0.62, status: "nominal" },
  { missionId: "s1-earth-watch", craftName: "AUR-2 Meridian", phase: "Payload commissioning", progress: 0.88, status: "caution" },
];

export const DEMO_ACTIVE_RESEARCH: ActiveResearch = { techId: "staging", progress: 22 };

export const DEMO_ACTIVITY: string[] = [
  "AUR-2 star tracker reports a slow pointing drift",
  "AUR-1 engine burn completed, orbit 398 x 412 km",
  "Ground station Alpha-2 handover successful",
  "Staging research reached 55% of its target",
];
