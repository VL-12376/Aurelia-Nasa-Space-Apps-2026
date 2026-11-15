import { G0 } from "../physics/orbital";
import { analyse, ascentPenalty, bus, part, type Design, type Stats, type Target } from "../spacecraft/design";
import type { SciencePart } from "../spacecraft/parts";
import type { MissionDef } from "./missions";
import { kinematics, lightDelaySeconds, sunFactor, type Frame, type Kin, type KinContext } from "./kinematics";
import { profileFor, type BurnPhase, type Phase, type ViewKind } from "./profiles";

export type Tone = "info" | "ok" | "warn" | "bad";
export interface LogEntry {
  t: number;
  tone: Tone;
  text: string;
}
export interface DecisionOption {
  id: string;
  label: string;
  hint: string;
  disabled?: string;
  /** Plays a skill mini-game before the option resolves; the text tells the player what to do in it. */
  manual?: string;
}
export interface PendingDecision {
  eventId: string;
  title: string;
  body: string;
  options: DecisionOption[];
  /** Seconds the crew has to answer before the spacecraft's autonomous protection acts. */
  timeS?: number;
  /** The option autonomy takes if nobody answers in time. */
  fallback?: string;
}
export type Status = "running" | "decision" | "success" | "partial" | "failed";

export interface Resolution {
  tone: Tone;
  text: string;
  lesson?: string;
  /** Extra delta-v spent, m/s. */
  dvCost?: number;
  /** Multiplier applied to the science return. */
  science?: number;
  /** Time lost, s. */
  delayS?: number;
  /** Ends the flight with this reason. */
  fail?: string;
  /** Objective that can no longer be completed. */
  lostObjective?: number;
  /** Thinner margins left behind by a gamble or a partial failure: raises the odds of later trouble. */
  stress?: number;
}

interface EventDef {
  id: string;
  at: number;
  /** Early sign shown in the log shortly before the event, as real telemetry would show a trend first. */
  precursor?(p: Phase, f: Flight): string;
  applies(p: Phase, f: Flight): boolean;
  chance(p: Phase, f: Flight): number;
  build(p: Phase, f: Flight): PendingDecision;
  resolve(option: string, f: Flight, rng: () => number): Resolution;
}

interface StageRT {
  index: number;
  target: Target;
  label: string;
  prop: number;
  prop0: number;
  dry: number;
  isp: number;
  thrust: number;
  thrustVac: number;
  engines: number;
  jettisoned: boolean;
}

interface Segment {
  stage: number;
  dv: number;
  propUsed: number;
  duration: number;
  empties: boolean;
}

export interface Telemetry {
  met: number;
  phase: string;
  phaseIndex: number;
  phaseCount: number;
  phaseProgress: number;
  view: ViewKind;
  frame: Frame;
  kin: Kin;
  altKm: number;
  velKms: number;
  distEarthKm: number;
  commsDelayS: number;
  mass: number;
  dvRemaining: number;
  fuel: { label: string; pct: number; kg: number; active: boolean }[];
  powerGen: number;
  powerDraw: number;
  batteryPct: number;
  burning: boolean;
  thrustKn: number;
  status: "NOMINAL" | "DEGRADED" | "ATTENTION" | "COMPLETE" | "LOST";
  explain: string;
}

export interface Outcome {
  result: "success" | "partial" | "failed";
  headline: string;
  failReason?: string;
  objectives: { text: string; done: boolean }[];
  scienceScore: number;
  scienceApplicable: boolean;
  dvDelivered: number;
  dvBudget: number;
  dvMarginPct: number;
  propellantLeftPct: number;
  fundsEarned: number;
  reputation: number;
  researchPoints: number;
  experience: number;
  lessons: string[];
  /** Every unplanned event and how the crew responded. */
  events?: { title: string; choice: string; text: string; tone: Tone }[];
}

/** What the mission-control screen needs from a flight, whether it runs locally or on a server. */
export interface FlightLike {
  readonly design: Design;
  readonly mission: MissionDef;
  readonly status: Status;
  readonly pending: (PendingDecision & { owner?: string; ownerIsAi?: boolean; secondsLeft?: number }) | null;
  readonly log: LogEntry[];
  readonly outcome: Outcome | null;
  readonly t: number;
  telemetry(): Telemetry;
  objectivesState(): { text: string; done: boolean; lost: boolean }[];
  timeline(): { label: string; state: "done" | "active" | "todo"; kind: Phase["kind"] }[];
  activeTargets(): Target[];
  chunkSeconds(): number;
  step(dt: number): void;
  decide(optionId: string, skill?: number): void;
}

/** How long the crew has to react to each kind of trouble, and what the autopilot does if nobody does. */
export const EVENT_TIMING: Record<string, { timeS: number; fallback: string }> = {
  "engine-anomaly": { timeS: 12, fallback: "shutdown" },
  "wind-shear": { timeS: 10, fallback: "press" },
  "thrust-shortfall": { timeS: 20, fallback: "accept" },
  "debris-warning": { timeS: 20, fallback: "accept" },
  "landing-hazard": { timeS: 15, fallback: "land" },
  "entry-heat": { timeS: 12, fallback: "trust" },
  "solar-flare": { timeS: 25, fallback: "safe" },
  "comm-dropout": { timeS: 30, fallback: "wait" },
  "power-brownout": { timeS: 30, fallback: "shed" },
  "instrument-fault": { timeS: 30, fallback: "reboot" },
  "data-full": { timeS: 30, fallback: "prioritise" },
  "nav-error": { timeS: 40, fallback: "later" },
};

/** Option ids that play a mini-game are offered only while the radio delay still allows live control. */
export const MANUAL_MAX_RTT_S = 20;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const SCIENCE_VALUE: Record<SciencePart["style"], number> = { camera: 30, spectrometer: 45, seismometer: 35, drill: 60 };

/** Ballistic coefficient of the entry vehicle, kg/m². Lower means a gentler entry. */
export function ballisticCoefficient(stats: Stats, design: Design): number {
  const b = bus(design);
  if (!b) return Infinity;
  const diameter = b.size * 1.8;
  return stats.payloadMass / (1.6 * Math.PI * (diameter / 2) ** 2);
}

export interface PreflightCheck {
  label: string;
  ok: boolean;
  detail: string;
  /** Soft checks warn but do not block launch. */
  soft?: boolean;
}

/** Everything the launch gate looks at, with plain-language reasons. */
export function preflight(stats: Stats, design: Design, mission: MissionDef, funds: number): PreflightCheck[] {
  const penalty = ascentPenalty(stats.liftoffTwr);
  const need = mission.requiredDeltaV + penalty;
  const checks: PreflightCheck[] = [
    { label: "Lifts off the pad", ok: stats.liftoffTwr > 1 && stats.errors.length === 0, detail: stats.errors[0] ?? `Thrust-to-weight ${stats.liftoffTwr.toFixed(2)}` },
    { label: "Delta-v", ok: stats.deltaV >= need, detail: `${(stats.deltaV / 1000).toFixed(2)} km/s available, ${(need / 1000).toFixed(2)} km/s needed${penalty > 0 ? ` (includes ${Math.round(penalty)} m/s lost to gravity on a slow climb)` : ""}` },
    { label: "Payload mass", ok: stats.payloadMass >= mission.minPayloadKg, detail: `${Math.round(stats.payloadMass)} kg, ${mission.minPayloadKg} kg needed` },
  ];
  const need2 = mission.destination.toLowerCase().includes("outer") ? 6_000 : mission.destination.toLowerCase().includes("mars") ? 400 : mission.destination.toLowerCase().includes("moon") ? 0.4 : 0.002;
  checks.push({ label: "Radio range", ok: stats.commRangeMkm >= need2, detail: `${stats.commRangeMkm} of ${need2} million km` });
  const labels: Record<string, string> = { power: "Power system", communications: "Communications", navigation: "Navigation", landing: "Landing legs", "heat-shield": "Heat shield", "science-payload": "Science payload" };
  for (const c of mission.requiredCapabilities) checks.push({ label: labels[c], ok: stats.capabilities.includes(c), detail: stats.capabilities.includes(c) ? "Fitted" : "Not fitted" });
  checks.push({ label: "Mission funding", ok: funds >= mission.costUsd, detail: `Operations cost ${(mission.costUsd / 1e6).toFixed(0)}M, available ${(funds / 1e6).toFixed(0)}M` });

  const margin = (stats.deltaV - need) / need;
  checks.push({ label: "Delta-v margin", ok: margin >= 0.05, soft: true, detail: `${(margin * 100).toFixed(1)}% spare. Anything that goes wrong in flight eats into this.` });
  if (stats.liftoffTwr > 1 && stats.liftoffTwr < 1.2) checks.push({ label: "Lift-off margin", ok: false, soft: true, detail: "Thrust-to-weight under 1.2 means a slow, wasteful climb." });
  if (stats.stages[0].engines === 1) checks.push({ label: "Engine redundancy", ok: false, soft: true, detail: "One booster engine: if it fails, the mission is lost." });
  if (stats.eclipseHours < 0.6 && stats.powerDraw > 0) checks.push({ label: "Eclipse power", ok: false, soft: true, detail: "Batteries cannot carry the load through a 36 minute eclipse." });
  if (mission.requiredCapabilities.includes("heat-shield")) {
    const bc = ballisticCoefficient(stats, design);
    checks.push({ label: "Entry ballistic coefficient", ok: bc <= 130, soft: true, detail: `${bc.toFixed(0)} kg/m². Above about 130, the heavy vehicle falls too fast through Mars' thin air.` });
  }
  return checks;
}

