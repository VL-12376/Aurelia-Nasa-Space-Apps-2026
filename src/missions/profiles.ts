import type { MissionDef } from "./missions";

export type ViewKind = "ascent" | "earth-orbit" | "moon-transfer" | "moon-orbit" | "moon-descent" | "helio" | "mars-orbit" | "mars-descent";

interface PhaseBase {
  id: string;
  label: string;
  view: ViewKind;
  /** Teaching text shown while this phase runs. */
  explain: string;
  /** Indices of mission objectives completed when this phase ends. */
  completes?: number[];
}
export interface BurnPhase extends PhaseBase {
  kind: "burn";
  /** Delta-v this manoeuvre costs, m/s. */
  deltaV: number;
}
export interface CoastPhase extends PhaseBase {
  kind: "coast";
  durationS: number;
}
export interface OpsPhase extends PhaseBase {
  kind: "ops";
  durationS: number;
  /** Instrument or system the activity depends on. */
  science?: boolean;
}
export type Phase = BurnPhase | CoastPhase | OpsPhase;

const DAY = 86_400;

const ASCENT: BurnPhase = {
  kind: "burn", id: "ascent", label: "Ascent to orbit", view: "ascent", deltaV: 9_400,
  explain: "To stay in orbit a spacecraft must reach about 7.7 km/s sideways, not just height. Gravity and air drag steal roughly 1.5 km/s on the way up, so the rocket needs about 9.4 km/s in total. Stages are dropped as they run empty.",
};

const LEO_OPS = (label: string, id: string, durationS: number, completes: number[], explain: string, science = false): OpsPhase => ({ kind: "ops", id, label, view: "earth-orbit", durationS, completes, explain, science });

const TLI = (completes?: number[]): BurnPhase => ({
  kind: "burn", id: "tli", label: "Trans-lunar injection", view: "moon-transfer", deltaV: 3_130, completes,
  explain: "A burn at the lowest point of the orbit stretches it into a long ellipse whose far end touches the Moon's orbit. This is a Hohmann transfer: the most fuel-efficient way between two circular orbits.",
});
const LUNAR_COAST: CoastPhase = {
  kind: "coast", id: "tl-coast", label: "Translunar coast", view: "moon-transfer", durationS: 4.9 * DAY,
  explain: "With the engine off the spacecraft climbs against Earth's gravity and slows from 10.8 km/s to about 0.2 km/s at its highest point. That is energy being traded for height, exactly like a ball thrown upwards.",
};
const MCC = (deltaV: number, view: ViewKind, completes?: number[]): BurnPhase => ({
  kind: "burn", id: "mcc", label: "Mid-course correction", view, deltaV, completes,
  explain: "Tiny errors in the first burn grow with distance. A small correction burn half way trims the path. The earlier you correct, the less fuel it costs.",
});
const LOI = (completes?: number[]): BurnPhase => ({
  kind: "burn", id: "loi", label: "Lunar orbit insertion", view: "moon-orbit", deltaV: 710, completes,
  explain: "The spacecraft arrives at the Moon moving too fast to be captured. A braking burn slows it just enough for lunar gravity to hold it in orbit. Miss this burn and it flies past into space.",
});

const MARS_TMI = (completes?: number[]): BurnPhase => ({
  kind: "burn", id: "tmi", label: "Trans-Mars injection", view: "helio", deltaV: 3_600, completes,
  explain: "Leaving Earth for Mars means climbing out of Earth's gravity and then raising the orbit around the Sun out to Mars' orbit. Launch windows come around only every 26 months, when Earth and Mars line up.",
});
const MARS_CRUISE: CoastPhase = {
  kind: "coast", id: "cruise", label: "Interplanetary cruise", view: "helio", durationS: 259 * DAY,
  explain: "The spacecraft follows an ellipse around the Sun for about 8.5 months. Radio signals now take between 3 and 22 minutes each way, so the spacecraft must handle problems by itself.",
};

