/**
 * Real reference data used across the game and the Academy.
 *
 * Everything here comes from NASA and JPL public sources, rounded for teaching. Where a value is
 * approximate it says so. Nothing in this file is invented. AURELIA is an independent game and is
 * not affiliated with or endorsed by NASA.
 */

export const SOURCES = [
  { name: "NASA/JPL Horizons System", use: "Live position of the Moon", url: "https://ssd.jpl.nasa.gov/horizons/" },
  { name: "NASA/JPL SBDB Close-Approach Data API", use: "Live asteroid close approaches", url: "https://ssd-api.jpl.nasa.gov/doc/cad.html" },
  { name: "NASA NSSDCA Planetary Fact Sheets", use: "Planet and Moon measurements", url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/" },
  { name: "NASA General Mission Analysis Tool (GMAT)", use: "How real trajectories are designed", url: "https://software.nasa.gov/software/GSC-19468-1" },
  { name: "JPL Concept Maturity Levels (Wessen et al., 2013, AIAA)", use: "The step-by-step path a mission concept follows", url: "https://dataverse.jpl.nasa.gov/dataset.xhtml?persistentId=hdl:2014/44299" },
  { name: "NASA Goddard Mission Design Lab", use: "How teams design a mission together", url: "https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/" },
  { name: "NASA Web-based Space Mission Visualization", use: "Orbit and transfer visualisation ideas", url: "https://nasa.github.io/mission-viz/" },
  { name: "NASA Webb: Build It Yourself", use: "Science requirements drive spacecraft design", url: "https://science.nasa.gov/mission/webb/game-build-it-yourself/" },
  { name: "NASA Apollo 11 Flight Journal and mission reports", use: "Launch and mission event times", url: "https://www.nasa.gov/history/afj/ap11fj/index.html" },
] as const;

export const DISCLAIMER = "Contains data from NASA and JPL public sources. AURELIA is an independent game and is not affiliated with or endorsed by NASA.";

/* ------------------------------------------------------------------ */
/* How a real mission matures: JPL Concept Maturity Levels (CML)        */
/* ------------------------------------------------------------------ */

export interface MaturityLevel {
  level: number;
  name: string;
  /** What a real team has achieved at this level. */
  real: string;
  /** What you do in AURELIA at the same stage. */
  game: string;
  where: "briefing" | "academy" | "hangar" | "control";
}

export const MATURITY: MaturityLevel[] = [
  { level: 1, name: "Cocktail napkin", real: "A sketch of the idea: what do we want to learn, and where do we go?", game: "Read a mission briefing and decide which mission to attempt.", where: "briefing" },
  { level: 2, name: "Initial feasibility", real: "Back-of-the-envelope maths shows the idea is not impossible: how much delta-v, how much mass?", game: "Check the delta-v budget and use the rocket equation to see if a rocket could do it.", where: "academy" },
  { level: 3, name: "Trade space", real: "Compare many options (bigger tank or more engines, one stage or two) and learn which choices matter.", game: "Try different tanks, engines and stages in the Hangar and watch the numbers change.", where: "hangar" },
  { level: 4, name: "Point design", real: "One complete design with mass, power and cost estimates. At NASA Goddard this is what a Mission Design Lab study produces.", game: "Finish a design that meets every check, then build it.", where: "hangar" },
  { level: 5, name: "Concept baseline", real: "The design is checked against requirements, with margins held in reserve for surprises.", game: "Pass every launch check and keep spare delta-v and budget.", where: "briefing" },
  { level: 6, name: "Flight", real: "After formal design reviews the spacecraft is built, launched and operated.", game: "Launch, fly the mission and make decisions when things go wrong.", where: "control" },
];

/* ------------------------------------------------------------------ */
/* Delta-v: the "price list" for moving around the Solar System        */
/* ------------------------------------------------------------------ */

export interface DeltaVLeg {
  id: string;
  label: string;
  kms: number;
  note: string;
}

/** Commonly used mission-design values (rounded). Real missions vary with the orbit chosen. */
export const DELTA_V_MAP: DeltaVLeg[] = [
  { id: "launch", label: "Earth surface to low Earth orbit", kms: 9.4, note: "7.8 km/s of orbital speed plus about 1.6 km/s lost to gravity and air drag on the way up." },
  { id: "tli", label: "Low Earth orbit to the Moon (trans-lunar injection)", kms: 3.1, note: "Apollo's third stage burned about 6 minutes to do this." },
  { id: "loi", label: "Capture into lunar orbit", kms: 0.9, note: "Apollo 11 braked for about 6 minutes to be captured by the Moon." },
  { id: "descent", label: "Lunar orbit to the surface", kms: 1.7, note: "A powered landing, because the Moon has no air to help." },
  { id: "ascent", label: "Lunar surface to lunar orbit", kms: 1.9, note: "The only way home is to climb back up." },
  { id: "tei", label: "Lunar orbit back toward Earth", kms: 1.0, note: "Apollo's trans-Earth injection burn." },
  { id: "tmi", label: "Low Earth orbit to Mars (trans-Mars injection)", kms: 3.6, note: "Can only be done in the right launch window, about every 26 months." },
  { id: "moi", label: "Capture into Mars orbit", kms: 2.1, note: "Anywhere from about 0.9 to 2.1 km/s depending on the orbit chosen." },
  { id: "escape", label: "Low Earth orbit to leaving Earth entirely", kms: 3.2, note: "Earth escape speed from 300 km up is about 10.9 km/s, and orbit already gives 7.7." },
];

/* ------------------------------------------------------------------ */
/* Real launch vehicles                                                */
/* ------------------------------------------------------------------ */

export interface RealStage {
  name: string;
  engines: string;
  /** Propellant, tonnes. */
  propellantT: number;
  /** Empty (dry) mass, tonnes. */
  dryT: number;
  /** Specific impulse used for the estimate, seconds. */
  isp: number;
  /** Vacuum thrust, MN (stage total). */
  thrustMN: number;
}

export interface RealVehicle {
  id: string;
  name: string;
  program: string;
  heightM: number;
  liftoffMassT: number;
  liftoffThrustMN: number;
  leoT: number;
  /** Mass sent toward the Moon, if the vehicle did that. */
  tliT?: number;
  blurb: string;
  stages?: RealStage[];
  /** Mass carried above the last stage in the stage table, tonnes. */
  payloadT?: number;
}

export const REAL_VEHICLES: RealVehicle[] = [
  {
    id: "saturn-v", name: "Saturn V", program: "Apollo", heightM: 110.6, liftoffMassT: 2_970, liftoffThrustMN: 34.5, leoT: 140, tliT: 48.6,
    blurb: "The only rocket that has sent people beyond low Earth orbit. Three stages, 13 engines, 13 flights between 1967 and 1973.",
    payloadT: 50,
    stages: [
      { name: "S-IC (first stage)", engines: "5 × F-1, kerosene and liquid oxygen", propellantT: 2_150, dryT: 135, isp: 282, thrustMN: 38 },
      { name: "S-II (second stage)", engines: "5 × J-2, liquid hydrogen and liquid oxygen", propellantT: 460, dryT: 36, isp: 421, thrustMN: 5.1 },
      { name: "S-IVB (third stage)", engines: "1 × J-2, liquid hydrogen and liquid oxygen", propellantT: 106, dryT: 13.5, isp: 421, thrustMN: 1.0 },
    ],
  },
  { id: "shuttle", name: "Space Shuttle", program: "Space Shuttle", heightM: 56, liftoffMassT: 2_030, liftoffThrustMN: 30.2, leoT: 27.5, blurb: "The first reusable orbital vehicle: two solid boosters and three main engines fed from an external tank. 135 flights from 1981 to 2011." },
  { id: "sls", name: "Space Launch System Block 1", program: "Artemis", heightM: 98, liftoffMassT: 2_600, liftoffThrustMN: 39.1, leoT: 95, tliT: 27, blurb: "NASA's current heavy launcher for Artemis. Its first flight, Artemis I, launched on 16 November 2022." },
];

/** Ideal (no gravity or drag loss) speed change of a stage stack, km/s, by the rocket equation. */
export function stackDeltaV(stages: RealStage[], payloadT: number): { perStage: number[]; total: number } {
  const perStage: number[] = [];
  for (let i = 0; i < stages.length; i++) {
    const above = stages.slice(i + 1).reduce((n, s) => n + s.propellantT + s.dryT, 0) + payloadT;
    const m0 = stages[i].propellantT + stages[i].dryT + above;
    const mf = m0 - stages[i].propellantT;
    perStage.push((stages[i].isp * 9.80665 * Math.log(m0 / mf)) / 1000);
  }
  return { perStage, total: perStage.reduce((a, b) => a + b, 0) };
}

/* ------------------------------------------------------------------ */
/* Apollo 11: a real launch and mission, event by event                */
/* ------------------------------------------------------------------ */

export interface RealEvent {
  /** Seconds since liftoff. */
  t: number;
  label: string;
  explain: string;
}

/** Approximate times from the Apollo 11 mission report and Flight Journal. */
export const APOLLO11_ASCENT: RealEvent[] = [
  { t: -9, label: "Ignition sequence starts", explain: "The five F-1 engines light one after another while the rocket is still held down, so the computers can check each one before release." },
  { t: 0, label: "Liftoff", explain: "Thrust now exceeds weight. The Saturn V's 2,970 tonnes begin to rise, slowly at first, burning about 13 tonnes of propellant every second." },
  { t: 12, label: "Tower cleared", explain: "The rocket is high enough to clear the launch tower and begins to roll and pitch toward its flight direction (east, to use Earth's spin)." },
  { t: 83, label: "Max Q", explain: "Maximum dynamic pressure: the rocket is fast enough and the air still thick enough to push on it with about 35 kilopascals. The structure is at its most stressed." },
  { t: 135, label: "Centre engine cut off", explain: "One of the five engines shuts down to keep acceleration from rising too high as the rocket gets lighter." },
  { t: 162, label: "First stage separation", explain: "The empty first stage (135 tonnes of dead weight) is dropped. The rocket is about 67 km up and moving at roughly 2.4 km/s." },
  { t: 164, label: "Second stage ignites", explain: "Five J-2 engines light. Staging works because you stop carrying the empty tank." },
  { t: 198, label: "Launch escape tower jettisoned", explain: "Above the thick air, the emergency escape rocket is no longer needed and is dropped to save mass." },
  { t: 548, label: "Second stage cut off", explain: "The second stage has delivered nearly all the speed needed. It is dropped and the third stage takes over." },
  { t: 700, label: "Orbit reached", explain: "About 185 km up, moving at roughly 7.8 km/s sideways. The crew is in orbit and has time to check everything before committing to the Moon." },
];

export const APOLLO11_MISSION: RealEvent[] = [
  { t: 0, label: "Launch (16 July 1969)", explain: "Saturn V from Kennedy Space Center, 13:32 UTC." },
  { t: 2 * 3600 + 44 * 60, label: "Trans-lunar injection", explain: "Third-stage burn of about 6 minutes adds roughly 3.1 km/s and sends the spacecraft toward the Moon." },
  { t: 75 * 3600 + 50 * 60, label: "Lunar orbit insertion", explain: "A braking burn of about 6 minutes lets the Moon capture the spacecraft." },
  { t: 102 * 3600 + 46 * 60, label: "Landing at Tranquility Base", explain: "Eagle touches down on 20 July at about 20:17 UTC, about 3 days after launch." },
  { t: 195 * 3600 + 19 * 60, label: "Splashdown", explain: "The Command Module returns to the Pacific on 24 July, after 8 days." },
];

/* ------------------------------------------------------------------ */
/* Real missions: what happened and what to notice                     */
/* ------------------------------------------------------------------ */

export interface RealMission {
  id: string;
  name: string;
  year: string;
  vehicle: string;
  destination: string;
  facts: [string, string][];
  notice: string;
}

export const REAL_MISSIONS: RealMission[] = [
  {
    id: "apollo11", name: "Apollo 11", year: "1969", vehicle: "Saturn V", destination: "The Moon (landing)",
    facts: [["Launch", "16 July 1969"], ["Landing", "20 July 1969, Sea of Tranquility"], ["Duration", "8 days, 3 hours, 18 minutes"], ["Time on the surface", "About 21.5 hours"]],
    notice: "A direct trip took about 3 days because the trajectory was planned precisely, with only small mid-course corrections.",
  },
  {
    id: "artemis1", name: "Artemis I", year: "2022", vehicle: "Space Launch System", destination: "Lunar distant retrograde orbit",
    facts: [["Launch", "16 November 2022"], ["Duration", "About 25.5 days"], ["Closest to the Moon", "About 130 km"], ["Farthest from Earth", "About 432,000 km, a record for a crew-rated capsule"]],
    notice: "An uncrewed test: engineers learn how the vehicle behaves before people fly on it.",
  },
  {
    id: "perseverance", name: "Mars 2020 Perseverance", year: "2020", vehicle: "Atlas V 541", destination: "Mars, Jezero Crater",
    facts: [["Launch", "30 July 2020"], ["Landing", "18 February 2021"], ["Flight time", "About 203 days"], ["Distance travelled", "About 470 million km"]],
    notice: "It left in a launch window that opens only about every 26 months, when Earth and Mars are lined up for the cheapest transfer.",
  },
  {
    id: "voyager1", name: "Voyager 1", year: "1977", vehicle: "Titan IIIE-Centaur", destination: "Interstellar space",
    facts: [["Launch", "5 September 1977"], ["Jupiter flyby", "5 March 1979"], ["Saturn flyby", "12 November 1980"], ["Interstellar space", "Crossed into it in 2012"]],
    notice: "Gravity assists from Jupiter and Saturn gave it speed for free, using planets as slingshots.",
  },
  {
    id: "webb", name: "James Webb Space Telescope", year: "2021", vehicle: "Ariane 5", destination: "Sun–Earth L2 point",
    facts: [["Launch", "25 December 2021"], ["Arrival at L2", "About 30 days later"], ["Distance", "About 1.5 million km from Earth"], ["Mirror", "6.5 m across, 18 gold-coated segments"]],
    notice: "Science requirements drove the design: infrared astronomy needs a very cold telescope, so it carries a five-layer sunshield.",
  },
];

/** A real mission that matches each AURELIA mission. */
export interface RealParallel {
  mission: string;
  name: string;
  year: string;
  vehicle: string;
  text: string;
  facts: [string, string][];
}

export const REAL_PARALLELS: Record<string, RealParallel> = {
  "s1-first-satellite": {
    mission: "Explorer 1", name: "Explorer 1", year: "1958", vehicle: "Juno I (Jupiter-C)",
    text: "The first US satellite. It weighed only 14 kg, yet its instrument discovered the Van Allen radiation belts around Earth.",
    facts: [["Launched", "31 January 1958"], ["Mass", "About 14 kg"], ["Orbit", "About 360 × 2,500 km"]],
  },
  "s1-earth-watch": {
    mission: "Landsat 9", name: "Landsat 9", year: "2021", vehicle: "Atlas V 401",
    text: "Landsat satellites have photographed the whole Earth every 16 days for decades, in a sun-synchronous orbit so every picture has similar lighting.",
    facts: [["Launched", "27 September 2021"], ["Altitude", "About 705 km"], ["Repeat cycle", "16 days"]],
  },
  "s2-lunar-orbiter": {
    mission: "Lunar Reconnaissance Orbiter", name: "Lunar Reconnaissance Orbiter", year: "2009", vehicle: "Atlas V 401",
    text: "LRO has mapped the Moon in detail, including Apollo landing sites and shadowed polar craters that may hold water ice.",
    facts: [["Launched", "18 June 2009"], ["Reached the Moon", "5 days later"], ["Orbit", "Polar, about 50 km up"]],
  },
  "s2-lunar-lander": {
    mission: "Surveyor 1", name: "Surveyor 1", year: "1966", vehicle: "Atlas-Centaur",
    text: "The first US soft landing on the Moon. Its pictures and measurements showed the surface was firm enough for the Apollo landers.",
    facts: [["Launched", "30 May 1966"], ["Landed", "2 June 1966"], ["Why it mattered", "It proved a soft landing was possible"]],
  },
  "s2-lunar-rover": {
    mission: "Apollo Lunar Roving Vehicle", name: "Apollo Lunar Roving Vehicle", year: "1971", vehicle: "Carried by the lunar module",
    text: "A folding electric car that let Apollo 15, 16 and 17 astronauts travel kilometres from their landing sites to sample different terrain.",
    facts: [["First drive", "31 July 1971 (Apollo 15)"], ["Top speed", "About 13 km/h"], ["Power", "Silver-zinc batteries"]],
  },
  "s3-mars-orbiter": {
    mission: "Mars Reconnaissance Orbiter", name: "Mars Reconnaissance Orbiter", year: "2005", vehicle: "Atlas V 401",
    text: "Its camera can see objects the size of a kitchen table from orbit, and it relays data from the rovers on the surface.",
    facts: [["Launched", "12 August 2005"], ["Arrived", "10 March 2006"], ["Flight time", "About 7 months"]],
  },
  "s3-mars-lander": {
    mission: "Viking 1", name: "Viking 1", year: "1976", vehicle: "Titan IIIE-Centaur",
    text: "The first US lander to work on Mars. It used a heat shield, a parachute and retro-rockets, the same steps modern landers use.",
    facts: [["Landed", "20 July 1976"], ["Landing steps", "Heat shield, parachute, engines"], ["Radio delay", "Many minutes, so landing is fully automatic"]],
  },
  "s3-sample-collection": {
    mission: "Mars 2020 Perseverance", name: "Mars 2020 Perseverance", year: "2020", vehicle: "Atlas V 541",
    text: "Perseverance drills rock cores and seals them in tubes so that they can be returned to Earth and studied in laboratories.",
    facts: [["Landed", "18 February 2021"], ["Site", "Jezero Crater, an ancient lake"], ["Landing method", "Sky crane"]],
  },
  "s4-deep-space": {
    mission: "Voyager and New Horizons", name: "Voyager 1 and New Horizons", year: "1977 and 2006", vehicle: "Titan IIIE; Atlas V 551",
    text: "Missions to the outer Solar System take years. New Horizons left Earth faster than any other spacecraft yet and still needed 9.5 years to reach Pluto.",
    facts: [["New Horizons launch", "19 January 2006"], ["Pluto flyby", "14 July 2015"], ["Trick", "Jupiter's gravity gave it extra speed"]],
  },
};

/* ------------------------------------------------------------------ */
/* Space history, by date                                              */
/* ------------------------------------------------------------------ */

export interface HistoryEvent {
  month: number;
  day: number;
  year: number;
  text: string;
}

export const HISTORY: HistoryEvent[] = [
  { month: 1, day: 4, year: 2004, text: "Spirit, the first of two Mars Exploration Rovers, landed on Mars." },
  { month: 1, day: 19, year: 2006, text: "New Horizons launched toward Pluto." },
  { month: 1, day: 31, year: 1958, text: "Explorer 1, the first US satellite, launched and went on to discover the Van Allen radiation belts." },
  { month: 2, day: 18, year: 2021, text: "Perseverance landed in Jezero Crater on Mars." },
  { month: 2, day: 20, year: 1962, text: "John Glenn became the first American to orbit Earth." },
  { month: 3, day: 3, year: 1972, text: "Pioneer 10 launched, the first spacecraft sent to Jupiter." },
  { month: 3, day: 5, year: 1979, text: "Voyager 1 flew past Jupiter." },
  { month: 3, day: 10, year: 2006, text: "Mars Reconnaissance Orbiter arrived at Mars." },
  { month: 4, day: 12, year: 1961, text: "Yuri Gagarin became the first person in space." },
  { month: 4, day: 12, year: 1981, text: "Space Shuttle Columbia launched on the first shuttle flight." },
  { month: 4, day: 24, year: 1990, text: "The Hubble Space Telescope was launched on the Space Shuttle." },
  { month: 5, day: 5, year: 1961, text: "Alan Shepard became the first American in space." },
  { month: 6, day: 16, year: 1963, text: "Valentina Tereshkova became the first woman in space." },
  { month: 6, day: 18, year: 2009, text: "Lunar Reconnaissance Orbiter launched to map the Moon." },
  { month: 7, day: 4, year: 1997, text: "Mars Pathfinder landed, delivering the first rover, Sojourner, to Mars." },
  { month: 7, day: 14, year: 2015, text: "New Horizons flew past Pluto after a 9.5-year journey." },
  { month: 7, day: 16, year: 1969, text: "Apollo 11 launched on a Saturn V toward the Moon." },
  { month: 7, day: 20, year: 1969, text: "Apollo 11's lunar module Eagle landed at Tranquility Base." },
  { month: 7, day: 20, year: 1976, text: "Viking 1 became the first US spacecraft to land successfully on Mars." },
  { month: 7, day: 30, year: 2020, text: "Mars 2020 launched, carrying the Perseverance rover." },
  { month: 8, day: 5, year: 2011, text: "Juno launched on its way to Jupiter." },
  { month: 8, day: 6, year: 2012, text: "Curiosity landed in Gale Crater on Mars using a sky crane." },
  { month: 8, day: 20, year: 1977, text: "Voyager 2 launched on its grand tour of the outer planets." },
  { month: 9, day: 5, year: 1977, text: "Voyager 1 launched. It is now the most distant human-made object." },
  { month: 9, day: 12, year: 1992, text: "Mae Jemison launched on Space Shuttle Endeavour, the first African American woman in space." },
  { month: 9, day: 26, year: 2022, text: "DART hit the asteroid Dimorphos, the first test of changing an asteroid's path." },
  { month: 10, day: 4, year: 1957, text: "Sputnik 1 became the first artificial satellite and began the Space Age." },
  { month: 10, day: 15, year: 1997, text: "Cassini launched toward Saturn." },
  { month: 11, day: 2, year: 2000, text: "The first crew arrived at the International Space Station. People have lived in space continuously since." },
  { month: 11, day: 12, year: 1980, text: "Voyager 1 flew past Saturn." },
  { month: 11, day: 16, year: 2022, text: "Artemis I launched on the first flight of the Space Launch System." },
  { month: 11, day: 20, year: 1998, text: "Zarya, the first module of the International Space Station, launched." },
  { month: 12, day: 7, year: 1972, text: "Apollo 17 launched, the last crewed mission to the Moon so far." },
  { month: 12, day: 11, year: 1972, text: "Apollo 17 landed in the Taurus-Littrow valley." },
  { month: 12, day: 21, year: 1968, text: "Apollo 8 launched, the first crewed flight to orbit the Moon." },
  { month: 12, day: 24, year: 1968, text: "Apollo 8 astronauts took the Earthrise photograph." },
  { month: 12, day: 25, year: 2021, text: "The James Webb Space Telescope launched." },
];

/** The event on this date, or the next one coming up. */
export function historyFor(date: Date): { event: HistoryEvent; daysAway: number } {
  const y = date.getUTCFullYear();
  const today = Date.UTC(y, date.getUTCMonth(), date.getUTCDate());
  let best: { event: HistoryEvent; daysAway: number } | null = null;
  for (const event of HISTORY) {
    let when = Date.UTC(y, event.month - 1, event.day);
    if (when < today) when = Date.UTC(y + 1, event.month - 1, event.day);
    const daysAway = Math.round((when - today) / 86_400_000);
    if (!best || daysAway < best.daysAway) best = { event, daysAway };
  }
  return best!;
}

/* ------------------------------------------------------------------ */
/* Orbits and launch windows                                           */
/* ------------------------------------------------------------------ */

export interface TransferPlan {
  /** Semi-major axis of the target, AU. */
  targetAu: number;
  transferDays: number;
  /** Angle the target must lead Earth by at departure, degrees. */
  leadAngleDeg: number;
  /** Days between launch windows. */
  synodicDays: number;
  /** Speed change needed to leave Earth's orbit onto the transfer, km/s. */
  deltaV1Kms: number;
  /** Speed change needed to match the target's orbit on arrival, km/s. */
  deltaV2Kms: number;
}

const MU_SUN_KM = 1.32712440018e11;
const AU_KM = 149_597_870.7;
const EARTH_YEAR_DAYS = 365.256;

/** A simple circular, coplanar Hohmann transfer from Earth's orbit. The standard first estimate used in mission design. */
export function hohmannFromEarth(targetAu: number): TransferPlan {
  const r1 = AU_KM;
  const r2 = targetAu * AU_KM;
  const a = (r1 + r2) / 2;
  const transferS = Math.PI * Math.sqrt((a * a * a) / MU_SUN_KM);
  const transferDays = transferS / 86_400;
  const targetDays = Math.pow(targetAu, 1.5) * EARTH_YEAR_DAYS;
  const lead = 180 - (360 * transferDays) / targetDays;
  const synodic = Math.abs(1 / (1 / EARTH_YEAR_DAYS - 1 / targetDays));
  const v1 = Math.sqrt(MU_SUN_KM / r1);
  const v2 = Math.sqrt(MU_SUN_KM / r2);
  const vt1 = Math.sqrt(MU_SUN_KM * (2 / r1 - 1 / a));
  const vt2 = Math.sqrt(MU_SUN_KM * (2 / r2 - 1 / a));
  return { targetAu, transferDays, leadAngleDeg: ((lead % 360) + 360) % 360, synodicDays: synodic, deltaV1Kms: Math.abs(vt1 - v1), deltaV2Kms: Math.abs(v2 - vt2) };
}

/** Real reference launch: Mars 2020 left on this date, in the middle of its window. */
export const MARS_REFERENCE_LAUNCH = Date.UTC(2020, 6, 30);

export function nextMarsWindows(from: Date, count = 3): Date[] {
  const s = hohmannFromEarth(1.524).synodicDays * 86_400_000;
  const out: Date[] = [];
  const n = Math.ceil((from.getTime() - MARS_REFERENCE_LAUNCH) / s);
  for (let i = 0; i < count; i++) out.push(new Date(MARS_REFERENCE_LAUNCH + (n + i) * s));
  return out;
}

/** Dynamic pressure q = 1/2 rho v^2, in kilopascals, in a simple exponential atmosphere. */
export function dynamicPressureKpa(altKm: number, speedMs: number): number {
  const rho = 1.225 * Math.exp(-(altKm * 1000) / 8_500);
  return (0.5 * rho * speedMs * speedMs) / 1000;
}
