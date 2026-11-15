import { router } from "../core/router";
import { mp } from "./session";
import { store } from "../core/store";

const ROOM_SCREENS = ["hq", "hangar", "briefing", "control", "debrief", "map", "profile"];

/** Moves every client to the screen that matches the room's phase, so the whole crew changes scene together. */
export function startNetFlow(): void {
  mp.onRoom((prev, next) => {
    if (next.game.lastFlight) {
      store.awardMultiplayerFlight(next.code, next.game.flights, next.game.lastFlight, next.game.achievements.filter((a) => !prev?.game.achievements.includes(a)), next.sandbox);
    }
    if (prev && prev.phase === next.phase) return;
    const here = router.currentId;
    switch (next.phase) {
      case "lobby":
        if (here !== "multiplayer") router.navigate("multiplayer");
        break;
      case "hangar":
        router.navigate(prev?.phase === "debrief" ? "hq" : "hangar");
        break;
      case "flight":
        router.navigate("control");
        break;
      case "debrief":
        // Players already watching the flight see the ending first and open the debrief themselves.
        if (here !== "control") router.navigate("debrief");
        break;
    }
  });

  let wasActive = false;
  mp.subscribe(() => {
    const active = mp.active;
    const here = router.currentId;
    if (wasActive && !active && mp.lastError && here && ROOM_SCREENS.includes(here)) router.navigate("multiplayer");
    wasActive = active;
  });
}
