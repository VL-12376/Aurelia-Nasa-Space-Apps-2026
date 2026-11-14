import type { Part, PartCategory } from "./parts";

/** Facts computed from a part's own numbers, so players see where the figures come from. */
export function derived(p: Part): string[] {
  switch (p.category) {
    case "tank": {
      const frac = p.mass / (p.mass + p.propellant);
      return [`Empty tank is ${(frac * 100).toFixed(1)}% of the full mass (lower is better).`, `Holds ${(p.propellant / p.mass).toFixed(1)} kg of propellant per kg of tank.`];
    }
    case "engine": {
      const flow = p.thrustVac / (p.ispVac * 9.80665);
      return [
        `Burns ${flow.toFixed(1)} kg of propellant every second at full thrust (thrust ÷ (Isp × g0)).`,
        `Engine alone has thrust-to-weight ${(p.thrustVac / (p.mass * 9.80665)).toFixed(0)}, so its own mass barely matters.`,
        p.thrustSl > 0 ? `Sea-level Isp falls to ${p.ispSl} s because air pressure pushes back on the exhaust.` : "Produces no useful thrust in air: use it only on upper stages.",
      ];
    }
    case "solar":
      return [`${(p.watts / p.mass).toFixed(0)} W per kg of panel.`, `At Mars (43% of Earth's sunlight) it would give about ${Math.round(p.watts * 0.43)} W.`];
    case "battery":
      return [`${(p.wh / p.mass).toFixed(0)} Wh per kg. Powers a 50 W load for ${(p.wh / 50).toFixed(1)} hours.`];
    case "antenna":
      return [`Radio signals travel at light speed: ${p.rangeMkm >= 1 ? `at ${p.rangeMkm} million km a message takes ${((p.rangeMkm * 1e9) / 299792458 / 60).toFixed(1)} minutes one way` : `at ${p.rangeMkm} million km a message takes ${((p.rangeMkm * 1e9) / 299792458).toFixed(1)} seconds one way`}.`];
    case "science":
      return [`Needs ${p.draw} W while running, so about ${Math.ceil(p.draw / 300)} small panel(s) of margin.`];
    case "structure":
      return [`Carries ${p.capacity} components for ${p.mass} kg of structure (${(p.mass / p.capacity).toFixed(0)} kg per slot).`];
    case "systems":
      return p.draw > 0 ? [`Needs ${p.draw} W of power.`] : ["Passive hardware: needs no power."];
  }
}

export interface Lore {
  /** What the part is. */
  what: string;
  /** What it is for in a mission. */
  why: string;
  /** The engineering trade-off the player should weigh. */
  tradeoff: string;
}

