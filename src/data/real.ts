/**
 * Real reference data used across the game and the Academy.
 *
 * Everything here comes from public-domain government space-science data and published research,
 * rounded for teaching. Where a value is approximate it says so. Nothing in this file is invented.
 * AURELIA is an independent game.
 */

export const SOURCES = [
  { name: "Open ephemeris data", use: "Live position of the Moon and Mars" },
  { name: "Open asteroid close-approach data", use: "Live asteroid close approaches" },
  { name: "Open space-weather records", use: "Live solar flares, coronal mass ejections and storms" },
  { name: "Published research measurements", use: "Measured radiation dose rates in deep space, in low Earth orbit and on Mars" },
  { name: "Published crew-health guidance", use: "Radiation, fatigue and the career dose limit for astronauts" },
  { name: "Open planetary fact sheets", use: "Planet and Moon measurements" },
  { name: "Public mission-design literature", use: "How real trajectories are designed, and the step-by-step path a mission concept follows" },
  { name: "Public mission records and flight logs", use: "Launch and mission event times, and facts about real missions" },
] as const;

export const DISCLAIMER = "Real figures come from public-domain government space-science data and published research. AURELIA is an independent game.";

/* ------------------------------------------------------------------ */
/* How a real mission matures: concept maturity levels                  */
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
  { level: 4, name: "Point design", real: "One complete design with mass, power and cost estimates. At a large space agency this is what a mission design lab study produces.", game: "Finish a design that meets every check, then build it.", where: "hangar" },
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
  { id: "tli", label: "Low Earth orbit to the Moon (trans-lunar injection)", kms: 3.1, note: "A 1960s super-heavy rocket's third stage burned about 6 minutes to do this." },
  { id: "loi", label: "Capture into lunar orbit", kms: 0.9, note: "The first crewed lunar landing braked for about 6 minutes to be captured by the Moon." },
  { id: "descent", label: "Lunar orbit to the surface", kms: 1.7, note: "A powered landing, because the Moon has no air to help." },
  { id: "ascent", label: "Lunar surface to lunar orbit", kms: 1.9, note: "The only way home is to climb back up." },
  { id: "tei", label: "Lunar orbit back toward Earth", kms: 1.0, note: "The trans-Earth injection burn of a 1960s lunar mission." },
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
    id: "super-heavy-1960s", name: "A 1960s super-heavy three-stage rocket", program: "Crewed lunar programme of the 1960s and 70s", heightM: 110.6, liftoffMassT: 2_970, liftoffThrustMN: 34.5, leoT: 140, tliT: 48.6,
    blurb: "The only rocket that has sent people beyond low Earth orbit. Three stages, 13 engines, 13 flights between 1967 and 1973.",
    payloadT: 50,
    stages: [
      { name: "First stage", engines: "5 × kerosene and liquid oxygen engines", propellantT: 2_150, dryT: 135, isp: 282, thrustMN: 38 },
      { name: "Second stage", engines: "5 × liquid hydrogen and liquid oxygen engines", propellantT: 460, dryT: 36, isp: 421, thrustMN: 5.1 },
      { name: "Third stage", engines: "1 × liquid hydrogen and liquid oxygen engine", propellantT: 106, dryT: 13.5, isp: 421, thrustMN: 1.0 },
    ],
  },
  { id: "winged-orbiter", name: "A reusable-era winged orbiter", program: "Reusable orbiter programme (1981 to 2011)", heightM: 56, liftoffMassT: 2_030, liftoffThrustMN: 30.2, leoT: 27.5, blurb: "The first reusable orbital vehicle: two solid boosters and three main engines fed from an external tank. 135 flights from 1981 to 2011." },
  { id: "modern-heavy-lift", name: "A modern heavy-lift rocket", program: "Crewed lunar campaign of the 2020s", heightM: 98, liftoffMassT: 2_600, liftoffThrustMN: 39.1, leoT: 95, tliT: 27, blurb: "A heavy launcher for crewed lunar missions, with 8.8 million pounds (39.1 MN) of thrust at liftoff. It has flown twice: an uncrewed test (16 November 2022) and a crewed lunar flyby (1 April 2026). 27 tonnes is what it can send toward the Moon with a crew capsule." },
];

