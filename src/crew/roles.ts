import type { Part, PartCategory } from "../spacecraft/parts";

/** Vite sets BASE_URL in the browser build; the Node server has no import.meta.env, so fall back to the root. */
const BASE: string = import.meta.env?.BASE_URL ?? "/";

export type RoleId = "aerospace" | "propulsion" | "controller" | "science";
/** "all" means the player runs every role and no AI crew is used. */
export type RoleChoice = RoleId | "all";

export interface RoleDef {
  id: RoleId;
  title: string;
  /** Crew member's name. */
  name: string;
  portrait: string;
  tagline: string;
  bio: string;
  color: string;
  duties: string[];
  categories: PartCategory[];
  /** Systems hardware this role is allowed to fit. */
  systemsStyles?: ("tracker" | "imu" | "legs" | "shield")[];
  /** Flight events this role decides. */
  events: string[];
  canBuild: boolean;
  canLaunch: boolean;
}

export const ROLES: readonly RoleDef[] = [
  {
    id: "aerospace",
    title: "Aerospace Engineer",
    name: "Dr. Mira Okafor",
    portrait: `${BASE}crew/mira.jpg`,
    tagline: "Strong, light and ready to fly.",
    bio: "Mira spent twelve years designing launch-vehicle structures. She keeps the bus, the landing gear and the heat shield honest, because every kilogram she saves is delta-v for everyone else.",
    color: "#b8a6e8",
    duties: ["Spacecraft bus and structure", "Landing legs and heat shield", "Approves the build", "Decides atmospheric entry"],
    categories: ["structure"],
    systemsStyles: ["legs", "shield"],
    events: ["entry-heat"],
    canBuild: true,
    canLaunch: false,
  },
  {
    id: "propulsion",
    title: "Propulsion Engineer",
    name: "Kenji Arai",
    portrait: `${BASE}crew/kenji.jpg`,
    tagline: "Every second of thrust counts.",
    bio: "Kenji has tested engines on the stand for two decades. He lives by the rocket equation, and he will happily argue for one more tank or a second engine on the booster.",
    color: "#ef9a6a",
    duties: ["Engines and fuel tanks", "Stage layout and thrust-to-weight", "Delta-v budget", "Decides engine failures"],
    categories: ["tank", "engine"],
    events: ["engine-anomaly"],
    canBuild: false,
    canLaunch: false,
  },
  {
    id: "controller",
    title: "Mission Controller",
    name: "Elena Vasquez",
    portrait: `${BASE}crew/elena.jpg`,
    tagline: "Calm voice. Clear plan.",
    bio: "Elena has called launch, orbit and landing for a dozen missions. She chooses the mission, signs off the launch, controls the pace of the flight and decides course corrections and landing sites.",
    color: "#7fc8ff",
    duties: ["Chooses the mission and launches it", "Controls time during the flight", "Navigation hardware", "Decides course corrections and landings"],
    categories: [],
    systemsStyles: ["tracker", "imu"],
    events: ["nav-error", "landing-hazard"],
    canBuild: false,
    canLaunch: true,
  },
  {
    id: "science",
    title: "Science and Systems Officer",
    name: "Dr. Arjun Rao",
    portrait: `${BASE}crew/arjun.jpg`,
    tagline: "Power, link and discovery.",
    bio: "Arjun is a planetary scientist turned systems engineer. He fits the instruments, panels, batteries and antennas, and he protects the science return when the spacecraft gets into trouble.",
    color: "#8fd6b0",
    duties: ["Science instruments", "Solar panels and batteries", "Antennas and the radio link", "Decides power, link and instrument problems"],
    categories: ["solar", "battery", "antenna", "science"],
    events: ["comm-dropout", "solar-flare", "power-brownout", "instrument-fault"],
    canBuild: false,
    canLaunch: false,
  },
];

export const ROLE_BY_ID: Record<RoleId, RoleDef> = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<RoleId, RoleDef>;

export function canEditPart(role: RoleChoice | null, p: Part): boolean {
  if (role === "all" || role === null) return true;
  const def = ROLE_BY_ID[role];
  if (p.category === "systems") return !!def.systemsStyles?.includes(p.style);
  return def.categories.includes(p.category);
}

export function canBuild(role: RoleChoice | null): boolean {
  return role === "all" || role === null || ROLE_BY_ID[role].canBuild;
}

export function canLaunch(role: RoleChoice | null): boolean {
  return role === "all" || role === null || ROLE_BY_ID[role].canLaunch;
}

/** Which role decides a given flight event. */
export function roleForEvent(eventId: string): RoleId {
  return ROLES.find((r) => r.events.includes(eventId))?.id ?? "controller";
}

/** The role responsible for a part category, used to explain who to ask. */
export function roleForPart(p: Part): RoleId {
  return ROLES.find((r) => canEditPart(r.id, p))?.id ?? "aerospace";
}