export const CATEGORY_LORE: Record<PartCategory, Lore> = {
  structure: {
    what: "The bus is the spacecraft's chassis. It holds the instruments together and carries the wiring, thermal control and attitude control that keep everything pointed and powered.",
    why: "Every instrument, panel and antenna must bolt onto something. Bigger buses carry more, but the mass of the bus rides on top of your rocket, so every extra kilogram costs delta-v for the whole mission.",
    tradeoff: "More slots mean more capability, but a heavier bus. Pick the smallest bus that carries what the mission needs.",
  },
  tank: {
    what: "A propellant tank holds fuel and oxidiser. Propellant is roughly 90% of a rocket stage's mass, and the tank itself is the dry mass that must be carried along.",
    why: "More propellant means more delta-v, because delta-v grows with the logarithm of the mass ratio (full mass divided by empty mass).",
    tradeoff: "Doubling the propellant does not double delta-v: the extra fuel must also be lifted by the engines and carried by earlier stages. Returns diminish, which is why rockets use several stages.",
  },
  engine: {
    what: "A rocket engine burns propellant and throws the exhaust backwards. Newton's third law pushes the vehicle forward. Thrust is that push. Specific impulse (Isp) is how efficiently it uses propellant, measured in seconds.",
    why: "Booster engines need high thrust to lift off, which means thrust-to-weight above 1. Upper-stage engines need high Isp because they burn for a long time in vacuum.",
    tradeoff: "High-thrust engines tend to be heavy. High-Isp engines tend to have low thrust. Matching the engine to the stage is a core design decision.",
  },
  solar: {
    what: "Solar panels turn sunlight into electricity. At Earth, sunlight delivers about 1,361 W per square metre and good cells convert roughly a third of it.",
    why: "Panels run the spacecraft's computer, radio and instruments for as long as the mission lasts, and recharge the batteries.",
    tradeoff: "Sunlight weakens with the square of distance from the Sun. At Mars it is only about 43% as strong, and at Jupiter under 4%, so distant missions need larger panels or nuclear power.",
  },
  battery: {
    what: "A battery stores electrical energy. In low Earth orbit a spacecraft passes through Earth's shadow for up to about 35 minutes on every 92 minute orbit.",
    why: "During eclipse the panels produce nothing, so the batteries must carry the entire load. They also cover peak demand when instruments and the radio run together.",
    tradeoff: "Batteries are heavy for the energy they hold. Add enough to survive eclipse with margin, and no more.",
  },
  antenna: {
    what: "An antenna sends data home and receives commands. A dish focuses the signal into a narrow beam, which is called gain.",
    why: "Signal strength falls with the square of distance. A small patch antenna is fine for Earth orbit and the Moon, but Mars is up to 400 million km away and needs a large high-gain dish.",
    tradeoff: "Bigger dishes reach farther and send more data, but they weigh more, draw more power and must be pointed accurately.",
  },
  science: {
    what: "Scientific payloads are the reason for the mission: cameras, spectrometers and seismometers that turn a spacecraft into a discovery machine.",
    why: "Mission rewards depend on what you bring back. Each instrument adds to the science return, but also adds mass, cost and power demand.",
    tradeoff: "Instruments add payload mass, which reduces delta-v, and they draw power, which needs bigger panels and batteries. Every addition ripples through the whole design.",
  },
  systems: {
    what: "Systems hardware gives the spacecraft abilities beyond the basics: navigation to know where it is, legs to land, a heat shield to survive atmospheric entry.",
    why: "Many missions refuse to launch without a specific capability. You cannot land without legs, and you cannot enter Mars' atmosphere without a heat shield.",
    tradeoff: "These parts are dead weight on missions that do not need them. Match the hardware to the mission profile.",
  },
};

/** One-line real-world context for each part, shown under the category explanation. */
export const PART_NOTES: Record<string, string> = {
  "bus-s": "Similar in spirit to the small satellite buses used for Earth-observation constellations.",
  "bus-m": "Mid-size buses like this carry a camera, a star tracker and a few hundred watts of power.",
  "bus-l": "Large buses support landers and orbiters that need legs, heat shields and many instruments.",
  "tank-s": "Small tanks suit upper stages that need a little extra delta-v for manoeuvres.",
  "tank-m": "Medium tanks make good second stages for light payloads.",
  "tank-l": "A large first-stage tank: most of a launch vehicle's liftoff mass is this propellant.",
  "tank-xl": "Heavy tanks are needed for the long burns that send spacecraft to the Moon and beyond.",
  "ember-1": "Pressure-fed engines are simple and reliable because they need no turbopumps. Hypergolic fuels ignite on contact, so they restart easily.",
  "kestrel-1": "Kerosene and liquid oxygen is the classic booster mix: dense, cheap and easy to handle.",
  "kestrel-v": "A larger bell extracts more energy from the exhaust in vacuum. At sea level the flow would separate from the nozzle.",
  vesper: "Hydrogen and oxygen give the highest Isp of any chemical mix, but hydrogen is bulky and must be kept extremely cold.",
  "solar-s": "At 300 W a small array can run a simple communications satellite.",
  "solar-m": "Wings like this are folded for launch and unfolded in orbit.",
  "solar-l": "Large arrays power big science payloads and electric thrusters.",
  "bat-s": "Enough for a short eclipse and a small load.",
  "bat-m": "Covers a full low Earth orbit eclipse for a mid-size spacecraft.",
  "bat-l": "Supports heavy loads such as drills and spectrometers running through the night.",
  "ant-uhf": "A patch antenna sends a wide beam, so it needs no pointing, but the data rate is low.",
  "ant-dish": "Dishes concentrate the beam, trading pointing effort for range.",
  "goliath-1": "Large boosters are what lift interplanetary spacecraft: a few of these replace a whole cluster of smaller engines.",
  "ant-hga": "Interplanetary links rely on high-gain dishes. At Mars, a radio signal still takes between 3 and 22 minutes one way.",
  "sci-cam": "Cameras give the most visible return: mapping, weather and landing-site surveys.",
  "sci-spec": "Spectrometers split light into colours to identify minerals and gases.",
  "sci-seis": "Quakes passing through a planet reveal whether it has a liquid core, and how thick its crust is.",
  "sci-drill": "Cores from below the surface reveal history that radiation and weathering have erased on top.",
  "nav-star": "Star trackers photograph the sky and match star patterns to know which way the spacecraft is pointing.",
  "nav-imu": "Gyroscopes and accelerometers sense motion directly, so manoeuvres stay accurate even when stars are not visible.",
  "sys-legs": "Legs spread the touchdown load. The Moon has no atmosphere, so a lander must slow down using engines alone and set down gently.",
  "sys-shield": "Ablative shields char and erode, carrying heat away. Entering Mars' atmosphere at several km/s heats the surface to well over 1,500 °C.",
};

