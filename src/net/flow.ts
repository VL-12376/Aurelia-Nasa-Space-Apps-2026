import { router } from "../core/router";
import { mp } from "./session";

const ROOM_SCREENS = ["hangar", "briefing", "control", "debrief", "map"];

/** Moves every client to the screen that matches the room's phase, so the whole crew changes scene together. */
export function startNetFlow(): void {
  mp.onRoom((prev, next) => {
    if (prev && prev.phase === next.phase) return;
    const here = router.currentId;
    switch (next.phase) {
      case "lobby":
        if (here !== "multiplayer") router.navigate("multiplayer");
        break;
      case "hangar":
        router.navigate("hangar");
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