export const PROFILES: Record<string, Phase[]> = {
  "s1-first-satellite": [
    ASCENT,
    { kind: "ops", id: "deploy", label: "Payload deployment", view: "earth-orbit", durationS: 180, completes: [0, 1, 2], explain: "The upper stage releases the satellite with a gentle push so the two drift apart safely. From here the spacecraft is on its own." },
    LEO_OPS("Commissioning", "commission", 3_600, [], "Controllers check power, temperature and the radio link before declaring the satellite operational."),
  ],
  "s1-earth-watch": [
    ASCENT,
    { kind: "burn", id: "plane", label: "Polar orbit adjustment", view: "earth-orbit", deltaV: 400, completes: [0], explain: "A polar orbit passes over both poles, so as Earth turns beneath it the satellite eventually sees every part of the planet. Tilting an orbit costs delta-v." },
    LEO_OPS("Activate imaging payload", "imaging", 2_400, [1], "The camera is powered, calibrated against a known target and focused.", true),
    LEO_OPS("First data downlink", "downlink", 1_800, [2], "Images are compressed and sent to a ground station during the short window when the satellite is overhead.", true),
  ],
  "s2-lunar-orbiter": [
    ASCENT,
    LEO_OPS("Parking orbit checkout", "park", 5_400, [], "The vehicle waits in low Earth orbit until it passes the right point for the burn to the Moon."),
    TLI([0]), MCC(60, "moon-transfer"), LUNAR_COAST, LOI([1]),
    { kind: "ops", id: "mapping", label: "Surface mapping", view: "moon-orbit", durationS: 3 * 3_600, completes: [2], science: true, explain: "In a low lunar orbit the camera sweeps a strip of the surface on every pass. Lunar gravity is uneven, which is why low lunar orbits slowly drift." },
  ],
  "s2-lunar-lander": [
    ASCENT, LEO_OPS("Parking orbit checkout", "park", 5_400, [], "The vehicle waits in low Earth orbit until it passes the right point for the burn to the Moon."),
    TLI(), MCC(60, "moon-transfer"), LUNAR_COAST, LOI([0]),
    { kind: "coast", id: "descent-orbit", label: "Descent orbit", view: "moon-orbit", durationS: 3_600, explain: "The lander lowers its orbit over the landing site and checks its navigation before committing to descent." },
    { kind: "burn", id: "descent", label: "Powered descent", view: "moon-descent", deltaV: 1_900, completes: [1], explain: "The Moon has no air, so parachutes are useless. The engine must cancel nearly all of the lander's 1.6 km/s orbital speed, then hover and set down gently. Landing costs about as much delta-v as getting into orbit." },
    { kind: "ops", id: "touchdown", label: "Touchdown", view: "moon-descent", durationS: 60, completes: [2], explain: "Landing legs absorb the final contact. Engines shut off at the first sign of touchdown." },
    { kind: "ops", id: "instruments", label: "Deploy instruments", view: "moon-descent", durationS: 7_200, completes: [3], science: true, explain: "Instruments are unfolded, levelled and calibrated, then begin returning measurements." },
  ],
  "s2-lunar-rover": [
    ASCENT, LEO_OPS("Parking orbit checkout", "park", 5_400, [], "The vehicle waits in low Earth orbit until it passes the right point for the burn to the Moon."),
    TLI(), MCC(60, "moon-transfer"), LUNAR_COAST, LOI(),
    { kind: "coast", id: "descent-orbit", label: "Descent orbit", view: "moon-orbit", durationS: 3_600, explain: "The lander lowers its orbit over the landing site and checks its navigation before committing to descent." },
    { kind: "burn", id: "descent", label: "Powered descent", view: "moon-descent", deltaV: 1_900, explain: "The engine cancels the lander's orbital speed and hovers to a gentle landing. There is no air to help." },
    { kind: "ops", id: "touchdown", label: "Touchdown", view: "moon-descent", durationS: 60, completes: [0], explain: "Landing legs absorb the final contact." },
    { kind: "ops", id: "rover-deploy", label: "Rover deployment", view: "moon-descent", durationS: 3_600, completes: [1], explain: "The rover drives down a ramp. Wheels must handle fine, abrasive dust and slopes." },
    { kind: "ops", id: "traverse", label: "Rover traverse (1 km)", view: "moon-descent", durationS: 14_400, completes: [2], explain: "Driving is slow and cautious: a stuck rover cannot be rescued. Power from the panels limits how long it can move each lunar day." },
    { kind: "ops", id: "soil", label: "Soil analysis", view: "moon-descent", durationS: 7_200, completes: [3], science: true, explain: "Instruments heat and analyse regolith samples. Water ice trapped in cold craters is a key target." },
  ],
  "s3-mars-orbiter": [
    ASCENT, LEO_OPS("Parking orbit checkout", "park", 5_400, [], "Controllers wait for the Mars launch window and check the spacecraft in orbit."),
    MARS_TMI([0]), MARS_CRUISE, MCC(100, "helio", [1]),
    { kind: "burn", id: "moi", label: "Mars orbit insertion", view: "mars-orbit", deltaV: 1_300, completes: [2], explain: "Arriving at Mars at several km/s, the spacecraft must brake with its engine to be captured. The burn happens on the far side of the planet, out of contact with Earth, so it must run automatically." },
    { kind: "ops", id: "survey", label: "Atmospheric survey", view: "mars-orbit", durationS: 6 * 3_600, completes: [3], science: true, explain: "From orbit, instruments study the carbon dioxide atmosphere, clouds and the thin air's response to the seasons." },
  ],
  "s3-mars-lander": [
    ASCENT, LEO_OPS("Parking orbit checkout", "park", 5_400, [], "Controllers wait for the Mars launch window and check the spacecraft in orbit."),
    MARS_TMI(), MARS_CRUISE, MCC(100, "helio"),
    { kind: "burn", id: "moi", label: "Mars orbit insertion", view: "mars-orbit", deltaV: 800, completes: [0], explain: "A braking burn captures the lander into a highly elliptical orbit while it prepares for entry." },
    { kind: "ops", id: "entry", label: "Atmospheric entry", view: "mars-descent", durationS: 400, completes: [1], explain: "Hitting the thin atmosphere at several km/s compresses the air into a plasma hotter than 1,500 °C. The ablative heat shield burns away to carry the heat off. Heavy spacecraft on a small shield decelerate too slowly and arrive too fast." },
    { kind: "burn", id: "edl", label: "Terminal descent", view: "mars-descent", deltaV: 1_000, completes: [2], explain: "Mars' air is too thin for parachutes alone. Engines finish the job in the last kilometres." },
    { kind: "ops", id: "station", label: "Science station operations", view: "mars-descent", durationS: 8 * 3_600, completes: [3], science: true, explain: "Instruments settle in and start the first measurements of Martian weather and soil." },
  ],
  "s3-sample-collection": [
    ASCENT, LEO_OPS("Parking orbit checkout", "park", 5_400, [], "Controllers wait for the Mars launch window and check the spacecraft in orbit."),
    MARS_TMI(), MARS_CRUISE, MCC(100, "helio"),
    { kind: "burn", id: "moi", label: "Mars orbit insertion", view: "mars-orbit", deltaV: 800, explain: "A braking burn captures the lander into a highly elliptical orbit while it prepares for entry." },
    { kind: "ops", id: "entry", label: "Atmospheric entry", view: "mars-descent", durationS: 400, explain: "Hitting the thin atmosphere at several km/s heats the heat shield to over 1,500 °C. It must survive to protect the spacecraft." },
    { kind: "burn", id: "edl", label: "Terminal descent", view: "mars-descent", deltaV: 1_000, completes: [0], explain: "Engines finish the landing in the last kilometres." },
    { kind: "ops", id: "drill", label: "Drill and collect", view: "mars-descent", durationS: 6 * 3_600, completes: [1], science: true, explain: "The drill cores into rock. The sample must come from a layer that tells a story: older rock beneath dust and weathering." },
    { kind: "ops", id: "seal", label: "Seal sample tubes", view: "mars-descent", durationS: 3_600, completes: [2], science: true, explain: "Samples are sealed so they stay clean for a future return mission." },
    { kind: "ops", id: "report", label: "Report findings", view: "mars-descent", durationS: 3_600, completes: [3], explain: "Data from the sample analysis is relayed to Earth through an orbiter or directly, taking minutes to arrive." },
  ],
  "s3-crewed-lunar-flyby": [
    ASCENT,
    LEO_OPS("High Earth orbit checkout", "park", 25 * 3_600, [0], "A crewed capsule can stay about a day in a high Earth orbit, testing its systems and flying it by hand, before the burn toward the Moon. If something is wrong, it is far better to find out while still close to home."),
    TLI([1]), MCC(60, "moon-transfer"), LUNAR_COAST,
    { kind: "ops", id: "flyby", label: "Lunar flyby", view: "moon-orbit", durationS: 4 * 3_600, completes: [2], explain: "On a free-return path the spacecraft swings behind the Moon without braking, and lunar gravity bends it back toward Earth. A flyby at about 4,000 miles (roughly 6,500 km) above the surface is typical. A flyby is much cheaper than an orbit because there is no capture burn to pay for." },
    MCC(40, "moon-transfer"),
    { kind: "coast", id: "return-coast", label: "Return coast", view: "moon-transfer", durationS: 4 * DAY, explain: "Engines off again, the capsule falls back toward Earth for about four days, speeding up all the way. A small correction aims it at the narrow re-entry corridor: too steep and it burns up, too shallow and it skips off the air." },
    { kind: "ops", id: "reentry", label: "Atmospheric re-entry", view: "earth-orbit", durationS: 1_200, completes: [3], explain: "Returning from the Moon, a crewed capsule hits the atmosphere at about 25,000 miles per hour (11 km/s). Its heat shield, made of many blocks of an ablative material, faces temperatures above 4,000 °F (2,200 °C) while the cabin stays at about room temperature. The shield burns away slowly to carry the heat off." },
  ],
  "s4-deep-space": [
    ASCENT, LEO_OPS("Parking orbit checkout", "park", 5_400, [], "Controllers check the spacecraft before the departure burn."),
    { kind: "burn", id: "tli", label: "Departure burn", view: "helio", deltaV: 6_300, completes: [0], explain: "A very large burn sends the probe on a path past Mars toward the outer Solar System. Real probes often use gravity assists to save fuel." },
    { kind: "coast", id: "cruise", label: "Long cruise", view: "helio", durationS: 900 * DAY, completes: [1], explain: "The probe coasts for years. Sunlight falls to a few percent of Earth's, so power is the constraint." },
    MCC(150, "helio"),
    { kind: "burn", id: "flyby", label: "Flyby trajectory trim", view: "helio", deltaV: 650, explain: "A final adjustment sets the closest approach. Too close risks damage, too far loses science." },
    { kind: "ops", id: "flyby-science", label: "Flyby science", view: "helio", durationS: 6 * 3_600, completes: [2], science: true, explain: "The probe takes in all its data in hours as it sweeps past at tens of km/s." },
    { kind: "ops", id: "relay", label: "Relay data to Earth", view: "helio", durationS: 5 * DAY, completes: [3], explain: "Distance and weak signals mean data trickle home slowly over days." },
  ],
};

export function profileFor(m: MissionDef): Phase[] {
  return PROFILES[m.id] ?? [];
}

/** Sum of every burn: must equal the mission's required delta-v budget. */
export function profileDeltaV(phases: Phase[]): number {
  return phases.reduce((n, p) => (p.kind === "burn" ? n + p.deltaV : n), 0);
}