/** The crew capsule that rides on top of the modern heavy-lift rocket, from published vehicle figures. */
export const CREW_CAPSULE = {
  crew: 4,
  /** Longest mission the crew module is designed for, days. */
  maxDays: 21,
  grossLiftoffMassKg: 35_380,
  /** Mass sent toward the Moon, kg. */
  tliMassKg: 26_536,
  stackHeightM: 20.4,
  note: "The capsule has three parts: a crew module (where the astronauts live), a service module (power, propulsion, air and water) and a launch abort system.",
};

/** Where the crewed lunar campaign of the 2020s stands, from public records as read in November 2026. */
export const LUNAR_CAMPAIGN: { name: string; when: string; what: string }[] = [
  { name: "Uncrewed test flight", when: "16 November to 11 December 2022", what: "Uncrewed test of the heavy-lift rocket and crew capsule. 25 days 10 hours 53 minutes, 268,563 miles (about 432,000 km) from Earth at the farthest. The capsule completed 161 test objectives. Engineers studied unexpected char loss on the heat shield and changed the re-entry path of the next flight because of it." },
  { name: "Crewed lunar flyby", when: "1 to 10 April 2026", what: "The first crewed flight: four astronauts looped around the Moon in 9 days 1 hour 32 minutes, passing 4,067 miles (about 6,545 km) above the lunar surface and reaching 252,756 miles from Earth, the farthest humans have travelled. The heat shield performed as expected, with far less char loss than on the uncrewed flight." },
  { name: "Docking rehearsal", when: "Planned for 2027", what: "A crewed test in low Earth orbit of rendezvous and docking between the capsule and test versions of commercial lunar landers, to reduce risk before a landing." },
  { name: "First landing of the campaign", when: "Planned for 2028", what: "The goal for the first crewed Moon landing of the campaign: the crew moves from the capsule into a commercial lander for the trip to the surface." },
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
/* A real launch and mission of the 1960s, event by event              */
/* ------------------------------------------------------------------ */

export interface RealEvent {
  /** Seconds since liftoff. */
  t: number;
  label: string;
  explain: string;
}

/** Approximate times from the published mission report and flight log of the first crewed lunar landing. */
export const CREWED_LUNAR_ASCENT: RealEvent[] = [
  { t: -9, label: "Ignition sequence starts", explain: "The five first-stage engines light one after another while the rocket is still held down, so the computers can check each one before release." },
  { t: 0, label: "Liftoff", explain: "Thrust now exceeds weight. The rocket's 2,970 tonnes begin to rise, slowly at first, burning about 13 tonnes of propellant every second." },
  { t: 12, label: "Tower cleared", explain: "The rocket is high enough to clear the launch tower and begins to roll and pitch toward its flight direction (east, to use Earth's spin)." },
  { t: 83, label: "Max Q", explain: "Maximum dynamic pressure: the rocket is fast enough and the air still thick enough to push on it with about 35 kilopascals. The structure is at its most stressed." },
  { t: 135, label: "Centre engine cut off", explain: "One of the five engines shuts down to keep acceleration from rising too high as the rocket gets lighter." },
  { t: 162, label: "First stage separation", explain: "The empty first stage (135 tonnes of dead weight) is dropped. The rocket is about 67 km up and moving at roughly 2.4 km/s." },
  { t: 164, label: "Second stage ignites", explain: "Five engines light. Staging works because you stop carrying the empty tank." },
  { t: 198, label: "Launch escape tower jettisoned", explain: "Above the thick air, the emergency escape rocket is no longer needed and is dropped to save mass." },
  { t: 548, label: "Second stage cut off", explain: "The second stage has delivered nearly all the speed needed. It is dropped and the third stage takes over." },
  { t: 700, label: "Orbit reached", explain: "About 185 km up, moving at roughly 7.8 km/s sideways. The crew is in orbit and has time to check everything before committing to the Moon." },
];

export const CREWED_LUNAR_MISSION: RealEvent[] = [
  { t: 0, label: "Launch (16 July 1969)", explain: "A super-heavy rocket lifts off from a coastal launch site in Florida at 13:32 UTC." },
  { t: 2 * 3600 + 44 * 60, label: "Trans-lunar injection", explain: "Third-stage burn of about 6 minutes adds roughly 3.1 km/s and sends the spacecraft toward the Moon." },
  { t: 75 * 3600 + 50 * 60, label: "Lunar orbit insertion", explain: "A braking burn of about 6 minutes lets the Moon capture the spacecraft." },
  { t: 102 * 3600 + 46 * 60, label: "Landing at Tranquility Base", explain: "The lander touches down on 20 July at about 20:17 UTC, about 3 days after launch." },
  { t: 195 * 3600 + 19 * 60, label: "Splashdown", explain: "The command module returns to the Pacific on 24 July, after 8 days." },
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
    id: "first-landing", name: "The first crewed lunar landing", year: "1969", vehicle: "A super-heavy three-stage rocket", destination: "The Moon (landing)",
    facts: [["Launch", "16 July 1969"], ["Landing", "20 July 1969, Sea of Tranquility"], ["Duration", "8 days, 3 hours, 18 minutes"], ["Time on the surface", "About 21.5 hours"]],
    notice: "A direct trip took about 3 days because the trajectory was planned precisely, with only small mid-course corrections.",
  },
  {
    id: "uncrewed-lunar-test", name: "An uncrewed lunar test flight", year: "2022", vehicle: "A modern heavy-lift rocket", destination: "Lunar distant retrograde orbit",
    facts: [["Launch", "16 November 2022"], ["Duration", "About 25.5 days"], ["Closest to the Moon", "About 130 km"], ["Farthest from Earth", "About 432,000 km, a record for a crew-rated capsule"]],
    notice: "An uncrewed test: engineers learn how the vehicle behaves before people fly on it.",
  },
  {
    id: "crewed-lunar-flyby", name: "A crewed lunar flyby", year: "2026", vehicle: "A modern heavy-lift rocket", destination: "Crewed lunar flyby (free return)",
    facts: [["Launch", "1 April 2026"], ["Splashdown", "10 April 2026"], ["Duration", "9 days, 1 hour, 32 minutes"], ["Crew", "4 astronauts, from two countries"], ["Closest to the Moon", "4,067 miles (about 6,545 km) above the surface"], ["Farthest from Earth", "252,756 miles (about 406,800 km), a record for humans"]],
    notice: "The first people to fly this capsule. A free-return path swings round the Moon and heads back to Earth with no braking burn at the Moon: lunar gravity does the turning.",
  },
  {
    id: "mars-rover-2020", name: "A Mars rover with a sample-caching drill", year: "2020", vehicle: "A medium-lift expendable rocket", destination: "Mars, Jezero Crater",
    facts: [["Launch", "30 July 2020"], ["Landing", "18 February 2021"], ["Flight time", "About 203 days"], ["Distance travelled", "About 470 million km"]],
    notice: "It left in a launch window that opens only about every 26 months, when Earth and Mars are lined up for the cheapest transfer.",
  },
  {
    id: "grand-tour-probe", name: "A 1970s grand-tour probe", year: "1977", vehicle: "A heavy expendable rocket with an upper stage", destination: "Interstellar space",
    facts: [["Launch", "5 September 1977"], ["Jupiter flyby", "5 March 1979"], ["Saturn flyby", "12 November 1980"], ["Interstellar space", "Crossed into it in 2012"]],
    notice: "Gravity assists from Jupiter and Saturn gave it speed for free, using planets as slingshots.",
  },
  {
    id: "infrared-telescope", name: "A large infrared space telescope", year: "2021", vehicle: "A heavy expendable rocket", destination: "Sun–Earth L2 point",
    facts: [["Launch", "25 December 2021"], ["Arrival at L2", "About 30 days later"], ["Distance", "About 1.5 million km from Earth"], ["Mirror", "6.5 m across, 18 gold-coated segments"]],
    notice: "Science requirements drove the design: infrared astronomy needs a very cold telescope, so it carries a five-layer sunshield.",
  },
];

