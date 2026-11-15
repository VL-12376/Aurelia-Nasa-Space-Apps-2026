import { dynamicPressureKpa } from "../data/real";

export interface PollCall {
  role: "propulsion" | "aerospace" | "science" | "controller";
  station: string;
  line: string;
  why: string;
}

/** The pre-launch poll, in the order a real launch director would take it. */
export const LAUNCH_POLL: readonly PollCall[] = [
  { role: "propulsion", station: "Propulsion", line: "Tanks pressurised, engines chilled. We are GO.", why: "Cryogenic engines must be cooled before ignition, or the first drop of fuel would boil in the pipes." },
  { role: "aerospace", station: "Structures", line: "Vehicle loads and winds are inside limits. We are GO.", why: "Upper-level wind shear can bend a tall rocket, so winds aloft are checked right up to the last minutes." },
  { role: "science", station: "Systems", line: "Power, link and payload are healthy. We are GO.", why: "The spacecraft switches to internal battery power shortly before liftoff and must be talking to the ground." },
  { role: "controller", station: "Flight Director", line: "All stations GO. We are GO for launch.", why: "Only one person makes the final call, after hearing a clear GO from every station." },
];

export const COUNTDOWN_FROM = 10;

export interface AscentSample {
  view: string;
  burning: boolean;
  altKm: number;
  velKms: number;
  stagesActive: number;
}

export interface Callout {
  id: "liftoff" | "tower-clear" | "mach-1" | "max-q" | "stage-sep" | "orbit";
  title: string;
  text: string;
}

const TEXT: Record<Callout["id"], Omit<Callout, "id">> = {
  liftoff: { title: "Liftoff", text: "Thrust now exceeds weight, so the rocket rises. Engines are ignited a few seconds early and checked before the hold-down clamps release." },
  "tower-clear": { title: "Tower clear", text: "The vehicle has cleared the launch tower. Control passes from the pad to the flight controllers, and the rocket begins to roll toward its flight direction." },
  "mach-1": { title: "Passing the speed of sound", text: "Shock waves build around the vehicle. The air is still thick, so drag is climbing fast." },
  "max-q": { title: "Max Q", text: "Maximum dynamic pressure: the rocket is fast, and the air is still thick enough to push hard on it. This is the most stressful moment for the structure. After it, the air thins faster than the rocket speeds up." },
  "stage-sep": { title: "Stage separation", text: "The empty lower stage is dropped. Shedding dead weight means the remaining fuel pushes much less mass, which is the whole point of staging." },
  orbit: { title: "Orbit reached", text: "The engines are off and the spacecraft is moving sideways fast enough that it keeps falling around the Earth without ever hitting it. Being in orbit is about speed, not height." },
};

/** G-load felt by the crew: thrust acceleration plus gravity, from how quickly the speed grows. */
export function gLoad(dvKms: number, dtS: number): number {
  if (dtS <= 0) return 1;
  return Math.min(6, Math.max(0, 1 + (dvKms * 1000) / dtS / 9.81));
}

/** Watches ascent telemetry and reports each milestone once. */
export function createCalloutTracker(): (s: AscentSample) => Callout[] {
  const done = new Set<Callout["id"]>();
  let maxQ = 0;
  let lastStages = -1;
  return (s) => {
    const out: Callout[] = [];
    const fire = (id: Callout["id"]) => {
      if (done.has(id)) return;
      done.add(id);
      out.push({ id, ...TEXT[id] });
    };
    if (s.view === "ascent") {
      if (s.burning) fire("liftoff");
      if (s.altKm > 0.12) fire("tower-clear");
      if (s.velKms > 0.32) fire("mach-1");
      const q = dynamicPressureKpa(s.altKm, s.velKms * 1000);
      maxQ = Math.max(maxQ, q);
      if (maxQ > 5 && q < maxQ * 0.94) fire("max-q");
      if (lastStages >= 0 && s.stagesActive < lastStages && done.has("liftoff")) fire("stage-sep");
      lastStages = s.stagesActive;
    } else if (done.has("liftoff")) fire("orbit");
    return out;
  };
}

export function ascentQ(altKm: number, velKms: number): number {
  return dynamicPressureKpa(altKm, velKms * 1000);
}
