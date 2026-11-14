import type { Capability } from "../missions/missions";

export type PartCategory = "structure" | "tank" | "engine" | "solar" | "battery" | "antenna" | "science" | "systems";
export type Slot = "stage" | "craft";

interface Base {
  id: string;
  name: string;
  category: PartCategory;
  blurb: string;
  /** Dry mass, kg. */
  mass: number;
  /** Cost, USD. */
  cost: number;
  /** Research needed to unlock, or null for the starter set. */
  tech: string | null;
  slot: Slot;
  /** Spacecraft bus slots used (craft parts only). Defaults to 1. */
  slotUse?: number;
}

export interface StructurePart extends Base {
  category: "structure";
  slot: "craft";
  /** Number of components the bus can carry. */
  capacity: number;
  /** Bus diameter, m. */
  size: number;
}
export interface TankPart extends Base {
  category: "tank";
  slot: "stage";
  /** Propellant mass, kg. */
  propellant: number;
  diameter: number;
  height: number;
}
export interface EnginePart extends Base {
  category: "engine";
  slot: "stage";
  thrustVac: number;
  thrustSl: number;
  ispVac: number;
  ispSl: number;
  diameter: number;
  length: number;
}
export interface SolarPart extends Base {
  category: "solar";
  slot: "craft";
  watts: number;
  size: number;
}
export interface BatteryPart extends Base {
  category: "battery";
  slot: "craft";
  wh: number;
}
export interface AntennaPart extends Base {
  category: "antenna";
  slot: "craft";
  /** Maximum useful link distance, million km. */
  rangeMkm: number;
  draw: number;
  style: "patch" | "dish" | "hga";
}
export interface SciencePart extends Base {
  category: "science";
  slot: "craft";
  draw: number;
  style: "camera" | "spectrometer" | "seismometer" | "drill";
}
export interface SystemsPart extends Base {
  category: "systems";
  slot: "craft";
  draw: number;
  capability: Capability;
  style: "tracker" | "imu" | "legs" | "shield";
}

export type Part = StructurePart | TankPart | EnginePart | SolarPart | BatteryPart | AntennaPart | SciencePart | SystemsPart;

const M = 1_000_000;

/**
 * Teaching-grade catalogue. Numbers are plausible for the part class but are game values,
 * not the specifications of any real product.
 */