/** A real mission that matches each AURELIA mission. */
export interface RealParallel {
  name: string;
  year: string;
  vehicle: string;
  text: string;
  facts: [string, string][];
}

export const REAL_PARALLELS: Record<string, RealParallel> = {
  "s1-first-satellite": {
    name: "The first US satellite", year: "1958", vehicle: "a small four-stage rocket",
    text: "The first US satellite. It weighed only 14 kg, yet its instrument discovered the radiation belts around Earth.",
    facts: [["Launched", "31 January 1958"], ["Mass", "About 14 kg"], ["Orbit", "About 360 × 2,500 km"]],
  },
  "s1-earth-watch": {
    name: "A long-running Earth-observation satellite series", year: "2021", vehicle: "a medium-lift expendable rocket",
    text: "This satellite series has photographed the whole Earth every 16 days for decades, in a sun-synchronous orbit so every picture has similar lighting.",
    facts: [["Latest launch", "27 September 2021"], ["Altitude", "About 705 km"], ["Repeat cycle", "16 days"]],
  },
  "s2-lunar-orbiter": {
    name: "A lunar mapping orbiter", year: "2009", vehicle: "a medium-lift expendable rocket",
    text: "This orbiter has mapped the Moon in detail, including the landing sites of the 1960s and 70s and shadowed polar craters that may hold water ice.",
    facts: [["Launched", "18 June 2009"], ["Reached the Moon", "5 days later"], ["Orbit", "Polar, about 50 km up"]],
  },
  "s2-lunar-lander": {
    name: "The first US soft lander on the Moon", year: "1966", vehicle: "a medium-lift rocket with a hydrogen upper stage",
    text: "The first US soft landing on the Moon. Its pictures and measurements showed the surface was firm enough for crewed landers.",
    facts: [["Launched", "30 May 1966"], ["Landed", "2 June 1966"], ["Why it mattered", "It proved a soft landing was possible"]],
  },
  "s2-lunar-rover": {
    name: "A folding electric lunar rover", year: "1971", vehicle: "carried by a crewed lunar lander",
    text: "A folding electric car that let astronauts on the last three crewed lunar landings travel kilometres from their landing sites to sample different terrain.",
    facts: [["First drive", "31 July 1971"], ["Top speed", "About 13 km/h"], ["Power", "Silver-zinc batteries"]],
  },
  "s3-mars-orbiter": {
    name: "A high-resolution Mars orbiter", year: "2005", vehicle: "a medium-lift expendable rocket",
    text: "Its camera can see objects the size of a kitchen table from orbit, and it relays data from the rovers on the surface.",
    facts: [["Launched", "12 August 2005"], ["Arrived", "10 March 2006"], ["Flight time", "About 7 months"]],
  },
  "s3-mars-lander": {
    name: "The first US lander to work on Mars", year: "1976", vehicle: "a heavy expendable rocket with an upper stage",
    text: "The first US lander to work on Mars. It used a heat shield, a parachute and retro-rockets, the same steps modern landers use.",
    facts: [["Landed", "20 July 1976"], ["Landing steps", "Heat shield, parachute, engines"], ["Radio delay", "Many minutes, so landing is fully automatic"]],
  },
  "s3-sample-collection": {
    name: "A Mars rover with a sample-caching drill", year: "2020", vehicle: "a medium-lift expendable rocket",
    text: "This rover drills rock cores and seals them in tubes so that they can be returned to Earth and studied in laboratories.",
    facts: [["Landed", "18 February 2021"], ["Site", "Jezero Crater, an ancient lake"], ["Landing method", "Sky crane"]],
  },
  "s3-crewed-lunar-flyby": {
    name: "A crewed lunar flyby", year: "2026", vehicle: "a modern heavy-lift rocket and a crew capsule",
    text: "The first crewed flight of a modern lunar campaign. Four astronauts rode a heavy-lift rocket and a crew capsule on a free-return path round the Moon, then splashed down in the Pacific. The capsule's heat shield met the atmosphere at about 39 times the speed of sound.",
    facts: [["Launched", "1 April 2026"], ["Splashdown", "10 April 2026"], ["Duration", "9 days, 1 hour, 32 minutes"], ["Crew", "4 astronauts"], ["Closest to the Moon", "4,067 miles (about 6,545 km)"], ["Farthest from Earth", "252,756 miles (about 406,800 km)"], ["Heat shield", "186 ablative blocks, peak above 4,000 °F"]],
  },
  "s4-deep-space": {
    name: "Grand-tour probes and a Pluto flyby", year: "1977 and 2006", vehicle: "heavy expendable rockets with upper stages",
    text: "Missions to the outer Solar System take years. A 2006 Pluto probe left Earth faster than any other spacecraft yet and still needed 9.5 years to reach Pluto.",
    facts: [["Pluto probe launch", "19 January 2006"], ["Pluto flyby", "14 July 2015"], ["Trick", "Jupiter's gravity gave it extra speed"]],
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
  { month: 1, day: 4, year: 2004, text: "The first of two twin rovers landed on Mars." },
  { month: 1, day: 19, year: 2006, text: "A probe launched toward Pluto, the fastest spacecraft ever sent from Earth at that time." },
  { month: 1, day: 31, year: 1958, text: "The first US satellite launched and went on to discover the radiation belts around Earth." },
  { month: 2, day: 18, year: 2021, text: "A rover with a sample-caching drill landed in Jezero Crater on Mars." },
  { month: 2, day: 20, year: 1962, text: "John Glenn became the first American to orbit Earth." },
  { month: 3, day: 3, year: 1972, text: "The first spacecraft sent to Jupiter launched." },
  { month: 3, day: 5, year: 1979, text: "A grand-tour probe flew past Jupiter." },
  { month: 3, day: 10, year: 2006, text: "A high-resolution orbiter arrived at Mars." },
  { month: 4, day: 12, year: 1961, text: "Yuri Gagarin became the first person in space." },
  { month: 4, day: 12, year: 1981, text: "The first flight of a reusable winged orbiter launched." },
  { month: 4, day: 24, year: 1990, text: "A large space telescope was launched from the payload bay of a reusable orbiter." },
  { month: 5, day: 5, year: 1961, text: "Alan Shepard became the first American in space." },
  { month: 6, day: 16, year: 1963, text: "Valentina Tereshkova became the first woman in space." },
  { month: 6, day: 18, year: 2009, text: "A lunar mapping orbiter launched to map the Moon." },
  { month: 7, day: 4, year: 1997, text: "A Mars lander touched down and delivered the first rover to Mars." },
  { month: 7, day: 14, year: 2015, text: "A probe flew past Pluto after a 9.5-year journey." },
  { month: 7, day: 16, year: 1969, text: "The first crewed lunar landing mission launched on a super-heavy rocket." },
  { month: 7, day: 20, year: 1969, text: "A crewed lunar landing touched down for the first time, at Tranquility Base." },
  { month: 7, day: 20, year: 1976, text: "The first US spacecraft to land successfully on Mars touched down." },
  { month: 7, day: 30, year: 2020, text: "A Mars rover with a sample-caching drill launched." },
  { month: 8, day: 5, year: 2011, text: "A solar-powered probe launched on its way to Jupiter." },
  { month: 8, day: 6, year: 2012, text: "A car-sized rover landed in a Martian crater using a sky crane." },
  { month: 8, day: 20, year: 1977, text: "A probe launched on a grand tour of the outer planets." },
  { month: 9, day: 5, year: 1977, text: "A faster twin probe launched. It is now the most distant human-made object." },
  { month: 9, day: 12, year: 1992, text: "Mae Jemison launched on a reusable orbiter, the first African American woman in space." },
  { month: 9, day: 26, year: 2022, text: "A spacecraft hit a small asteroid, the first test of changing an asteroid's path." },
  { month: 10, day: 4, year: 1957, text: "The first artificial satellite launched and began the Space Age." },
  { month: 10, day: 15, year: 1997, text: "A large probe launched toward Saturn." },
  { month: 11, day: 2, year: 2000, text: "The first crew arrived at an international space station. People have lived in space continuously since." },
  { month: 11, day: 12, year: 1980, text: "A grand-tour probe flew past Saturn." },
  { month: 11, day: 16, year: 2022, text: "An uncrewed lunar test flight launched on the first flight of a modern heavy-lift rocket." },
  { month: 11, day: 20, year: 1998, text: "The first module of an international space station launched." },
  { month: 12, day: 7, year: 1972, text: "The last crewed mission to the Moon so far launched." },
  { month: 12, day: 11, year: 1972, text: "The last crewed lunar landing touched down in the Taurus-Littrow valley." },
  { month: 12, day: 21, year: 1968, text: "The first crewed flight to orbit the Moon launched." },
  { month: 12, day: 24, year: 1968, text: "Astronauts in lunar orbit took the Earthrise photograph." },
  { month: 12, day: 25, year: 2021, text: "A large infrared space telescope launched." },
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

/** Real reference launch: a 2020 Mars rover left on this date, in the middle of its window. */
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
