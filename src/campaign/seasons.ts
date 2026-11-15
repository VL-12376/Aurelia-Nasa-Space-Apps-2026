export interface Season {
  id: number;
  name: string;
  summary: string;
  goals: string[];
}

export const SEASONS: readonly Season[] = [
  {
    id: 1,
    name: "Earth Operations",
    summary: "Establish AURELIA and master the fundamentals of spacecraft engineering.",
    goals: [
      "Establish the AURELIA agency",
      "Learn spacecraft engineering fundamentals",
      "Build basic spacecraft",
      "Fly satellite and low Earth orbit missions",
      "Study Earth's gravity and orbital motion",
    ],
  },
  {
    id: 2,
    name: "Lunar Expedition",
    summary: "Reach the Moon with orbiters, robotic landers and science instruments.",
    goals: [
      "Develop Moon-capable spacecraft",
      "Study lunar gravity and surface conditions",
      "Complete lunar orbital missions",
      "Conduct robotic landings",
      "Deploy scientific instruments",
    ],
  },
  {
    id: 3,
    name: "Mars Initiative",
    summary: "Plan interplanetary missions and explore Mars.",
    goals: [
      "Plan interplanetary missions",
      "Study transfer trajectories and travel time",
      "Manage fuel and spacecraft resources",
      "Develop Mars orbiters and landers",
      "Fly a crewed-style lunar flyby and bring the capsule home through the atmosphere",
      "Conduct scientific exploration of Mars",
    ],
  },
  {
    id: 4,
    name: "Beyond the Frontier",
    summary: "Push to distant destinations with advanced propulsion and systems.",
    goals: [
      "Explore more distant destinations",
      "Develop advanced propulsion and systems",
      "Complete challenging scientific missions",
      "Unlock advanced technologies",
    ],
  },
];
