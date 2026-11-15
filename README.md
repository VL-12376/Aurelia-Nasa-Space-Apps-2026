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

- **Live** (Headquarters): the Moon's current distance and speed from JPL Horizons, and the next asteroid close approaches from JPL's Close-Approach Data API. NASA's JPL services don't allow direct calls from a web page, so the game server fetches them and caches the result for 30 minutes at `GET /api/space`.
- **Reference** (`src/data/real.ts`): Saturn V, Space Shuttle and SLS stage data, the Apollo 11 ascent, a real mission matching each game mission, the JPL Concept Maturity Levels, Hohmann transfers and Mars launch windows.
- **Mission Academy**: seven short lessons (destination, delta-v, rocket equation, orbits and launch windows, launch day, how missions mature, real missions), each ending in a quiz.
- **Guidance**: a next-step banner, a hangar build coach that names the next part, highlights it and can fit it for you (and nudges if you stall), and a spoken launch poll and countdown with explained flight call-outs.
- The flight physics and part stats are simplified teaching models, and the game says so.

Contains data from NASA and JPL public sources. AURELIA is an independent game and is not affiliated with or endorsed by NASA. The full source list is in Settings and the Academy.

Crew voices use your device's built-in speech synthesis (no recordings); music and effects are synthesised in the browser.
