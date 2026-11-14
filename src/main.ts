import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";
import "./styles/hud.css";
import "./styles/solar.css";
import "./styles/hangar.css";
import "./styles/mission.css";
import "./styles/crew.css";

import { router } from "./core/router";
import { startNetFlow } from "./net/flow";
import { audio, installAudio, type Mood } from "./audio/engine";
import { CosmicBackground } from "./scene/background";
import { mainMenu } from "./ui/screens/mainMenu";
import { modeSelect } from "./ui/screens/modeSelect";
import { multiplayerScreen } from "./ui/screens/multiplayer";
import { rolesScreen } from "./ui/screens/roles";
import { settingsScreen } from "./ui/screens/settings";
import { headquarters } from "./ui/screens/headquarters";
import { researchScreen } from "./ui/screens/research";
import { profileScreen } from "./ui/screens/profile";
import { missionBoard } from "./ui/screens/missionBoard";
import { missionControl } from "./ui/screens/missionControl";
import { debriefScreen } from "./ui/screens/debrief";
import { solarMapScreen } from "./ui/screens/solarMap";
import { hangarScreen } from "./ui/screens/hangar";

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
router.register("roles", rolesScreen);
router.register("settings", settingsScreen);
router.register("hq", headquarters);
router.register("research", researchScreen);
router.register("profile", profileScreen);

router.register("map", solarMapScreen);
router.register("hangar", hangarScreen);
router.register("briefing", missionBoard);
router.register("control", missionControl);
router.register("debrief", debriefScreen);

router.navigate("menu");
startNetFlow();
installAudio();
router.onNavigate((id) => {
  const mood: Mood = id === "map" ? "map" : id === "hangar" || id === "briefing" ? "hangar" : id === "control" ? "flight" : id === "debrief" ? "debrief" : "menu";
  audio.setMood(mood);
  if (id !== "control") audio.setThrust(0);
});
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__router = router;
