import { MISSIONS, type MissionDef } from "../missions/missions";
import { EARTH_G, heliocentricTransfer, lunarTransfer, type TransferEstimate } from "./transfer";

export type BodyId = "sun" | "mercury" | "venus" | "earth" | "moon" | "mars" | "ceres" | "jupiter" | "saturn" | "uranus" | "neptune";
export type BodyKind = "star" | "rocky planet" | "dwarf planet" | "moon" | "gas giant" | "ice giant";

export interface Opportunity {
  title: string;
  status: "campaign" | "concept";
  text: string;
}

/**
 * Real, rounded planetary measurements (reference values; surface gravity for gas and ice
 * giants is quoted at the 1 bar pressure level). Nothing in this block is a game invention.
 */
export interface BodyInfo {
  id: BodyId;
  name: string;
  kind: BodyKind;
  summary: string;
  radiusKm: number;
  gravity: number; // m/s^2
  escapeKms: number;
  /** Mean distance from the Sun, AU (for the Moon: 1, with the Earth distance given in distanceNote). */
  semiMajorAu: number;
  distanceNote: string;
  orbitalPeriod: string;
  rotation: string;
  moons: string;
  temperature: string;
  atmosphere: { summary: string; pressure: string; composition: string };
  opportunities: Opportunity[];
}

export const BODY_ORDER: BodyId[] = ["sun", "mercury", "venus", "earth", "moon", "mars", "ceres", "jupiter", "saturn", "uranus", "neptune"];

