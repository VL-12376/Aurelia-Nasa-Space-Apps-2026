import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";
import "./styles/hud.css";
import "./styles/solar.css";

import { router } from "./core/router";
import { CosmicBackground } from "./scene/background";
import { placeholderScreen } from "./ui/layout";
import { mainMenu } from "./ui/screens/mainMenu";
import { modeSelect } from "./ui/screens/modeSelect";
import { multiplayerScreen } from "./ui/screens/multiplayer";
import { settingsScreen } from "./ui/screens/settings";
import { headquarters } from "./ui/screens/headquarters";
import { researchScreen } from "./ui/screens/research";
import { profileScreen } from "./ui/screens/profile";
import { briefingScreen } from "./ui/screens/briefing";
import { solarMapScreen } from "./ui/screens/solarMap";

const app = document.getElementById("app");
const canvas = document.getElementById("bg-canvas") as HTMLCanvasElement | null;
if (!app || !canvas) throw new Error("AURELIA failed to start: missing #app or #bg-canvas");

try {
  new CosmicBackground(canvas);
} catch (err) {
  // The game stays usable on a plain background if WebGL is unavailable.
  console.warn("3D background disabled:", err);
}

router.mount(app);
router.register("menu", mainMenu);
router.register("mode", modeSelect);
router.register("multiplayer", multiplayerScreen);
router.register("settings", settingsScreen);
router.register("hq", headquarters);
router.register("research", researchScreen);
router.register("profile", profileScreen);

router.register("map", solarMapScreen);
router.register("hangar", () =>
  placeholderScreen("hangar", "Spacecraft Hangar", 5, "Assemble spacecraft from components and watch the engineering numbers respond.", [
    "Interactive 3D construction",
    "Mass, thrust, power, payload and delta-v readouts",
    "Component costs checked against your budget",
  ]),
);
router.register("briefing", briefingScreen);
router.register("control", () =>
  placeholderScreen("hq", "Mission Control", 7, "Fly the mission with live telemetry and respond to events.", ["Launch countdown and telemetry", "Fuel, power and communications", "Events that need your decisions"]),
);
router.register("debrief", () =>
  placeholderScreen("hq", "Mission Debrief", 7, "See what happened and what the engineering lessons were.", ["Performance and discoveries", "Funding and reputation changes"]),
);

router.navigate("menu");
