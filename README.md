# AURELIA

> Embarking on a Radiant Tomorrow.

AURELIA is a space exploration and aerospace engineering simulation game. Players run a fictional exploration agency: they design spacecraft, manage a $25 billion annual budget, plan missions and learn real engineering concepts by applying them.

Physics is simplified for teaching, and the game labels which values are real measurements and which are game models.

## Run it

```bash
npm install
npm run dev        # the game
npm run server     # multiplayer server on ws://localhost:8787 (only needed for co-op)
npm test           # unit tests (physics, spacecraft, missions, crew AI, server)
npm run build      # typecheck and production build
```

## Playing

- **Single-player**: choose a crew role (Aerospace, Propulsion, Mission Controller, Science and Systems). The other three are AI crew who fit their own parts on request and make their own decisions during flights. Or play all four roles yourself.
- **Multiplayer**: up to four people create or join a room with a 4-letter code and claim a role each. Unclaimed roles are played by AI. See [docs/multiplayer-architecture.md](docs/multiplayer-architecture.md).
- **Sound**: all music and effects are generated live in the browser (Web Audio), so there are no audio files and no licensing issues. It starts by itself where the browser allows it, and otherwise on your first click. Volume, mute and crew voices are in Settings, and the speaker button bottom-left.
- **Mission planning** (single-player and sandbox): in the briefing choose an orbit (low Earth, Sun-synchronous, medium, geostationary, or a circular or elliptical lunar orbit) and a launch vehicle from a catalogue (Electron, Falcon 9, Atlas V 401, Saturn V, SLS Block 1) or fly your own rocket. Transfer costs come from orbital mechanics; vehicle stages and payload capacities are simplified from published figures, and the launch gate checks the spacecraft against the vehicle's published capacity. The hangar's Mission resources panel tracks mass, power, communications, data, lifetime and budget. Data rates and lifetimes are labelled game models.
- **Difficulty and sandbox**: Cadet, Engineer and Director change how often trouble strikes, how long you have to react and how much a score is worth. Sandbox unlocks everything with unlimited funds and is never scored.
- **Events**: each anomaly gives an early warning, a live timer, odds that depend on your design, optional manual control as a timing mini-game, and lasting consequences listed in the debrief.
- **Share and compare**: in the hangar, Share makes a copyable design code and loads one back; Compare sets two designs side by side with their trade-offs. Settings has a double-confirmed Clear all data.

## Leaderboard

Every scored mission (never sandbox) gets a score out of 100, scaled by difficulty (Cadet ×0.8, Engineer ×1, Director ×1.3, capped at 130), and the global leaderboard on the game server (`GET/POST /api/scores`) lets anyone compete, even when no developer machine is on. Honesty notes: single-player scores are **self-reported and unverified**, because the flight runs in the player's browser. Multiplayer room results are **computed on the server** and marked verified. Scores are saved to a JSON file (`SCORES_FILE`, default `./data/scores.json`), but on Render's free tier the file system is ephemeral, so the list can reset when the service restarts or redeploys; a free database would be the upgrade.

## Publishing

- **The game** is published to GitHub Pages automatically on every push to `main` (see `.github/workflows/deploy.yml`). Change the code, push, and the public link updates in about a minute.
- **The multiplayer server** is a separate Node program. `render.yaml` describes it for Render's free tier: create a Blueprint from this repo, wait for it to go live, then in GitHub open Settings, Secrets and variables, Actions, Variables and add `SERVER_URL` set to the server's address with `wss://` (for example `wss://aurelia-server.onrender.com`). The next push (or a manual run of the workflow) builds the public game with that address. The server redeploys itself on each push too.
- Free hosts put an idle server to sleep, so the first connection after a quiet spell can take up to a minute.
- Optional: set `ALLOWED_ORIGINS` on the server to your Pages address so only your copy of the game can connect.

## Tech

Vite, TypeScript, Three.js (background, solar system, hangar, flight view), GSAP (transitions), Node `ws` (multiplayer server). Single-player progress is saved in `localStorage`.