export function launchBlockers(checks: PreflightCheck[]): PreflightCheck[] {
  return checks.filter((c) => !c.ok && !c.soft);
}

const EVENTS: EventDef[] = [
  {
    id: "engine-anomaly",
    at: 0.4,
    precursor: () => "chamber pressure on one booster engine is trending low.",
    applies: (p) => p.kind === "burn" && p.id === "ascent",
    chance: (_p, f) => Math.min(0.22, 0.07 + 0.015 * f.stats.stages[0].engines),
    build: (_p, f) => {
      const n = f.stats.stages[0].engines;
      return {
        eventId: "engine-anomaly",
        title: "Engine anomaly on Stage 1",
        body: `Chamber pressure on one of your ${n} booster engine${n > 1 ? "s" : ""} is falling. ${n > 1 ? "The other engines are healthy." : "It is your only engine."} You must decide how to respond within seconds.`,
        options: [
          { id: "shutdown", label: "Shut the engine down and continue", hint: n > 1 ? "Loses thrust and costs extra delta-v, but protects the neighbours." : "With one engine there is nothing left to push." },
          { id: "continue", label: "Keep burning at full power", hint: "35% chance the engine fails violently." },
          { id: "manual", label: "Take manual control of the throttle", hint: "Mini-game: the steadier your hand, the better the engine's odds. A poor attempt is worse than shutting it down.", manual: "Hold the chamber pressure inside the green band.", disabled: f.manualAllowed() },
        ],
      };
    },
    resolve: (opt, f, rng) => {
      const n = f.stats.stages[0].engines;
      if (opt === "manual") {
        if (rng() < 0.3 + 0.65 * f.skill) return { tone: "ok", text: `Your throttle work nursed the engine through at reduced thrust (${Math.round(f.skill * 100)}% accuracy). The burn goes on.`, dvCost: 60, stress: 0.1, lesson: "Throttling a struggling engine back can save it, if the hand on the control is steady. Flight controllers train for this in simulators for years." };
        return { tone: "bad", text: "The throttle drifted out of the safe band and the engine failed violently.", fail: "Engine lost after a poor manual throttle correction.", lesson: "Manual control is only better than the automatic response if it is done well. An unsteady correction can be worse than shutting the engine down." };
      }
      if (opt === "shutdown") {
        if (n === 1) return { tone: "bad", text: "The only engine was shut down. The vehicle has no thrust.", fail: "Loss of the only booster engine: a single-engine stage has no redundancy.", lesson: "A single booster engine means any engine failure ends the mission. Clusters of two or more engines can survive losing one." };
        const twr = (f.stats.liftoffTwr * (n - 1)) / n;
        if (twr < 0.85) return { tone: "bad", text: `With ${n - 1} engines the vehicle can no longer climb (thrust-to-weight ${twr.toFixed(2)}).`, fail: "Not enough thrust remained after the engine was shut down.", lesson: "Engine-out survival needs spare thrust. This stage did not have enough thrust-to-weight to lose an engine." };
        return { tone: "warn", text: `Engine shut down safely. Remaining thrust-to-weight is ${twr.toFixed(2)}, so the climb is slower and costs about 200 m/s extra.`, dvCost: 200, stress: 0.15, lesson: "A cluster of engines turned a failure into a delay. That redundancy is why many real boosters use several engines." };
      }
      if (rng() < 0.35) return { tone: "bad", text: "The engine failed violently and damaged its neighbours.", fail: "Uncontained engine failure during ascent.", lesson: "Pushing a failing engine is a gamble. Shutting it down is usually the safer call." };
      return { tone: "ok", text: "The engine held together and pressure stabilised. The burn continues normally.", stress: 0.25, lesson: "The gamble paid off this time, but a failing engine can destroy a stage in an instant." };
    },
  },
  {
    id: "nav-error",
    at: 0,
    applies: (p) => p.kind === "burn" && p.id === "mcc",
    chance: () => 1,
    build: (_p, f) => {
      const err = f.navError();
      return {
        eventId: "nav-error",
        title: "Trajectory error detected",
        body: `Tracking shows the spacecraft is off its planned path. Correcting the error would take about ${err.toFixed(0)} m/s. Errors grow the farther the spacecraft travels, so ${f.hasImu() ? "your inertial platform kept this small" : f.hasNav() ? "your star tracker gives only moderate accuracy" : "with no navigation hardware the error is large"}. When do you correct it?`,
        options: [
          { id: "now", label: "Correct now", hint: `Costs about ${(err * 0.7).toFixed(0)} m/s. A small push early moves the path a long way later.` },
          { id: "later", label: "Wait and correct near arrival", hint: `Costs about ${(err * 1.6).toFixed(0)} m/s, because the same error has grown.` },
          { id: "ignore", label: "Do not correct", hint: "Saves fuel but the spacecraft may miss its target." },
        ],
      };
    },
    resolve: (opt, f, rng) => {
      const err = f.navError();
      if (opt === "now") return { tone: "ok", text: `Corrected early for ${(err * 0.7).toFixed(0)} m/s.`, dvCost: err * 0.7, lesson: "Corrections are cheapest the earlier they are made: a small change early is magnified by distance." };
      if (opt === "later") return { tone: "warn", text: `Corrected late for ${(err * 1.6).toFixed(0)} m/s.`, dvCost: err * 1.6, lesson: "Waiting made the same correction more expensive: the error had grown with distance travelled." };
      if (err > 15 && rng() < 0.7) return { tone: "bad", text: "The uncorrected error carried the spacecraft off course.", fail: "Missed the target after an uncorrected navigation error.", lesson: "Navigation errors do not fix themselves. Skipping the correction saved fuel and lost the mission." };
      return { tone: "ok", text: "The error was small enough that the target was still reached.", lesson: "A good inertial platform kept the error small enough to ignore, but that luck is not guaranteed." };
    },
  },
  {
    id: "comm-dropout",
    at: 0.5,
    precursor: (_p, f) => `downlink signal strength is fading. ${f.antennaCount() < 2 ? "There is no backup antenna." : "The backup antenna is ready."}`,
    applies: (p, f) => p.kind !== "burn" && p.id !== "deploy" && !f.fired("comm-dropout"),
    chance: (_p, f) => 0.22 * f.antennaRisk(),
    build: (_p, f) => ({
      eventId: "comm-dropout",
      title: "Communications dropout",
      body: `The link to Earth has been lost. ${f.delayNote()} Your antenna is ${f.antennaName()}.`,
      options: [
        { id: "wait", label: "Wait for the link to recover", hint: "Safe, but costs several hours." },
        { id: "autonomy", label: "Run the autonomous recovery script", hint: "70% chance of quick recovery, otherwise a longer outage." },
        { id: "backup", label: "Switch to the backup antenna", hint: "Instant if a second antenna is fitted.", disabled: f.antennaCount() < 2 ? "No second antenna fitted" : undefined },
        { id: "repoint", label: "Re-point the ground antenna by hand", hint: "Mini-game: a steady hand reacquires the signal in minutes; a poor one wastes hours.", manual: "Land the marker in the green band to lock on to the signal." },
      ],
    }),
    resolve: (opt, f, rng) => {
      if (opt === "repoint") {
        if (rng() < 0.45 + 0.5 * f.skill) return { tone: "ok", text: `The ground antenna locked on and the link recovered (${Math.round(f.skill * 100)}% accuracy).`, delayS: 300, lesson: "Re-acquiring a weak signal is a skill: precise pointing matters more than raw power." };
        return { tone: "warn", text: "The pointing was off and it took hours to find the signal again.", delayS: 10_800, stress: 0.1, lesson: "A narrow beam needs accurate aim. A poor attempt costs hours." };
      }
      if (opt === "backup") return { tone: "ok", text: "Switched to the backup antenna. The link recovered immediately.", lesson: "A second antenna is cheap insurance: it restored the link at once." };
      if (opt === "autonomy" && rng() < 0.7) return { tone: "ok", text: "The recovery script reacquired the signal in minutes.", delayS: 600 };
      if (opt === "autonomy") return { tone: "warn", text: "The script failed and ground controllers had to resolve it. Hours were lost.", delayS: 14_400, science: 0.95, stress: 0.1 };
      return { tone: "warn", text: "Waited for the link to return. Hours were lost.", delayS: 10_800, lesson: "With no spare antenna and no good autonomy, the only option was to wait." };
    },
  },
  {
    id: "solar-flare",
    at: 0.55,
    precursor: () => "space-weather watch: a large sunspot group has just erupted. Energetic particles are expected within the hour.",
    applies: (p, f) => (p.kind === "coast" || p.kind === "ops") && p.view !== "ascent" && f.t > 4_000 && !f.fired("solar-flare"),
    chance: (p) => (p.kind === "coast" && p.durationS > 86_400 ? 0.2 : 0.08),
    build: () => ({
      eventId: "solar-flare",
      title: "Solar flare warning",
      body: "A burst of high-energy particles from the Sun is on its way. It can damage electronics and degrade instruments. Mission control has a few minutes to react.",
      options: [
        { id: "safe", label: "Enter safe mode", hint: "Instruments off, antennas pointed home. Costs a little time." },
        { id: "operate", label: "Stay fully operational", hint: "30% chance of instrument damage." },
        { id: "partial", label: "Power down only the most sensitive instrument", hint: "Keeps most science running. About 12% chance of damage, and a small loss of data." },
      ],
    }),
    resolve: (opt, f, rng) => {
      if (opt === "partial") {
        if (rng() < 0.12 + f.late() * 0.3) return { tone: "bad", text: "The other instruments were hit by the particles and one was damaged.", science: 0.6, stress: 0.2, lostObjective: f.lastScienceObjective(), lesson: "Protecting only part of the payload leaves the rest exposed. A middle path is a middle result." };
        return { tone: "warn", text: "The sensitive instrument was safe and the rest rode out the flare.", delayS: 900, science: 0.92, stress: 0.1, lesson: "Protecting the most valuable instrument first is a sensible compromise when you cannot protect everything." };
      }
      if (opt === "safe" && rng() < f.late()) return { tone: "warn", text: "The safe-mode command crossed the radio delay after the first particles had already arrived. One instrument took some damage.", delayS: 3_600, science: 0.8, stress: 0.1, lesson: "Far from Earth the particles can beat your command. That is why spacecraft detect radiation themselves and protect themselves automatically." };
      if (opt === "safe") return { tone: "ok", text: "Safe mode kept the electronics protected. The flare passed with no damage.", delayS: 3_600, lesson: "Safe mode costs a little science time but protects the hardware." };
      if (rng() < 0.3) return { tone: "bad", text: "Particles damaged an instrument's electronics.", science: 0.55, stress: 0.3, lostObjective: f.lastScienceObjective(), lesson: "Staying fully operational risked the instruments, and this time it cost part of the science return." };
      return { tone: "ok", text: "The flare was weaker than forecast. No damage.", stress: 0.2, lesson: "The risk did not materialise this time, but it was a gamble with the instruments." };
    },
  },
  {
    id: "power-brownout",
    at: 0,
    applies: () => false,
    chance: () => 0,
    build: (_p, f) => ({
      eventId: "power-brownout",
      title: "Battery nearly empty",
      body: `Power demand (${f.drawNow().toFixed(0)} W) is exceeding generation. The batteries are almost flat. ${f.stats.eclipseHours < 0.6 ? "Your batteries were too small to carry the load through the eclipse." : "Generation did not cover the full load."}`,
      options: [
        { id: "shed", label: "Switch off the instruments until charged", hint: "Keeps the spacecraft alive. Reduces science return." },
        { id: "keep", label: "Keep everything running", hint: "40% chance the computer browns out and resets." },
      ],
    }),
    resolve: (opt, _f, rng) => {
      if (opt === "shed") return { tone: "warn", text: "Instruments switched off. The batteries recharged in sunlight.", science: 0.85, delayS: 5_400, stress: 0.1, lesson: "Shedding load kept the spacecraft alive, but you lost science time. More battery capacity would have avoided this." };
      if (rng() < 0.4) return { tone: "bad", text: "The computer browned out and rebooted, losing observations.", science: 0.6, delayS: 7_200, stress: 0.3, lesson: "Running past the battery's limit crashed the computer. Eclipse needs battery energy, not just panels." };
      return { tone: "ok", text: "Power held on until the Sun returned.", stress: 0.2, lesson: "You got away with it, but the margin was too thin." };
    },
  },
  {
    id: "landing-hazard",
    at: 0.85,
    precursor: () => "descent imaging shows the terrain ahead is rougher than the orbital maps predicted.",
    applies: (p) => p.kind === "burn" && (p.id === "descent" || p.id === "edl"),
    chance: () => 0.6,
    build: (p, f) => {
      const cost = p.id === "descent" ? 90 : 120;
      const left = f.dvSpare();
      return {
        eventId: "landing-hazard",
        title: "Hazard in the landing zone",
        body: `Descent imaging shows boulders and a steep slope under the lander. Propellant on board could provide about ${Math.round(left)} m/s more. A bad landing means a lost spacecraft.`,
        options: [
          { id: "divert", label: "Divert to a smoother site", hint: `Costs about ${cost} m/s. Best odds of a safe landing.`, disabled: left < cost ? "Not enough propellant" : undefined },
          { id: "hover", label: "Hover and scan for a site", hint: "Costs about 40 m/s and gives fair odds.", disabled: left < 40 ? "Not enough propellant" : undefined },
          { id: "land", label: "Land on the planned site", hint: `${f.hasImu() ? "About 70%" : "About 55%"} chance to touch down safely.` },
          { id: "manual", label: "Take the controls and land it yourself", hint: "Mini-game: pick your own spot. A steady hand beats the automatic landing; a shaky one is worse.", manual: "Land the marker in the green band to set the lander down.", disabled: f.manualAllowed() },
        ],
      };
    },
    resolve: (opt, f, rng) => {
      if (opt === "manual") {
        if (rng() < (f.hasImu() ? 0.55 : 0.45) + 0.45 * f.skill) return { tone: "ok", text: `You flew it down by hand to a clear patch (${Math.round(f.skill * 100)}% accuracy).`, dvCost: 50, lesson: "Hand-flying a landing needs a short radio link. At the Moon the delay is about two seconds each way; at Mars it is minutes, which is why Mars landers land themselves." };
        return { tone: "bad", text: "The manual touchdown was too fast and the lander tipped over.", fail: "Crashed during a manual landing.", lesson: "Manual landings reward practice. A poor attempt is riskier than trusting the automatic system." };
      }
      const cost = f.currentPhaseId() === "descent" ? 90 : 120;
      if (opt === "divert") return rng() < 0.95 ? { tone: "ok", text: "Diverted to a smooth plain and touched down gently.", dvCost: cost, lesson: "Spending propellant on a divert bought the safest landing. That is why landers carry spare delta-v." } : { tone: "bad", text: "The divert site hid a crater edge.", dvCost: cost, fail: "Hazard at the diverted landing site." };
      if (opt === "hover") return rng() < 0.85 ? { tone: "ok", text: "Scanned, found a flat spot and landed.", dvCost: 40, lesson: "Hovering costs propellant every second, but it lets the lander choose its site." } : { tone: "bad", text: "The scan ran out of time and the lander touched down badly.", dvCost: 40, fail: "Landing site hazard not avoided." };
      return rng() < (f.hasImu() ? 0.7 : 0.55) ? { tone: "ok", text: "Landed on the original site without incident.", lesson: "That was a gamble. Without spare propellant the lander could not have avoided the hazard." } : { tone: "bad", text: "Touched down on a boulder and tipped over.", fail: "Tipped over on a hazardous landing site.", lesson: "Landing without avoiding a known hazard can destroy the lander. Spare delta-v buys safety." };
    },
  },
  {
    id: "entry-heat",
    at: 0.5,
    precursor: () => "entry interface reached. Heat-shield temperature is climbing fast.",
    applies: (p) => p.kind === "ops" && p.id === "entry",
    chance: () => 1,
    build: (_p, f) => {
      const bc = f.ballistic();
      return {
        eventId: "entry-heat",
        title: "Peak heating during Mars entry",
        body: `The heat shield is glowing. Your vehicle's ballistic coefficient is ${bc.toFixed(0)} kg/m² (mass divided by drag area). Heavier vehicles on small shields decelerate slowly and hit the ground fast. Estimated chance of trouble: ${(f.entryRisk() * 100).toFixed(0)}%.`,
        options: [
          { id: "trust", label: "Trust the aeroshell", hint: "Ride it out." },
          { id: "early", label: "Fire the engines early", hint: "Costs about 150 m/s and halves the risk.", disabled: f.dvSpare() < 150 ? "Not enough propellant" : undefined },
        ],
      };
    },
    resolve: (opt, f, rng) => {
      const risk = f.entryRisk() * (opt === "early" ? 0.5 : 1);
      if (rng() < risk) return { tone: "bad", text: "The vehicle decelerated too slowly in the thin air.", dvCost: opt === "early" ? 150 : 0, fail: "Entry vehicle too heavy for its aeroshell: it reached the ground too fast.", lesson: "Mars' atmosphere is thin: a high ballistic coefficient means too little braking before the ground. A larger bus or lighter payload would have helped." };
      return { tone: "ok", text: "The shield held and the vehicle slowed as planned.", dvCost: opt === "early" ? 150 : 0, lesson: "A low ballistic coefficient gives more braking in thin air and a safer entry." };
    },
  },
  {
    id: "instrument-fault",
    at: 0.5,
    precursor: () => "an instrument's temperature and current readings are drifting away from normal.",
    applies: (p) => p.kind === "ops" && !!p.science,
    chance: () => 0.2,
    build: () => ({
      eventId: "instrument-fault",
      title: "Instrument fault",
      body: "A science instrument has stopped responding. Controllers can reboot it quickly or run a longer diagnostic.",
      options: [
        { id: "reboot", label: "Reboot it", hint: "30 minutes. 85% chance to fix." },
        { id: "diagnose", label: "Run full diagnostics", hint: "2 hours. 98% chance to fix." },
        { id: "backup", label: "Switch to the backup sensor mode", hint: "15 minutes. 90% chance to restore data, with a small loss in quality." },
      ],
    }),
    resolve: (opt, _f, rng) => {
      if (opt === "backup") return rng() < 0.9 ? { tone: "ok", text: "The backup mode restored the data stream with slightly lower quality.", delayS: 900, science: 0.95, lesson: "A degraded mode that works now can be worth more than a perfect one that takes hours." } : { tone: "warn", text: "The backup mode did not take and the instrument needed a longer recovery.", delayS: 5_400, science: 0.8, stress: 0.1 };
      const ok = rng() < (opt === "reboot" ? 0.85 : 0.98);
      const delay = opt === "reboot" ? 1_800 : 7_200;
      return ok ? { tone: "ok", text: "The instrument recovered.", delayS: delay } : { tone: "warn", text: "The instrument recovered only partly.", delayS: delay, science: 0.7, stress: 0.15, lesson: "A quick reboot is faster but fixes less often than a full diagnostic." };
    },
  },
  {
    id: "wind-shear",
    at: 0.3,
    precursor: () => "weather balloons show a strong jet stream along the flight path. Winds at the vehicle's altitude are rising.",
    applies: (p) => p.kind === "burn" && p.id === "ascent",
    chance: () => 0.3,
    build: (_p, f) => ({
      eventId: "wind-shear",
      title: "Wind shear at Max Q",
      body: `A strong jet-stream wind is hitting the rocket right as it passes through the region of maximum dynamic pressure, the moment the structure feels the most force. Your vehicle's thrust-to-weight of ${f.stats.liftoffTwr.toFixed(2)} sets how fast it arrives there: more thrust means a faster, harder hit. The guidance computer can throttle the engines back to ease the load, at the price of a slower climb.`,
      options: [
        { id: "throttle", label: "Throttle down through Max Q", hint: "Costs about 120 m/s of extra delta-v but keeps the loads low." },
        { id: "press", label: "Fly through at full thrust", hint: `Saves fuel. ${Math.round(f.windRisk() * 100)}% chance the structure is overloaded, based on your thrust-to-weight.` },
        { id: "manual", label: "Fly the gust by hand", hint: "Mini-game: steer through the shear. A clean run cuts the risk sharply for only a little fuel.", manual: "Keep the marker inside the green band to hold the heading.", disabled: f.manualAllowed() },
      ],
    }),
    resolve: (opt, f, rng) => {
      if (opt === "manual") {
        if (rng() < f.windRisk() * (1 - 0.85 * f.skill)) return { tone: "bad", text: "The correction came too late and the wind loaded the structure past its limit.", fail: "Structural failure at maximum dynamic pressure.", lesson: "Wind shear changes faster than a human can steer. A clean manual run helps, but it cannot remove the risk." };
        return { tone: "ok", text: `You steered through the gust (${Math.round(f.skill * 100)}% accuracy) and the loads stayed in limits.`, dvCost: 40, stress: f.skill < 0.5 ? 0.15 : 0, lesson: "Active control through the gust spent a little fuel and cut the structural load." };
      }
      if (opt === "throttle") return { tone: "warn", text: "The engines throttled back through the worst of it and the rocket flew on smoothly.", dvCost: Math.min(120, f.dvSpare()), lesson: "Real rockets throttle down for Max Q on purpose: slowing briefly while the air is thick is cheaper than a bent rocket." };
      if (rng() < f.windRisk()) return { tone: "bad", text: "The wind loaded the structure past its limit and the vehicle broke up.", fail: "Structural failure at maximum dynamic pressure.", lesson: "Max Q is where speed and air density multiply into the biggest force on the vehicle. Pushing through shear there is a gamble, and a high thrust-to-weight raises the odds against you." };
      return { tone: "ok", text: "The structure held. That was close.", stress: 0.25, lesson: "It held this time, but the margin at Max Q is exactly why real launches are delayed for high winds." };
    },
  },
  {
    id: "thrust-shortfall",
    at: 0.5,
    precursor: () => "chamber pressure is running a few percent low. Thrust is slightly under plan.",
    applies: (p) => p.kind === "burn" && p.id !== "ascent" && p.id !== "descent" && p.id !== "edl",
    chance: () => 0.18,
    build: (_p, f) => ({
      eventId: "thrust-shortfall",
      title: "Engine running below thrust",
      body: `The engine is delivering about 6% less thrust than planned, so the burn will end short of the speed it needs. Controllers can extend the burn to make it up, or accept a small error and fix it later. You have about ${Math.round(f.dvSpare())} m/s of spare delta-v to pay for it.`,
      options: [
        { id: "extend", label: "Extend the burn", hint: "Costs about 80 m/s of extra propellant and some time.", disabled: f.dvSpare() < 80 ? "Not enough propellant" : undefined },
        { id: "accept", label: "Accept the shortfall", hint: `Saves fuel. ${Math.round(f.shortfallRisk() * 100)}% chance the target is missed: the less spare delta-v you hold, the worse the odds.` },
        { id: "manual", label: "Trim the burn by hand", hint: "Mini-game: fine-tune the throttle to make up the missing thrust for about half the fuel.", manual: "Land the marker in the green band to trim the thrust.", disabled: f.manualAllowed() },
      ],
    }),
    resolve: (opt, f, rng) => {
      if (opt === "manual") {
        if (rng() < 0.5 + 0.45 * f.skill) return { tone: "ok", text: `A careful trim made up the missing thrust (${Math.round(f.skill * 100)}% accuracy).`, dvCost: 40, lesson: "A small, well-aimed correction is cheaper than extending the whole burn." };
        return { tone: "warn", text: "The trim overshot and had to be redone, costing extra propellant and time.", dvCost: 100, delayS: 300, stress: 0.1, lesson: "A clumsy correction costs more than the problem it was fixing." };
      }
      if (opt === "extend") return { tone: "ok", text: "The burn ran a little longer and the target speed was reached.", dvCost: 80, delayS: 120, lesson: "Burns are timed to reach a speed, not a clock reading. A weak engine just needs longer, provided there is propellant left to pay for it." };
      if (rng() < f.shortfallRisk()) return { tone: "bad", text: "The shortfall left the spacecraft on the wrong path.", fail: "Burn ended short of the required speed.", lesson: "A small speed error early in a trajectory becomes a large position error later. That is why mission plans carry spare delta-v." };
      return { tone: "ok", text: "The error was small enough to absorb in later corrections.", stress: 0.2, lesson: "It worked out, but only because the later correction burns had some spare margin." };
    },
  },
  {
    id: "debris-warning",
    at: 0.4,
    precursor: () => "the tracking network has flagged a possible close approach by an object in a similar orbit.",
    applies: (p, f) => (p.kind === "coast" || p.kind === "ops") && p.view !== "ascent" && f.t > 3_000 && !f.fired("debris-warning"),
    chance: (p) => (p.view === "earth-orbit" ? 0.12 : 0.05),
    build: (_p, f) => ({
      eventId: "debris-warning",
      title: "Debris close approach",
      body: "Tracking shows a piece of orbiting debris will pass within a few hundred metres of the spacecraft. At orbital speeds even a fleck of paint can punch through hardware, so controllers have to decide whether to move. Large solar wings make a bigger target.",
      options: [
        { id: "avoid", label: "Fire thrusters to dodge it", hint: `Costs about 25 m/s of propellant and a little time.${f.late() > 0.05 ? " At this distance the command may arrive too late." : ""}` },
        { id: "accept", label: "Accept the small risk", hint: `Saves fuel. ${Math.round(f.debrisRisk() * 100)}% chance of impact damage, based on the size of your solar wings.` },
        { id: "manual", label: "Fly an avoidance burn by hand", hint: "Mini-game: a precise burn costs less fuel and works better than a rushed one.", manual: "Land the marker in the green band to aim the burn.", disabled: f.manualAllowed() },
      ],
    }),
    resolve: (opt, f, rng) => {
      if (opt === "manual") {
        if (rng() < f.debrisRisk() * (1 - f.skill)) return { tone: "bad", text: "The burn was badly aimed and a fragment still struck the spacecraft.", science: 0.6, stress: 0.3, dvCost: 35, lostObjective: f.lastScienceObjective(), lesson: "An aimed avoidance burn needs accurate timing. A poor one burns fuel and still gets hit." };
        return { tone: "ok", text: `A precise burn took the spacecraft clear (${Math.round(f.skill * 100)}% accuracy).`, dvCost: f.skill >= 0.66 ? 15 : 35, delayS: 600, lesson: "A precise avoidance burn needs very little propellant. Accuracy is cheaper than brute force." };
      }
      const late = opt === "avoid" && rng() < f.late();
      if (opt === "avoid" && !late) return { tone: "ok", text: "A short thruster burn moved the spacecraft clear.", dvCost: Math.min(25, f.dvSpare()), delayS: 600, lesson: "Real operators move satellites for conjunctions like this. Spare propellant is also safety margin." };
      if (rng() < f.debrisRisk()) return { tone: "bad", text: late ? "The dodge command arrived too late and a fragment struck the spacecraft." : "A fragment struck the spacecraft and damaged an instrument.", science: 0.6, stress: 0.3, lostObjective: f.lastScienceObjective(), lesson: "Debris is small but moves at around 10 km/s relative to you. Skipping the dodge, or acting too late, cost science." };
      return { tone: "ok", text: late ? "The command arrived late, but the debris still passed clear." : "The debris passed by without touching the spacecraft.", stress: 0.15, lesson: "You were lucky. A miss distance of a few hundred metres is within the uncertainty of tracking." };
    },
  },
  {
    id: "data-full",
    at: 0.6,
    precursor: () => "the onboard recorder is over 80% full and filling faster than the radio can empty it.",
    applies: (p) => p.kind === "ops" && !!p.science,
    chance: () => 0.2,
    build: () => ({
      eventId: "data-full",
      title: "Data storage nearly full",
      body: "The instruments are producing data faster than the radio can send it to Earth, and the onboard recorder is almost full. A spacecraft can only keep what it can store, and only deliver what it can transmit.",
      options: [
        { id: "downlink", label: "Pause science and downlink", hint: "Costs about 2 hours. Nothing is lost." },
        { id: "prioritise", label: "Drop the lowest-value data", hint: "Keeps observing, but about 10% of the science return is lost." },
        { id: "compress", label: "Switch to heavy compression", hint: "Fits more data, with a 40% chance of corrupting some of it." },
      ],
    }),
    resolve: (opt, _f, rng) => {
      if (opt === "downlink") return { tone: "ok", text: "Observations paused while the recorder emptied to Earth. Nothing was lost.", delayS: 7_200, lesson: "Data volume and radio bandwidth are real limits. A bigger antenna or a faster link would have cleared this sooner." };
      if (opt === "prioritise") return { tone: "warn", text: "The least valuable images were deleted to make room.", science: 0.9, lesson: "Operators rank data by value for exactly this reason: when something has to go, it should not be the best of it." };
      if (rng() < 0.4) return { tone: "bad", text: "Compression artefacts corrupted part of the dataset.", science: 0.7, stress: 0.2, lesson: "Aggressive compression saves space by throwing information away. It is a gamble when the data is the whole point." };
      return { tone: "ok", text: "The compression worked and the recorder kept up.", stress: 0.1, lesson: "It worked this time, but the real fix is a bigger link or recorder." };
    },
  },
];

