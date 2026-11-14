export type MissionCategory =
  | "satellite"
  | "earth-observation"
  | "lunar-orbit"
  | "lunar-landing"
  | "rover"
  | "mars-orbit"
  | "mars-landing"
  | "sample-return"
  | "deep-space";

export type Capability =
  | "power"
  | "communications"
  | "navigation"
  | "landing"
  | "heat-shield"
  | "science-payload";

export interface MissionDef {
  id: string;
  name: string;
  category: MissionCategory;
  season: number;
  destination: string;
  description: string;
  sciencePurpose: string;
  objectives: string[];
  /** Simplified total delta-v budget from Earth's surface, in m/s (teaching model, not flight-grade). */
  requiredDeltaV: number;
  requiredCapabilities: Capability[];
  /** Minimum payload mass in kg. */
  minPayloadKg: number;
  costUsd: number;
  rewardUsd: number;
  reputationReward: number;
  /** 1 (introductory) to 5 (extreme). */
  difficulty: 1 | 2 | 3 | 4 | 5;
}

const M = 1_000_000;

export const MISSIONS: readonly MissionDef[] = [
  {
    id: "s1-first-satellite",
    name: "First Light Satellite",
    category: "satellite",
    season: 1,
    destination: "Low Earth Orbit",
    description: "Place a small communications satellite into a circular low Earth orbit.",
    sciencePurpose: "Demonstrate orbital insertion and learn why orbital speed, not height, keeps a satellite up.",
    objectives: ["Reach ~400 km altitude", "Reach orbital velocity (~7.7 km/s)", "Deploy payload"],
    requiredDeltaV: 9400,
    requiredCapabilities: ["power", "communications"],
    minPayloadKg: 150,
    costUsd: 450 * M,
    rewardUsd: 700 * M,
    reputationReward: 5,
    difficulty: 1,
  },
  {
    id: "s1-earth-watch",
    name: "Earth Watch",
    category: "earth-observation",
    season: 1,
    destination: "Sun-synchronous orbit",
    description: "Deploy an imaging satellite that watches weather, coastlines and vegetation.",
    sciencePurpose: "Study how polar orbits let one satellite scan the whole planet over days.",
    objectives: ["Reach a polar orbit", "Activate imaging payload", "Return first dataset"],
    requiredDeltaV: 9800,
    requiredCapabilities: ["power", "communications", "navigation", "science-payload"],
    minPayloadKg: 400,
    costUsd: 900 * M,
    rewardUsd: 1_300 * M,
    reputationReward: 8,
    difficulty: 2,
  },
  {
    id: "s2-lunar-orbiter",
    name: "Selene Orbiter",
    category: "lunar-orbit",
    season: 2,
    destination: "Moon (orbit)",
    description: "Travel to the Moon and enter a stable lunar orbit to map the surface.",
    sciencePurpose: "Learn about lunar gravity, which is about one sixth of Earth's, and gravity anomalies.",
    objectives: ["Perform translunar injection", "Capture into lunar orbit", "Map the surface"],
    requiredDeltaV: 13300,
    requiredCapabilities: ["power", "communications", "navigation", "science-payload"],
    minPayloadKg: 600,
    costUsd: 2_200 * M,
    rewardUsd: 3_200 * M,
    reputationReward: 12,
    difficulty: 3,
  },
  {
    id: "s2-lunar-lander",
    name: "Soft Touch Lander",
    category: "lunar-landing",
    season: 2,
    destination: "Moon (surface)",
    description: "Land a robotic probe on the lunar surface with a controlled powered descent.",
    sciencePurpose: "With no atmosphere, only engines can slow a lander. Experience why landing costs delta-v.",
    objectives: ["Enter lunar orbit", "Powered descent", "Touch down safely", "Deploy instruments"],
    requiredDeltaV: 15200,
    requiredCapabilities: ["power", "communications", "navigation", "landing", "science-payload"],
    minPayloadKg: 800,
    costUsd: 3_800 * M,
    rewardUsd: 5_400 * M,
    reputationReward: 18,
    difficulty: 4,
  },
  {
    id: "s2-lunar-rover",
    name: "Regolith Rover",
    category: "rover",
    season: 2,
    destination: "Moon (surface)",
    description: "Deliver a small rover that explores a lunar crater and analyses its soil.",
    sciencePurpose: "Investigate lunar regolith and the search for water ice in shadowed regions.",
    objectives: ["Land safely", "Deploy rover", "Drive 1 km", "Analyse soil samples"],
    requiredDeltaV: 15200,
    requiredCapabilities: ["power", "communications", "navigation", "landing", "science-payload"],
    minPayloadKg: 1200,
    costUsd: 4_600 * M,
    rewardUsd: 6_800 * M,
    reputationReward: 22,
    difficulty: 4,
  },
  {
    id: "s3-mars-orbiter",
    name: "Ares Survey Orbiter",
    category: "mars-orbit",
    season: 3,
    destination: "Mars (orbit)",
    description: "Cross interplanetary space and enter orbit around Mars to study its atmosphere and surface.",
    sciencePurpose: "Learn about transfer trajectories, launch windows and communication delay.",
    objectives: ["Trans-Mars injection", "Mid-course corrections", "Mars orbit insertion", "Atmospheric survey"],
    requiredDeltaV: 14400,
    requiredCapabilities: ["power", "communications", "navigation", "science-payload"],
    minPayloadKg: 1000,
    costUsd: 5_500 * M,
    rewardUsd: 8_000 * M,
    reputationReward: 25,
    difficulty: 4,
  },
  {
    id: "s3-mars-lander",
    name: "Ares Surface Lander",
    category: "mars-landing",
    season: 3,
    destination: "Mars (surface)",
    description: "Survive atmospheric entry and land a science station on Mars.",
    sciencePurpose: "Mars' thin atmosphere helps but cannot do all the braking. Balance heat shields, parachutes and engines.",
    objectives: ["Reach Mars", "Atmospheric entry", "Descent and landing", "Run science station"],
    requiredDeltaV: 14900,
    requiredCapabilities: ["power", "communications", "navigation", "landing", "heat-shield", "science-payload"],
    minPayloadKg: 1500,
    costUsd: 8_500 * M,
    rewardUsd: 12_000 * M,
    reputationReward: 35,
    difficulty: 5,
  },
  {
    id: "s3-sample-collection",
    name: "Core Sample Collection",
    category: "sample-return",
    season: 3,
    destination: "Mars (surface)",
    description: "Collect and seal rock samples on Mars for later retrieval.",
    sciencePurpose: "Study how scientists choose samples that may reveal Mars' ancient climate.",
    objectives: ["Land", "Drill and collect", "Seal sample tubes", "Report findings"],
    requiredDeltaV: 14900,
    requiredCapabilities: ["power", "communications", "navigation", "landing", "heat-shield", "science-payload"],
    minPayloadKg: 1800,
    costUsd: 9_500 * M,
    rewardUsd: 13_500 * M,
    reputationReward: 40,
    difficulty: 5,
  },
  {
    id: "s4-deep-space",
    name: "Horizon Probe",
    category: "deep-space",
    season: 4,
    destination: "Outer Solar System",
    description: "Send a long-duration probe far beyond Mars to study distant worlds.",
    sciencePurpose: "Explore what advanced propulsion, nuclear-electric power and long communication delays demand.",
    objectives: ["Gravity assist", "Long cruise", "Flyby science", "Relay data home"],
    requiredDeltaV: 16500,
    requiredCapabilities: ["power", "communications", "navigation", "science-payload"],
    minPayloadKg: 900,
    costUsd: 12_000 * M,
    rewardUsd: 18_000 * M,
    reputationReward: 50,
    difficulty: 5,
  },
];

export function missionsForSeason(season: number): MissionDef[] {
  return MISSIONS.filter((m) => m.season <= season);
}