export const BODY_INFO: Record<BodyId, BodyInfo> = {
  sun: {
    id: "sun", name: "Sun", kind: "star",
    summary: "The star at the centre of the Solar System. It holds about 99.8% of the system's mass and powers every solar panel AURELIA flies.",
    radiusKm: 695_700, gravity: 274, escapeKms: 617.5, semiMajorAu: 0, distanceNote: "Centre of the Solar System",
    orbitalPeriod: "Orbits the galactic centre in about 230 million years", rotation: "About 25 days at the equator",
    moons: "8 planets in orbit", temperature: "Surface about 5,500 °C; core about 15 million °C",
    atmosphere: { summary: "A hot plasma atmosphere with no solid surface.", pressure: "Not applicable", composition: "About 73% hydrogen, 25% helium" },
    opportunities: [{ title: "Solar observatory", status: "concept", text: "Close solar passes need heavy heat shielding. Not in the current campaign." }],
  },
  mercury: {
    id: "mercury", name: "Mercury", kind: "rocky planet",
    summary: "The smallest planet and the closest to the Sun. Its surface is cratered like the Moon, with extreme temperature swings.",
    radiusKm: 2_439.7, gravity: 3.70, escapeKms: 4.25, semiMajorAu: 0.387, distanceNote: "57.9 million km from the Sun",
    orbitalPeriod: "88 days", rotation: "58.6 days (one solar day lasts 176 Earth days)",
    moons: "None", temperature: "-180 °C at night to 430 °C by day",
    atmosphere: { summary: "A very thin exosphere of atoms blasted off the surface. It cannot hold heat or support weather.", pressure: "Almost none (about a trillionth of Earth's)", composition: "Oxygen, sodium, hydrogen, helium (traces)" },
    opportunities: [{ title: "Orbiter", status: "concept", text: "Reaching Mercury means shedding a lot of speed against the Sun's gravity. Not in the current campaign." }],
  },
  venus: {
    id: "venus", name: "Venus", kind: "rocky planet",
    summary: "Similar in size to Earth, but a runaway greenhouse effect makes it the hottest planet. Clouds of sulphuric acid hide the surface.",
    radiusKm: 6_051.8, gravity: 8.87, escapeKms: 10.36, semiMajorAu: 0.723, distanceNote: "108.2 million km from the Sun",
    orbitalPeriod: "224.7 days", rotation: "243 days, spinning backwards (retrograde)",
    moons: "None", temperature: "About 465 °C at the surface",
    atmosphere: { summary: "Extremely dense carbon dioxide atmosphere. Surface pressure is like being 900 m under the ocean.", pressure: "About 92 times Earth's", composition: "96.5% carbon dioxide, 3.5% nitrogen" },
    opportunities: [{ title: "Atmospheric probe", status: "concept", text: "Landers survive only hours in the heat and pressure. Not in the current campaign." }],
  },
  earth: {
    id: "earth", name: "Earth", kind: "rocky planet",
    summary: "Our home world and the only place known to host life. AURELIA's launch sites, tracking stations and Season 1 missions are all here.",
    radiusKm: 6_371, gravity: 9.80665, escapeKms: 11.19, semiMajorAu: 1, distanceNote: "149.6 million km from the Sun (1 AU)",
    orbitalPeriod: "365.25 days", rotation: "23 h 56 min",
    moons: "1 (the Moon)", temperature: "Average about 15 °C",
    atmosphere: { summary: "A nitrogen and oxygen atmosphere that supports life, and that rockets must climb through and spacecraft must fall back through.", pressure: "1.013 bar at sea level", composition: "78% nitrogen, 21% oxygen, 0.9% argon" },
    opportunities: [],
  },
  moon: {
    id: "moon", name: "Moon", kind: "moon",
    summary: "Earth's only natural satellite, about a quarter of Earth's diameter. It is tidally locked, always showing the same face to Earth.",
    radiusKm: 1_737.4, gravity: 1.62, escapeKms: 2.38, semiMajorAu: 1, distanceNote: "384,400 km from Earth on average",
    orbitalPeriod: "27.3 days around Earth", rotation: "27.3 days (tidally locked)",
    moons: "None", temperature: "-173 °C at night to 127 °C by day",
    atmosphere: { summary: "No real atmosphere, only a trace exosphere. With no air to brake in, landers must slow down using engines alone.", pressure: "Effectively a vacuum", composition: "Traces of helium, neon, argon" },
    opportunities: [],
  },
  mars: {
    id: "mars", name: "Mars", kind: "rocky planet",
    summary: "A cold desert world with the tallest volcano and the deepest canyon known in the Solar System. Past rivers and lakes make it a top target for science.",
    radiusKm: 3_389.5, gravity: 3.71, escapeKms: 5.03, semiMajorAu: 1.524, distanceNote: "227.9 million km from the Sun",
    orbitalPeriod: "687 days (1.88 years)", rotation: "24 h 37 min",
    moons: "2 (Phobos and Deimos)", temperature: "Average about -63 °C",
    atmosphere: { summary: "A thin carbon dioxide atmosphere. It is enough to heat a capsule on entry, and to allow parachutes, but not enough to land safely without engines.", pressure: "About 0.6% of Earth's", composition: "95% carbon dioxide, 2.8% nitrogen, 2% argon" },
    opportunities: [],
  },
  ceres: {
    id: "ceres", name: "Ceres", kind: "dwarf planet",
    summary: "The largest object in the asteroid belt and the only dwarf planet in the inner Solar System. It likely holds a lot of water ice and salty brines.",
    radiusKm: 469.7, gravity: 0.28, escapeKms: 0.51, semiMajorAu: 2.77, distanceNote: "413.7 million km from the Sun",
    orbitalPeriod: "4.6 years", rotation: "9.1 hours",
    moons: "None", temperature: "About -105 °C",
    atmosphere: { summary: "No stable atmosphere. Occasional traces of water vapour have been detected.", pressure: "Effectively a vacuum", composition: "None established" },
    opportunities: [{ title: "Asteroid belt survey", status: "concept", text: "Low gravity makes landing easy, but the trip is long. Not in the current campaign." }],
  },
  jupiter: {
    id: "jupiter", name: "Jupiter", kind: "gas giant",
    summary: "The largest planet, with more than twice the mass of all other planets combined. Its Great Red Spot is a storm wider than Earth.",
    radiusKm: 69_911, gravity: 24.79, escapeKms: 59.5, semiMajorAu: 5.203, distanceNote: "778.5 million km from the Sun",
    orbitalPeriod: "11.9 years", rotation: "9 h 56 min",
    moons: "More than 90 known", temperature: "About -108 °C at the 1 bar level",
    atmosphere: { summary: "A deep hydrogen and helium atmosphere with banded clouds and giant storms. There is no solid surface to land on.", pressure: "Gravity value is quoted at the 1 bar level", composition: "About 90% hydrogen, 10% helium" },
    opportunities: [{ title: "Horizon Probe flyby", status: "campaign", text: "The Season 4 deep-space probe can reach the outer Solar System." }],
  },
  saturn: {
    id: "saturn", name: "Saturn", kind: "gas giant",
    summary: "Famous for its bright rings of water ice. It is the least dense planet: it would float if there were a bathtub big enough.",
    radiusKm: 58_232, gravity: 10.44, escapeKms: 35.5, semiMajorAu: 9.537, distanceNote: "1,434 million km from the Sun",
    orbitalPeriod: "29.5 years", rotation: "10 h 34 min",
    moons: "More than 140 known", temperature: "About -139 °C at the 1 bar level",
    atmosphere: { summary: "A hydrogen and helium atmosphere with faint bands and powerful jet streams.", pressure: "Gravity value is quoted at the 1 bar level", composition: "About 96% hydrogen, 3% helium" },
    opportunities: [{ title: "Horizon Probe flyby", status: "campaign", text: "The Season 4 deep-space probe can reach the outer Solar System." }],
  },
  uranus: {
    id: "uranus", name: "Uranus", kind: "ice giant",
    summary: "An ice giant tipped on its side, rolling around the Sun with a 98° axial tilt. Methane in the atmosphere gives it a pale cyan colour.",
    radiusKm: 25_362, gravity: 8.69, escapeKms: 21.3, semiMajorAu: 19.19, distanceNote: "2,871 million km from the Sun",
    orbitalPeriod: "84 years", rotation: "17 h 14 min, retrograde",
    moons: "28 known", temperature: "About -195 °C at the 1 bar level",
    atmosphere: { summary: "A cold hydrogen, helium and methane atmosphere over a deep icy interior.", pressure: "Gravity value is quoted at the 1 bar level", composition: "83% hydrogen, 15% helium, 2% methane" },
    opportunities: [{ title: "Horizon Probe flyby", status: "campaign", text: "A long Season 4 cruise could pass close enough for science." }],
  },
  neptune: {
    id: "neptune", name: "Neptune", kind: "ice giant",
    summary: "The most distant planet, dark, cold and windy. Its winds exceed 2,000 km/h, the fastest measured in the Solar System.",
    radiusKm: 24_622, gravity: 11.15, escapeKms: 23.5, semiMajorAu: 30.07, distanceNote: "4,498 million km from the Sun",
    orbitalPeriod: "165 years", rotation: "16 h 6 min",
    moons: "16 known", temperature: "About -201 °C at the 1 bar level",
    atmosphere: { summary: "A hydrogen, helium and methane atmosphere with the most violent winds of any planet.", pressure: "Gravity value is quoted at the 1 bar level", composition: "80% hydrogen, 19% helium, 1.5% methane" },
    opportunities: [{ title: "Distant flyby", status: "concept", text: "Travel takes more than a decade even with a gravity assist. Beyond the current campaign." }],
  },
};

function destinationBodies(m: MissionDef): BodyId[] {
  const d = m.destination.toLowerCase();
  if (d.includes("moon")) return ["moon"];
  if (d.includes("mars")) return ["mars"];
  if (d.includes("earth") || d.includes("sun-synchronous")) return ["earth"];
  if (d.includes("outer")) return ["jupiter", "saturn", "uranus", "neptune"];
  return [];
}

export function missionsForBody(id: BodyId): MissionDef[] {
  return MISSIONS.filter((m) => destinationBodies(m).includes(id));
}

export function relativeGravity(info: BodyInfo): number {
  return info.gravity / EARTH_G;
}

/** Game model: simplified trip from low Earth orbit. Not available for the Sun or for Earth itself. */
export function transferTo(id: BodyId): TransferEstimate | null {
  if (id === "sun" || id === "earth") return null;
  if (id === "moon") return lunarTransfer();
  return heliocentricTransfer(BODY_INFO[id].semiMajorAu);
}