export class Flight {
  readonly stats: Stats;
  readonly design: Design;
  readonly mission: MissionDef;
  readonly phases: Phase[];
  t = 0;
  status: Status = "running";
  pending: PendingDecision | null = null;
  log: LogEntry[] = [];
  outcome: Outcome | null = null;
  phaseIdx = 0;

  private rng: () => number;
  private stages: StageRT[] = [];
  private craftMass: number;
  private phaseT = 0;
  private phaseDur = 0;
  private phaseDv = 0;
  private phaseDvDone = 0;
  private segments: Segment[] = [];
  private segIdx = 0;
  private segT = 0;
  private shortfall = 0;
  private schedule: { def: EventDef; at: number; warned: boolean }[] = [];
  private firedEvents = new Set<string>();
  /** Accumulated risk from gambles and damage; scales the odds of every later event. */
  private stress = 0;
  private skillNow = 0.5;
  private record: NonNullable<Outcome["events"]> = [];
  private objectives: boolean[];
  private scienceUp = 1;
  private scienceDone = 0;
  private sciencePhases: number;
  private dvDelivered = 0;
  private eventDv = 0;
  private lessons: string[] = [];
  private failReason?: string;
  private battery: number;
  private batteryCap: number;
  private orbitStart = 0;
  private targetAu: number;
  private lastKin: Kin;
  private browned = false;