export const PARTS: readonly Part[] = [
  // Spacecraft buses
  { id: "bus-s", name: "Bus Mk1", category: "structure", blurb: "Compact bus for small satellites.", mass: 120, cost: 3 * M, tech: null, slot: "craft", capacity: 4, size: 0.9 },
  { id: "bus-m", name: "Bus Mk2", category: "structure", blurb: "Mid-size bus with room for a full instrument suite.", mass: 380, cost: 9 * M, tech: null, slot: "craft", capacity: 7, size: 1.4 },
  { id: "bus-l", name: "Bus Mk3", category: "structure", blurb: "Large reinforced bus for landers and orbiters.", mass: 1100, cost: 24 * M, tech: "basic-structures", slot: "craft", capacity: 10, size: 2.0 },

  // Fuel tanks
  { id: "tank-s", name: "Tank S-1", category: "tank", blurb: "Small tank, 3 t of propellant.", mass: 260, cost: 4 * M, tech: null, slot: "stage", propellant: 3_000, diameter: 1.2, height: 2.0 },
  { id: "tank-m", name: "Tank M-2", category: "tank", blurb: "Medium tank, 14 t of propellant.", mass: 1_100, cost: 14 * M, tech: null, slot: "stage", propellant: 14_000, diameter: 2.0, height: 4.0 },
  { id: "tank-l", name: "Tank L-3", category: "tank", blurb: "Large tank, 48 t of propellant.", mass: 3_500, cost: 38 * M, tech: null, slot: "stage", propellant: 48_000, diameter: 3.0, height: 6.0 },
  { id: "tank-xl", name: "Tank XL-4", category: "tank", blurb: "Heavy tank, 120 t of propellant.", mass: 8_000, cost: 85 * M, tech: "staging", slot: "stage", propellant: 120_000, diameter: 4.0, height: 8.0 },
  { id: "tank-xxl", name: "Tank XXL-5", category: "tank", blurb: "Very large lightweight tank, 300 t of propellant.", mass: 15_000, cost: 190 * M, tech: "cryogenic", slot: "stage", propellant: 300_000, diameter: 5.0, height: 10.0 },

  // Engines
  { id: "ember-1", name: "Ember-1", category: "engine", blurb: "Small pressure-fed engine, ideal for upper stages.", mass: 90, cost: 9 * M, tech: null, slot: "stage", thrustVac: 24_000, thrustSl: 20_000, ispVac: 315, ispSl: 270, diameter: 0.45, length: 0.7 },
  { id: "kestrel-1", name: "Kestrel-1", category: "engine", blurb: "Kerosene/oxygen booster engine.", mass: 1_250, cost: 52 * M, tech: null, slot: "stage", thrustVac: 520_000, thrustSl: 450_000, ispVac: 310, ispSl: 275, diameter: 1.1, length: 2.0 },
  { id: "kestrel-v", name: "Kestrel-V", category: "engine", blurb: "Vacuum-optimised bell. Efficient but cannot lift off alone.", mass: 520, cost: 38 * M, tech: "liquid-engines", slot: "stage", thrustVac: 180_000, thrustSl: 0, ispVac: 345, ispSl: 0, diameter: 1.4, length: 2.2 },
  { id: "vesper", name: "Vesper-H2", category: "engine", blurb: "Hydrogen/oxygen upper-stage engine with top efficiency.", mass: 300, cost: 44 * M, tech: "staging", slot: "stage", thrustVac: 110_000, thrustSl: 0, ispVac: 450, ispSl: 0, diameter: 1.0, length: 2.6 },
  { id: "vesper-x", name: "Vesper-X", category: "engine", blurb: "Advanced hydrogen upper-stage engine: more thrust and efficiency.", mass: 700, cost: 120 * M, tech: "cryogenic", slot: "stage", thrustVac: 420_000, thrustSl: 0, ispVac: 465, ispSl: 0, diameter: 1.6, length: 3.2 },
  { id: "goliath-1", name: "Goliath-1", category: "engine", blurb: "Very large kerosene/oxygen booster for deep-space launches.", mass: 5_200, cost: 190 * M, tech: "heavy-lift", slot: "stage", thrustVac: 2_000_000, thrustSl: 1_800_000, ispVac: 312, ispSl: 278, diameter: 2.4, length: 3.4 },

  // Solar panels
  { id: "solar-s", name: "Panel S", category: "solar", blurb: "Compact array, 300 W.", mass: 14, cost: 3 * M, tech: null, slot: "craft", watts: 300, size: 1 },
  { id: "solar-m", name: "Panel M", category: "solar", blurb: "Deployable wing, 1.2 kW.", mass: 48, cost: 9 * M, tech: null, slot: "craft", watts: 1_200, size: 2 },
  { id: "solar-l", name: "Panel L", category: "solar", blurb: "Large wing, 4 kW.", mass: 150, cost: 24 * M, tech: "solar-power", slot: "craft", watts: 4_000, size: 3 },

  // Batteries
  { id: "bat-s", name: "Cell S", category: "battery", blurb: "600 Wh storage.", mass: 8, cost: 2 * M, tech: null, slot: "craft", wh: 600 },
  { id: "bat-m", name: "Cell M", category: "battery", blurb: "2.4 kWh storage.", mass: 30, cost: 6 * M, tech: null, slot: "craft", wh: 2_400 },
  { id: "bat-l", name: "Cell L", category: "battery", blurb: "9.6 kWh storage.", mass: 110, cost: 18 * M, tech: "solar-power", slot: "craft", wh: 9_600 },

  // Antennas
  { id: "ant-uhf", name: "UHF patch", category: "antenna", blurb: "Low-gain link. Enough for Earth orbit and the Moon.", mass: 3, cost: 2 * M, tech: null, slot: "craft", rangeMkm: 0.6, draw: 8, style: "patch" },
  { id: "ant-dish", name: "S-band dish", category: "antenna", blurb: "Steerable dish for links across tens of millions of km.", mass: 22, cost: 12 * M, tech: "comms-uhf", slot: "craft", rangeMkm: 60, draw: 25, style: "dish" },
  { id: "ant-hga", name: "High-gain antenna", category: "antenna", blurb: "Large dish for interplanetary distances.", mass: 55, cost: 40 * M, tech: "deep-space-comms", slot: "craft", rangeMkm: 6_000, draw: 60, style: "hga" },

  // Scientific payloads
  { id: "sci-cam", name: "Imaging camera", category: "science", blurb: "Visible-light camera for mapping and discovery.", mass: 22, cost: 14 * M, tech: null, slot: "craft", draw: 35, style: "camera" },
  { id: "sci-spec", name: "Spectrometer", category: "science", blurb: "Reads the chemistry of surfaces and atmospheres.", mass: 45, cost: 38 * M, tech: "science-suite", slot: "craft", draw: 60, style: "spectrometer" },
  { id: "sci-seis", name: "Seismometer", category: "science", blurb: "Listens for quakes to probe a world's interior.", mass: 30, cost: 30 * M, tech: "science-suite", slot: "craft", draw: 20, style: "seismometer" },
  { id: "sci-drill", name: "Sample drill", category: "science", blurb: "Cores and seals rock samples.", mass: 120, cost: 85 * M, tech: "science-suite", slot: "craft", draw: 90, style: "drill" },

  // Systems
  { id: "nav-star", name: "Star tracker", category: "systems", blurb: "Finds attitude from the stars. Basic navigation.", mass: 6, cost: 6 * M, tech: null, slot: "craft", draw: 10, capability: "navigation", style: "tracker" },
  { id: "nav-imu", name: "Inertial platform", category: "systems", blurb: "Precise navigation through manoeuvres.", mass: 18, cost: 24 * M, tech: "guidance", slot: "craft", draw: 25, capability: "navigation", style: "imu" },
  { id: "sys-legs", name: "Landing legs", category: "systems", blurb: "Absorb touchdown. Mounted outside the bus.", mass: 85, cost: 18 * M, tech: "landing-legs", slot: "craft", draw: 0, capability: "landing", style: "legs", slotUse: 0 },
  { id: "sys-shield", name: "Ablative heat shield", category: "systems", blurb: "Burns away to carry heat off during entry.", mass: 220, cost: 45 * M, tech: "heat-shield", slot: "craft", draw: 0, capability: "heat-shield", style: "shield", slotUse: 0 },
];

