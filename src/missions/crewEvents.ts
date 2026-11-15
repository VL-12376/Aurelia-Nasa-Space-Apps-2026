import type { RoleId } from "../crew/roles";
import type { PendingDecision, Resolution } from "./flight";

interface CrewCheck {
  id: string;
  role: RoleId;
  title: string;
  body: string;
  action: string;
  hint: string;
}

export const CREW_CHECKS: readonly CrewCheck[] = [
  { id: "crew-aerospace-1", role: "aerospace", title: "Structural load check", body: "Verify the load sensors before the next flight segment.", action: "Calibrate load sensors", hint: "Stop the marker in the green band to align three structural sensors." },
  { id: "crew-propulsion-1", role: "propulsion", title: "Propellant feed check", body: "Balance the feed valves so the engines receive a steady supply.", action: "Balance feed valves", hint: "Stop the marker in the green band to tune three feed valves." },
  { id: "crew-controller-1", role: "controller", title: "Guidance alignment", body: "Align the guidance reference with the planned flight path.", action: "Align guidance", hint: "Stop the marker in the green band to confirm three guidance references." },
  { id: "crew-science-1", role: "science", title: "Power bus check", body: "Synchronise the power channels before the payload goes to work.", action: "Synchronise power", hint: "Stop the marker in the green band to synchronise three power channels." },
  { id: "crew-aerospace-2", role: "aerospace", title: "Vehicle integrity check", body: "Check the spacecraft's structural response before completing the mission.", action: "Verify vehicle integrity", hint: "Stop the marker in the green band to verify three load paths." },
  { id: "crew-propulsion-2", role: "propulsion", title: "Thruster readiness", body: "Tune the attitude thrusters for the remaining manoeuvres.", action: "Tune attitude thrusters", hint: "Stop the marker in the green band to balance three thruster channels." },
  { id: "crew-controller-2", role: "controller", title: "Flight plan verification", body: "Confirm the final guidance references for the mission objectives.", action: "Verify flight plan", hint: "Stop the marker in the green band to confirm three navigation checks." },
  { id: "crew-science-2", role: "science", title: "Telemetry calibration", body: "Calibrate the telemetry channels so the team receives reliable readings.", action: "Calibrate telemetry", hint: "Stop the marker in the green band to align three telemetry channels." },
];

export function crewDecision(check: CrewCheck): PendingDecision {
  return {
    eventId: check.id, title: check.title,
    body: `${check.body} You have 45 seconds, including the mini-game. A missed check reduces mission funding and increases risk.`,
    timeS: 45, fallback: "defer",
    options: [
      { id: "calibrate", label: check.action, hint: "Complete the manual check to protect mission margins.", manual: check.hint },
      { id: "defer", label: "Defer the check", hint: "Lose 3% of mission funding and increase the chance of later problems." },
    ],
  };
}

export function resolveCrewCheck(option: string, skill: number): Resolution {
  if (option === "calibrate" && skill >= 0.5) return { tone: "ok", text: "Check complete. The system is ready and mission margins are protected." };
  return {
    tone: "warn", text: "Check incomplete. Mission funding reduced by 3%; thinner margins increase the risk of later anomalies.",
    stress: 0.15, lesson: "Routine station checks protect mission margins. Finish the manual check before its response timer expires.",
  };
}