  constructor(design: Design, mission: MissionDef, seed: number) {
    this.design = design;
    this.mission = mission;
    this.stats = analyse(design);
    this.phases = profileFor(mission);
    this.rng = mulberry32(seed);
    this.craftMass = this.stats.payloadMass;
    this.stages = this.stats.stages
      .filter((s) => s.active)
      .map((s) => ({
        index: s.index - 1, target: s.target, label: `Stage ${s.index}`, prop: s.propellant, prop0: s.propellant, dry: s.dryMass, isp: s.isp,
        thrust: s.index === 1 ? (s.thrustSl + s.thrustVac) / 2 : s.thrustVac, thrustVac: s.thrustVac, engines: s.engines, jettisoned: false,
      }));
    this.objectives = mission.objectives.map(() => false);
    this.sciencePhases = this.phases.filter((p) => p.kind === "ops" && p.science).length;
    this.batteryCap = this.stats.batteryWh;
    this.battery = this.batteryCap;
    this.targetAu = mission.destination.toLowerCase().includes("outer") ? 5.203 : 1.524;
    this.lastKin = kinematics("ascent", "ascent", 0, this.kctx());
    this.say("info", `Launch of ${design.name || "spacecraft"}: ${mission.name}.`);
    this.beginPhase();
  }

  /* ---------- helpers used by events ---------- */
  fired(id: string): boolean {
    return this.firedEvents.has(id);
  }
  /** Result of the mini-game the player just played, 0 (poor) to 1 (perfect). */
  get skill(): number {
    return this.skillNow;
  }
  /** Whether the radio link is quick enough to fly something by hand from the ground. */
  manualAllowed(): string | undefined {
    return this.rttS() > MANUAL_MAX_RTT_S ? `Radio delay (${(this.rttS() / 60).toFixed(1)} min round trip) is too long to fly this by hand` : undefined;
  }
  /** Nobody answered in time: the spacecraft's autonomous protection takes the default action. */
  decideTimeout(): void {
    if (!this.pending) return;
    this.say("warn", "No order was given in time. The spacecraft's autonomous protection took the default action.");
    this.lessons.push("When no one can answer in time, the spacecraft acts alone. Autonomous fault protection is built to be safe and simple, not clever, which is why a prepared crew usually does better.");
    this.decide(this.pending.fallback ?? this.pending.options.find((o) => !o.disabled && !o.manual)!.id);
  }
  /** Round-trip radio time to the spacecraft, seconds: a command and its confirmation each take one light-time. */
  rttS(): number {
    return 2 * lightDelaySeconds(this.lastKin.distEarthKm);
  }
  /** 0 near Earth to 0.6 far away: the chance that a time-critical command arrives after the danger has passed. */
  late(): number {
    return Math.min(0.6, Math.max(0, (this.rttS() - 30) / 2400));
  }
  /** Size of the spacecraft's solar wings, a proxy for how big a target it is. */
  solarExposure(): number {
    return this.design.parts.map(part).reduce((n, p) => (p.category === "solar" ? n + p.size : n), 0);
  }
  /** Chance that pushing through Max Q overloads the structure: faster, more powerful rockets hit it harder. */
  windRisk(): number {
    return Math.min(0.5, Math.max(0.08, 0.12 + 0.18 * (this.stats.liftoffTwr - 1.2)));
  }
  debrisRisk(): number {
    return Math.min(0.25, 0.04 + 0.02 * this.solarExposure());
  }
  shortfallRisk(): number {
    return Math.min(0.45, Math.max(0.05, 0.45 - this.dvSpare() / 600));
  }
  hasNav(): boolean {
    return this.stats.capabilities.includes("navigation");
  }
  hasImu(): boolean {
    return this.design.parts.some((r) => r.partId === "nav-imu");
  }
  navError(): number {
    const base = this.hasImu() ? 9 : this.hasNav() ? 28 : 55;
    return base * (this.targetAu > 2 ? 2.4 : this.mission.destination.toLowerCase().includes("mars") ? 2 : 1);
  }
  antennaCount(): number {
    return this.design.parts.filter((r) => part(r).category === "antenna").length;
  }
  antennaName(): string {
    const ids = this.design.parts.map((r) => r.partId);
    return ids.includes("ant-hga") ? "a high-gain dish" : ids.includes("ant-dish") ? "an S-band dish" : "a low-gain patch";
  }
  antennaRisk(): number {
    const ids = this.design.parts.map((r) => r.partId);
    return ids.includes("ant-hga") ? 0.4 : ids.includes("ant-dish") ? 0.6 : 1;
  }
  delayNote(): string {
    const d = lightDelaySeconds(this.lastKin.distEarthKm);
    return d > 60 ? `Commands take ${(d / 60).toFixed(0)} minutes each way, so Earth cannot react quickly.` : "The spacecraft is near Earth, so controllers can react quickly.";
  }
  drawNow(): number {
    return this.powerDrawNow();
  }
  ballistic(): number {
    return ballisticCoefficient(this.stats, this.design);
  }
  entryRisk(): number {
    return Math.min(0.85, Math.max(0.04, (this.ballistic() - 95) / 220));
  }
  currentPhaseId(): string {
    return this.phases[this.phaseIdx]?.id ?? "";
  }
  lastScienceObjective(): number | undefined {
    for (let i = this.phases.length - 1; i >= 0; i--) {
      const p = this.phases[i];
      if (p.kind === "ops" && p.science && p.completes?.length) return p.completes[p.completes.length - 1];
    }
    return undefined;
  }
  /** Delta-v the remaining propellant could still deliver, m/s. */
  dvSpare(): number {
    return this.planBurn(1e9).segments.reduce((n, s) => n + s.dv, 0);
  }

