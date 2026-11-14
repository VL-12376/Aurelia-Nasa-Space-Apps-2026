export interface TechDef {
  id: string;
  name: string;
  description: string;
  season: number;
  /** Research points needed to complete. */
  cost: number;
  requires: string[];
  unlocks: string[];
}

export const TECHS: readonly TechDef[] = [
  { id: "basic-structures", name: "Lightweight Structures", description: "Aluminium-lithium frames cut dry mass.", season: 1, cost: 20, requires: [], unlocks: ["Structural bodies"] },
  { id: "liquid-engines", name: "Liquid Propulsion", description: "Throttleable liquid-fuel engines.", season: 1, cost: 30, requires: [], unlocks: ["Liquid engines", "Fuel tanks"] },
  { id: "solar-power", name: "Solar Arrays", description: "Photovoltaic panels for sustained power.", season: 1, cost: 25, requires: [], unlocks: ["Solar panels", "Batteries"] },
  { id: "staging", name: "Multi-stage Rockets", description: "Drop spent mass to gain delta-v.", season: 1, cost: 40, requires: ["liquid-engines"], unlocks: ["Rocket stages"] },
  { id: "comms-uhf", name: "Orbital Communications", description: "Antennas and ground-link protocols.", season: 1, cost: 30, requires: ["solar-power"], unlocks: ["Communication antennas"] },
  { id: "guidance", name: "Inertial Guidance", description: "Gyros and star trackers for navigation.", season: 2, cost: 50, requires: ["comms-uhf"], unlocks: ["Navigation instruments"] },
  { id: "landing-legs", name: "Powered Descent", description: "Throttle control and landing gear for airless worlds.", season: 2, cost: 70, requires: ["staging", "guidance"], unlocks: ["Landing systems"] },
  { id: "science-suite", name: "Science Instrument Suite", description: "Spectrometers, cameras and sensors.", season: 2, cost: 60, requires: ["comms-uhf"], unlocks: ["Scientific payloads"] },
  { id: "heavy-lift", name: "Heavy-Lift Boosters", description: "Large clustered boosters for deep-space missions.", season: 2, cost: 90, requires: ["staging"], unlocks: ["Goliath-1 engine"] },
  { id: "heat-shield", name: "Ablative Heat Shields", description: "Survive atmospheric entry.", season: 3, cost: 90, requires: ["basic-structures", "landing-legs"], unlocks: ["Heat protection"] },
  { id: "deep-space-comms", name: "Deep Space Network", description: "High-gain antennas for long-delay links.", season: 3, cost: 100, requires: ["guidance"], unlocks: ["High-gain antennas"] },
  { id: "ion-drive", name: "Electric Propulsion", description: "Very efficient, low-thrust ion engines.", season: 4, cost: 140, requires: ["solar-power", "liquid-engines"], unlocks: ["Ion engines"] },
  { id: "cryogenic", name: "Advanced Cryogenic Stages", description: "Lighter tanks and higher-efficiency upper-stage engines.", season: 4, cost: 130, requires: ["heavy-lift"], unlocks: ["Tank XXL-5", "Vesper-X engine"] },
  { id: "nuclear-electric", name: "Nuclear-Electric Power", description: "Power far from the Sun.", season: 4, cost: 180, requires: ["ion-drive", "deep-space-comms"], unlocks: ["Nuclear power units"] },
];