## Project layout

```
src/
  core/        router, store (state and saves), DOM helpers
  styles/      design tokens and CSS
  scene/       Three.js scenes: background, solar system, hangar, flight
  ui/          shell layout and screens
  physics/     rocket equation, orbits, escape velocity (tested)
  spacecraft/  parts, design maths, advisor, explanations, templates
  missions/    mission definitions, flight simulation, orbital kinematics
  crew/        the four roles, their permissions, and the AI crew
  net/         multiplayer protocol and browser client
  audio/       generated music and effects
  budget/      funding categories and spending rules
  research/    technology tree data
  campaign/    season definitions
server/        authoritative multiplayer server and its tests
docs/          architecture notes
```

`branding/` holds the original AURELIA logo. `public/aurelia-logo.jpg` is a resized web copy. `public/crew/` holds the crew portraits.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Architecture and plan | Done |
| 2 | Design system and main menu | Done |
| 3 | Headquarters dashboard and navigation | Done |
| 4 | Solar system map | Done |
| 5 | Spacecraft construction | Done |
| 6 | Mission selection and briefing | Done |
| 7 | Engineering calculations and simulation | Done |
| 8 | Progression, budget and research | Done |
| 9 | Multiplayer (up to four players) | Done |
| 10 | Cinematics, sound, testing, optimisation | In progress |

## Real data and learning

AURELIA uses real, public NASA and JPL data and has no invented demo data.

- **Live** (Headquarters): the Moon's and Mars's current distance and radio delay from JPL Horizons, the next asteroid close approaches from JPL's Close-Approach Data API, and recent space weather (latest solar flare, coronal mass ejection and particle-event counts, geomagnetic storms) from NASA's DONKI database. These NASA services don't all allow direct calls from a web page, so the game server fetches them and caches the result for 30 minutes at `GET /api/space`. Each source fails on its own, so partial data is fine. A game-only "activity factor" (0.5 to 2.0) is worked out from the recent flare sizes (see `src/data/weather.ts`); it is a teaching model, not a NASA measure.
  - Server setting `NASA_API_KEY` (optional): your own free key from [api.nasa.gov](https://api.nasa.gov/). Without it the server uses NASA's shared `DEMO_KEY`, which allows only about 30 requests an hour per IP address; the 30 minute cache keeps use far below that. If the api.nasa.gov gateway does not answer, the server asks DONKI's own server (no key needed).
- **Reference** (`src/data/real.ts`): Saturn V, Space Shuttle and SLS stage data, Orion figures, the Artemis I to IV campaign, the Apollo 11 ascent, a real mission matching each game mission (including Artemis II for the crewed lunar flyby), the JPL Concept Maturity Levels, Hohmann transfers and Mars launch windows.
- **Pictures**: real mission photos come live from the [NASA Image and Video Library](https://images.nasa.gov/) in the mission briefing and the Academy, each credited and linked. They are fetched when you are online (and remembered for a week); no images are bundled with the game. NASA's [3D resources](https://science.nasa.gov/3d-resources/) are linked, not included.
- **Mission Academy**: eight short lessons (destination, delta-v, rocket equation, orbits and launch windows, launch day, how missions mature, real missions, and keeping a crew alive), each ending in a quiz. The last one has a radiation dose calculator built on measured dose rates and NASA's 600 mSv career limit, from NASA's Human Research Program and Artemis I data. Crew life support and fatigue are explained but not simulated.
- **Guidance**: a next-step banner, a hangar build coach that names the next part, highlights it and can fit it for you (and nudges if you stall), and a spoken launch poll and countdown with explained flight call-outs.
- The flight physics and part stats are simplified teaching models, and the game says so.

Contains data from NASA and JPL public sources. AURELIA is an independent game and is not affiliated with or endorsed by NASA. The full source list is in Settings and the Academy.

Crew voices use your device's built-in speech synthesis (no recordings); music and effects are synthesised in the browser.