  /* ---------- stepping ---------- */

  private say(tone: Tone, text: string): void {
    this.log.push({ t: this.t, tone, text });
  }

  private kctx(): KinContext {
    return { missionId: this.mission.id, met: this.t, orbitStart: this.orbitStart, targetAu: this.targetAu };
  }

  private planBurn(need: number): { segments: Segment[]; shortfall: number } {
    const props = this.stages.map((s) => s.prop);
    const gone = this.stages.map((s) => s.jettisoned);
    const segments: Segment[] = [];
    for (let k = 0; k < this.stages.length && need > 1e-6; k++) {
      const s = this.stages[k];
      if (gone[k] || props[k] <= 1e-6 || s.engines === 0) continue;
      let above = this.craftMass;
      for (let j = k + 1; j < this.stages.length; j++) if (!gone[j]) above += this.stages[j].dry + props[j];
      const m0 = s.dry + props[k] + above;
      const ve = s.isp * G0;
      const avail = ve * Math.log(m0 / (m0 - props[k]));
      const use = Math.min(need, avail);
      const used = m0 * (1 - Math.exp(-use / ve));
      const flow = s.thrustVac / (s.isp * G0);
      segments.push({ stage: k, dv: use, propUsed: used, duration: Math.max(used / (s.thrust / ve || flow), 0.5), empties: use >= avail - 1e-6 });
      props[k] -= used;
      need -= use;
    }
    return { segments, shortfall: Math.max(need, 0) };
  }