export const PART_BY_ID: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.id, p]));

export interface CategoryMeta {
  id: PartCategory;
  label: string;
  /** SVG path data on a 24x24 grid. */
  icon: string;
}

export const CATEGORIES: readonly CategoryMeta[] = [
  { id: "structure", label: "Structures", icon: "M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2zm0 5l-3.5 2v4L12 15l3.5-2V9L12 7z" },
  { id: "tank", label: "Fuel tanks", icon: "M8 4h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2zm0 6h8" },
  { id: "engine", label: "Engines", icon: "M9 3h6v5l3 3v2l-2 7H8l-2-7v-2l3-3V3z" },
  { id: "solar", label: "Solar panels", icon: "M3 8h8v8H3zM13 8h8v8h-8zM7 8v8M17 8v8M3 12h8M13 12h8M12 12h1" },
  { id: "battery", label: "Batteries", icon: "M5 8h12v8H5zM17 10.5h2v3h-2zM8 10v4M11 10v4" },
  { id: "antenna", label: "Antennas", icon: "M4 6a10 10 0 0110 10M4 11a5 5 0 015 5M4 16h.01M18 4l-5 7" },
  { id: "science", label: "Science payloads", icon: "M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3M8 15h8" },
  { id: "systems", label: "Systems", icon: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" },
];

export function partsInCategory(cat: PartCategory): Part[] {
  return PARTS.filter((p) => p.category === cat);
}