export interface Term {
  term: string;
  short: string;
  detail: string;
}

export const GLOSSARY: Record<string, Term> = {
  mass: {
    term: "Mass",
    short: "Total mass at liftoff.",
    detail: "Everything on the pad: tanks, propellant, engines, structure and payload. Propellant is usually 85–90% of it. The heavier the vehicle, the more thrust it needs just to leave the ground.",
  },
  thrust: {
    term: "Thrust",
    short: "Force from the first-stage engines at sea level.",
    detail: "Measured in newtons. It is the push that fights gravity. At liftoff the engines must push harder than the whole vehicle weighs.",
  },
  twr: {
    term: "Thrust to weight",
    short: "Thrust divided by weight at liftoff.",
    detail: "Must be above 1 or the rocket cannot leave the pad. Real launchers aim for about 1.2 to 1.5. Too low wastes fuel fighting gravity. Too high stresses the vehicle and the payload.",
  },
  deltav: {
    term: "Delta-v",
    short: "How much speed change the vehicle can produce in total.",
    detail: "The rocket equation: Δv = Isp × g0 × ln(m0 / mf), where m0 is the starting mass and mf is the mass after burning the propellant. It is the currency of spaceflight: every manoeuvre has a delta-v price, and your vehicle must carry enough to pay it.",
  },
  isp: {
    term: "Specific impulse (Isp)",
    short: "Engine efficiency, in seconds.",
    detail: "Thrust divided by propellant weight flow. Higher Isp means more speed from the same fuel. Kerosene engines reach around 300 s, hydrogen engines about 450 s.",
  },
  massRatio: {
    term: "Mass ratio",
    short: "Full mass divided by empty mass.",
    detail: "The ratio inside the rocket equation. A ratio of 3 gives about 1.1 × Isp × g0 of delta-v. Pushing it higher gets harder because the structure must still hold together.",
  },
  staging: {
    term: "Staging",
    short: "Dropping empty tanks and engines mid-flight.",
    detail: "Once a stage's fuel is gone its tanks and engines are dead weight. Dropping them lets the remaining propellant accelerate a lighter vehicle, which is why multi-stage rockets beat a single big tank.",
  },
  eclipse: {
    term: "Eclipse",
    short: "Time spent in Earth's shadow.",
    detail: "Low orbits pass through shadow for roughly 35 of every 92 minutes. Panels make no power then, so batteries must cover the load.",
  },
  range: {
    term: "Radio range",
    short: "Farthest distance the antenna can reach.",
    detail: "Signal strength falls with distance squared. The Moon is 0.38 million km away, Mars between 55 and 400 million km, so Mars missions need a high-gain dish.",
  },
};