  private beginPhase(): void {
    const p = this.phases[this.phaseIdx];
    this.phaseT = 0;
    this.phaseDvDone = 0;
    this.segments = [];
    this.segIdx = 0;
    this.segT = 0;
    this.shortfall = 0;
    if (p.kind === "burn") {
      let need = p.deltaV;
      if (p.id === "ascent") {
        const pen = ascentPenalty(this.stats.liftoffTwr);
        if (pen > 0) {
          need += pen;
          this.say("warn", `Low thrust-to-weight (${this.stats.liftoffTwr.toFixed(2)}) makes the climb slow: about ${Math.round(pen)} m/s extra is lost to gravity.`);
          this.lessons.push(`A thrust-to-weight of ${this.stats.liftoffTwr.toFixed(2)} wasted about ${Math.round(pen)} m/s fighting gravity during a slow climb. Adding thrust at lift-off would have saved that.`);
        }
      }
      this.phaseDv = need;
      const plan = this.planBurn(need);
      this.segments = plan.segments;
      this.shortfall = plan.shortfall;
      this.phaseDur = Math.max(plan.segments.reduce((n, s) => n + s.duration, 0), 1);
      this.say("info", `${p.label}: ${(need / 1000).toFixed(2)} km/s needed.`);
    } else {
      this.phaseDv = 0;
      this.phaseDur = p.durationS;
      this.say("info", p.label);
    }
    // Roll the dice for events once, at the start of each phase. Earlier trouble makes more trouble likelier.
    this.schedule = [];
    for (const def of EVENTS) {
      if (def.applies(p, this) && this.rng() < Math.min(0.95, def.chance(p, this) * (1 + this.stress))) this.schedule.push({ def, at: def.at, warned: false });
    }
    this.schedule.sort((a, b) => a.at - b.at);
  }

  private powerDrawNow(): number {
    const p = this.phases[this.phaseIdx];
    const science = p && p.kind === "ops" && p.science;
    return this.stats.powerDraw * (science ? 1 : 0.55);
  }

  /** Advance the simulation by dt seconds of mission time. */
  step(dt: number): void {
    let remaining = dt;
    let guard = 0;
    while (remaining > 1e-9 && this.status === "running" && guard++ < 200) {
      const next = this.nextBoundary();
      const adv = Math.max(Math.min(remaining, next), 1e-6);
      this.advance(adv);
      remaining -= adv;
      if (this.status !== "running") break;
      this.handleBoundaries();
    }
  }

  private nextBoundary(): number {
    let n = this.phaseDur - this.phaseT;
    if (this.phaseKind() === "burn" && this.segIdx < this.segments.length) n = Math.min(n, this.segments[this.segIdx].duration - this.segT);
    const ev = this.schedule[0];
    if (ev) {
      if (!ev.warned && ev.def.precursor && ev.at >= 0.15) n = Math.min(n, Math.max((ev.at - 0.06) * this.phaseDur - this.phaseT, 0));
      else n = Math.min(n, Math.max(ev.at * this.phaseDur - this.phaseT, 0));
    }
    return Math.max(n, 0);
  }

  private phaseKind(): Phase["kind"] {
    return this.phases[Math.min(this.phaseIdx, this.phases.length - 1)].kind;
  }

  private advance(adv: number): void {
    this.t += adv;
    this.phaseT += adv;
    if (this.phaseKind() === "burn" && this.segIdx < this.segments.length) {
      this.segT += adv;
    }
    // Battery: generation depends on distance from the Sun and on orbital shadow.
    const p = this.phases[this.phaseIdx];
    this.lastKin = kinematics(p.view, p.id, this.progress(), this.kctx());
    const gen = this.stats.powerGen * sunFactor(this.lastKin, p.view);
    const net = gen - this.powerDrawNow();
    if (this.batteryCap > 0) this.battery = Math.min(this.batteryCap, Math.max(0, this.battery + (net * adv) / 3600));
    if (!this.browned && net < 0 && this.battery <= this.batteryCap * 0.04 && p.kind !== "burn" && this.stats.powerDraw > 0) {
      this.browned = true;
      const def = EVENTS.find((e) => e.id === "power-brownout")!;
      this.raise(def);
    }
  }

  private progress(): number {
    const p = this.phases[this.phaseIdx];
    if (p.kind === "burn") {
      if (this.phaseDv <= 0) return 1;
      const seg = this.segments[this.segIdx];
      const partial = seg ? seg.dv * Math.min(this.segT / seg.duration, 1) : 0;
      return Math.min((this.phaseDvDone + partial) / (this.phaseDv - this.shortfall || 1), 1);
    }
    return Math.min(this.phaseT / Math.max(this.phaseDur, 1), 1);
  }

  private handleBoundaries(): void {
    // Finish segments
    if (this.phaseKind() === "burn") {
      while (this.segIdx < this.segments.length && this.segT >= this.segments[this.segIdx].duration - 1e-6) {
        const seg = this.segments[this.segIdx];
        const s = this.stages[seg.stage];
        s.prop = Math.max(0, s.prop - seg.propUsed);
        this.phaseDvDone += seg.dv;
        this.dvDelivered += seg.dv;
        this.segT -= seg.duration;
        this.segIdx++;
        if (seg.empties) this.separate(s);
      }
    }
    const ev = this.schedule[0];
    if (ev && !ev.warned && ev.def.precursor && ev.at >= 0.15 && this.phaseT >= (ev.at - 0.06) * this.phaseDur - 1e-6) {
      ev.warned = true;
      this.say("warn", `Caution: ${ev.def.precursor(this.phases[this.phaseIdx], this)}`);
      return;
    }
    if (ev && this.phaseT >= ev.at * this.phaseDur - 1e-6) {
      this.schedule.shift();
      this.raise(ev.def);
      return;
    }
    if (this.phaseT >= this.phaseDur - 1e-6) this.endPhase();
  }

  private separate(s: StageRT): void {
    s.jettisoned = true;
    const anyLeft = this.stages.some((x) => !x.jettisoned && x.index > s.index);
    this.say("info", `${s.label} burned out and was jettisoned (${Math.round(s.dry)} kg of empty tanks and engines).`);
    if (anyLeft) this.lessons.push(`${s.label} was dropped once empty. Shedding ${Math.round(s.dry)} kg of dead weight is what let the upper stage keep accelerating efficiently.`);
  }

  private releaseStages(): void {
    for (const s of this.stages) {
      if (s.jettisoned) continue;
      s.jettisoned = true;
      this.say("info", `${s.label} released: its work is done, and the spacecraft continues alone.`);
    }
  }

  private raise(def: EventDef): void {
    const p = this.phases[this.phaseIdx];
    this.firedEvents.add(def.id);
    this.pending = { ...def.build(p, this), ...EVENT_TIMING[def.id] };
    const rtt = this.rttS();
    if (rtt > 60) {
      const mins = rtt / 120;
      this.pending = { ...this.pending, body: `${this.pending.body} Radio delay: any order takes ${mins < 1 ? `${Math.round(mins * 60)} seconds` : `${mins.toFixed(1)} minutes`} to reach the spacecraft, and the same again for the answer, so the spacecraft cannot wait for you.` };
    }
    this.status = "decision";
    this.say("warn", this.pending.title);
  }

  /** The player picks an option for the pending decision. */
  decide(optionId: string, skill?: number): void {
    if (!this.pending || this.status !== "decision") return;
    const def = EVENTS.find((e) => e.id === this.pending!.eventId)!;
    const opt = this.pending.options.find((o) => o.id === optionId);
    if (!opt || opt.disabled) return;
    this.skillNow = Math.min(1, Math.max(0, Number.isFinite(skill) ? (skill as number) : 0.5));
    const title = this.pending.title;
    const rtt = this.rttS();
    const res = def.resolve(optionId, this, this.rng);
    this.pending = null;
    this.status = "running";
    this.say(res.tone, `${opt.label}: ${res.text}`);
    this.record.push({ title, choice: opt.label, text: res.text, tone: res.tone });
    if (res.lesson) this.lessons.push(res.lesson);
    if (res.science) this.scienceUp *= res.science;
    if (res.stress) {
      this.stress += res.stress;
      this.say("warn", "Margins are thinner now: further problems are more likely.");
    }
    if (rtt > 60) {
      this.delay(rtt);
      this.say("info", `The command took ${(rtt / 120).toFixed(1)} min to reach the spacecraft and the confirmation as long to return.`);
      this.lessons.push("Far from Earth, radio delay means ground control cannot react in time. Real spacecraft carry autonomous fault protection, and mission plans leave margin for it.");
    }
    if (res.lostObjective !== undefined) {
      this.objectives[res.lostObjective] = false;
      this.lost.add(res.lostObjective);
    }
    if (res.delayS) this.delay(res.delayS);
    if (res.dvCost) this.spendDv(res.dvCost);
    if (res.fail) this.fail(res.fail);
  }

  private lost = new Set<number>();

  /** Burn extra propellant for an unplanned manoeuvre. */
  private spendDv(dv: number): void {
    const plan = this.planBurn(dv);
    for (const seg of plan.segments) {
      const s = this.stages[seg.stage];
      s.prop = Math.max(0, s.prop - seg.propUsed);
      if (seg.empties) this.separate(s);
    }
    this.eventDv += dv - plan.shortfall;
    this.dvDelivered += dv - plan.shortfall;
    if (plan.shortfall > 1) this.fail(`Ran out of propellant: ${Math.round(plan.shortfall)} m/s short for an unplanned manoeuvre.`);
  }

  private delay(seconds: number): void {
    this.t += seconds;
  }

  private fail(reason: string): void {
    if (this.status === "failed") return;
    this.failReason = reason;
    this.status = "failed";
    this.say("bad", `MISSION LOST: ${reason}`);
    this.finish();
  }

  private endPhase(): void {
    const p = this.phases[this.phaseIdx];
    if (p.kind === "burn" && this.shortfall > 1) {
      const gap = Math.round(this.shortfall);
      const why: Record<string, string> = {
        ascent: `Fell ${gap} m/s short of orbital speed. The vehicle never reached orbit.`,
        plane: `Could not complete the orbit adjustment (${gap} m/s short).`,
        tli: `Short ${gap} m/s on the burn toward the Moon: stranded in Earth orbit.`,
        tmi: `Short ${gap} m/s on the departure burn: Mars was not reached.`,
        loi: `Short ${gap} m/s on the lunar orbit burn: flew past the Moon without being captured.`,
        moi: `Short ${gap} m/s on the orbit insertion burn: flew past the planet.`,
        descent: `Short ${gap} m/s during powered descent: crashed.`,
        edl: `Short ${gap} m/s during terminal descent: crashed.`,
      };
      this.fail(why[p.id] ?? `Short ${gap} m/s on ${p.label}.`);
      if (this.status === "failed") {
        this.lessons.push(`The vehicle ran short of delta-v by ${gap} m/s on "${p.label}". Unplanned manoeuvres and a slow climb drew down the margin. A bigger margin in the hangar is the cheapest insurance.`);
        return;
      }
    }
    if (p.kind === "burn" && p.id === "ascent") this.orbitStart = this.t;
    // After the last burn the remaining stages have no job left, so they are released.
    if (p.kind === "burn" && !this.phases.slice(this.phaseIdx + 1).some((x) => x.kind === "burn")) this.releaseStages();
    if (p.kind === "ops" && p.science) this.scienceDone++;
    for (const idx of p.completes ?? []) if (!this.lost.has(idx)) this.objectives[idx] = true;
    this.say("ok", `${p.label} complete.`);
    this.phaseIdx++;
    if (this.phaseIdx >= this.phases.length) {
      this.finish();
      return;
    }
    this.beginPhase();
  }

  private finish(): void {
    if (this.outcome) return;
    const done = this.objectives.filter(Boolean).length;
    const total = this.objectives.length;
    const m = this.mission;
    const alive = this.status !== "failed";
    const result: Outcome["result"] = !alive ? "failed" : done === total ? "success" : "partial";
    if (alive) this.status = result === "success" ? "success" : "partial";

    const fitted = this.design.parts.map(part).filter((p): p is SciencePart => p.category === "science").reduce((n, p) => n + SCIENCE_VALUE[p.style], 0);
    const target = 40 + (m.difficulty - 2) * 20;
    const applicable = this.sciencePhases > 0;
    const phaseShare = applicable ? this.scienceDone / this.sciencePhases : 1;
    const scienceFrac = applicable ? Math.min(1, (fitted * this.scienceUp * phaseShare) / target) : 1;

    const budget = this.phases.reduce((n, p) => (p.kind === "burn" ? n + p.deltaV : n), 0);
    const marginPct = this.stats.deltaV > 0 ? ((this.stats.deltaV - budget - this.eventDv) / budget) * 100 : 0;
    const propTotal = this.stages.reduce((n, s) => n + s.prop0, 0);
    const propLeft = this.stages.reduce((n, s) => n + s.prop, 0);

    const factor = result === "success" ? 1 : result === "partial" ? 0.4 + 0.4 * (done / total) : 0;
    const sciFactor = applicable ? 0.6 + 0.4 * scienceFrac : 1;
    const bonus = result === "success" && marginPct >= 10 ? 0.05 : 0;
    const funds = Math.round(m.rewardUsd * (factor * sciFactor + bonus));
    const rep = result === "success" ? Math.round(m.reputationReward * (0.8 + 0.2 * scienceFrac)) : result === "partial" ? Math.round(m.reputationReward * 0.4) : -Math.max(3, Math.round(m.reputationReward * 0.4));
    const rp = result === "failed" ? 0 : Math.round(((applicable ? 50 + scienceFrac * 50 : 60) * m.difficulty * 0.6) * (result === "partial" ? 0.6 : 1));
    const xp = result === "success" ? m.difficulty * 20 : result === "partial" ? m.difficulty * 10 : 5;

    if (alive && marginPct >= 10) this.lessons.push(`Finishing with ${marginPct.toFixed(0)}% delta-v to spare earned an efficiency bonus. Margin is what absorbs surprises.`);
    if (alive && applicable && this.scienceUp < 0.9) this.lessons.push("Instrument problems reduced the science return. Spare power and a second antenna are the cheapest ways to protect it.");
    if (alive && applicable && fitted < target) this.lessons.push(`The instruments fitted were worth ${fitted} science points against a target of ${target}. A richer payload would raise the reward, at the cost of mass and power.`);
    if (this.stats.stages[0].engines === 1 && !this.lessons.some((l) => l.includes("single"))) this.lessons.push("The booster used a single engine. Clusters of engines can survive losing one.");
    if (!this.lessons.length) this.lessons.push("Everything went to plan. Staging, margin and the right hardware did their jobs.");

    const headline = result === "success" ? "Mission accomplished" : result === "partial" ? "Partial success" : "Mission lost";
    this.outcome = {
      result, headline, failReason: this.failReason,
      objectives: m.objectives.map((text, i) => ({ text, done: this.objectives[i] })),
      scienceScore: Math.round(scienceFrac * 100), scienceApplicable: applicable,
      dvDelivered: this.dvDelivered, dvBudget: budget, dvMarginPct: marginPct,
      propellantLeftPct: propTotal ? (propLeft / propTotal) * 100 : 0,
      fundsEarned: funds, reputation: rep, researchPoints: rp, experience: xp,
      lessons: [...new Set(this.lessons)].slice(0, 8),
      events: this.record,
    };
  }

  /* ---------- read-only view for the UI ---------- */

  telemetry(): Telemetry {
    const p = this.phases[Math.min(this.phaseIdx, this.phases.length - 1)];
    const burning = this.status === "running" && p.kind === "burn" && this.segIdx < this.segments.length;
    const prog = this.status === "success" || this.status === "partial" ? 1 : this.progress();
    const kin = kinematics(p.view, p.id, prog, this.kctx());
    const seg = burning ? this.segments[this.segIdx] : null;
    const fuel = this.stages.map((s, i) => {
      let prop = s.prop;
      if (seg && seg.stage === i) prop -= seg.propUsed * Math.min(this.segT / seg.duration, 1);
      return { label: s.label, pct: s.prop0 ? Math.max(0, (prop / s.prop0) * 100) : 0, kg: Math.max(0, prop), active: !s.jettisoned };
    });
    let mass = this.craftMass;
    for (const s of this.stages) if (!s.jettisoned) mass += s.dry + s.prop;
    const gen = this.stats.powerGen * sunFactor(kin, p.view);
    const draw = this.powerDrawNow();
    let status: Telemetry["status"] = "NOMINAL";
    if (this.status === "decision") status = "ATTENTION";
    else if (this.status === "failed") status = "LOST";
    else if (this.status === "success" || this.status === "partial") status = "COMPLETE";
    else if (this.scienceUp < 0.9 || draw > gen) status = "DEGRADED";
    return {
      met: this.t, phase: p.label, phaseIndex: this.phaseIdx, phaseCount: this.phases.length, phaseProgress: prog, view: p.view,
      frame: kin.frame, kin, altKm: kin.altKm, velKms: kin.velKms, distEarthKm: kin.distEarthKm, commsDelayS: lightDelaySeconds(kin.distEarthKm),
      mass, dvRemaining: this.dvSpare(), fuel, powerGen: gen, powerDraw: draw, batteryPct: this.batteryCap ? (this.battery / this.batteryCap) * 100 : 0,
      burning: !!burning, thrustKn: seg ? this.stages[seg.stage].thrust / 1000 : 0, status, explain: p.explain,
    };
  }

  /** Seconds in the current auto-warp chunk: the current burn segment, or the whole phase. */
  chunkSeconds(): number {
    if (this.phaseKind() === "burn" && this.segIdx < this.segments.length) return this.segments[this.segIdx].duration;
    return Math.max(this.phaseDur, 1);
  }

  /** Phase list for the timeline, with state. */
  timeline(): { label: string; state: "done" | "active" | "todo"; kind: Phase["kind"] }[] {
    return this.phases.map((p, i) => ({ label: p.label, kind: p.kind, state: i < this.phaseIdx ? "done" : i === this.phaseIdx && this.status !== "success" && this.status !== "partial" ? "active" : this.status === "success" || this.status === "partial" ? "done" : "todo" }));
  }

  objectivesState(): { text: string; done: boolean; lost: boolean }[] {
    return this.mission.objectives.map((text, i) => ({ text, done: this.objectives[i], lost: this.lost.has(i) }));
  }

  /** Jettisoned stages not yet reported, for the 3D view to spawn. */
  jettisonedTargets(): Target[] {
    return this.stages.filter((s) => s.jettisoned).map((s) => s.target);
  }

  activeTargets(): Target[] {
    return [...this.stages.filter((s) => !s.jettisoned).map((s) => s.target), "craft"];
  }

  currentBurnView(): BurnPhase | null {
    const p = this.phases[this.phaseIdx];
    return p?.kind === "burn" ? p : null;
  }
}
