# AURELIA

> Embarking on a Radiant Tomorrow.

AURELIA is a space exploration and aerospace engineering simulation game. Players run a fictional exploration agency: they design spacecraft, manage a $25 billion annual budget, plan missions and learn real engineering concepts by applying them.

Physics is simplified for teaching, and the game labels which values are real measurements and which are game models.

## AI disclosure

- **Code, lessons and text:** written with AI assistance (the GitHub Copilot assistant in VS Code), then run and tested by the team.
- **Images:** the four crew portraits and the multiplayer banner in `public/crew/` are AI-generated and carry a visible "AI-GENERATED IMAGE" watermark.
- **Audio:** music and sound effects are synthesised by code in the browser. Scripted crew dialogue is original, locally generated speech with four distinct voices trained on public-domain datasets. See [audio provenance and licensing](public/crew-audio/LICENSE.md). Unscripted explanations use device speech.

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
- **Sound**: music and effects are generated live in the browser (Web Audio). Bundled crew recordings give Mira and Elena distinct female voices, and Kenji and Arjun distinct male voices. All dialogue is queued, so characters finish their lines without interrupting one another. Launch polls wait for speech in solo mode; shared flights use a server-timed poll and ten-second countdown. Audio starts where the browser allows it, otherwise on your first click. Settings includes individual voice previews, volumes and mute.
- **Mission planning** (single-player and sandbox): in the briefing choose an orbit (low Earth, Sun-synchronous, medium, geostationary, or a circular or elliptical lunar orbit) and a launch vehicle from a catalogue of five generic vehicles (small, medium, medium-heavy, a retired 1960s super-heavy, and a modern super-heavy) or fly your own rocket. Transfer costs come from orbital mechanics; vehicle stages and payload capacities are simplified from published figures, and the launch gate checks the spacecraft against the vehicle's published capacity. The hangar's Mission resources panel tracks mass, power, communications, data, lifetime and budget. Data rates and lifetimes are labelled game models.
- **Difficulty and sandbox**: Cadet, Engineer and Director change how often anomalies strike and how much a score is worth. Every human response gets 45 seconds, regardless of difficulty or reduced-motion settings. Sandbox unlocks everything with unlimited funds and does not earn personal XP or leaderboard scores.
- **Events**: every launched mission schedules two guaranteed station checks per character, in addition to design-dependent anomalies. Solo players handle their chosen character's checks (or all four), and multiplayer players handle their own station. The visible 45-second timer includes the three-attempt timing mini-game. Unclaimed stations are AI-run. A failed, deferred or timed-out check reduces final mission funding by 3% and increases later anomaly risk. Other timed-out decisions take the spacecraft's default action, which can lose objectives or fail a critical mission. Consequences appear in the log, a notification and the debrief.
- **Player levels and rewards**: new campaigns and cleared saves start at player level 1. Player XP is separate from campaign seasons: cumulative thresholds are 100 XP for level 2, 400 for level 3, 900 for level 4, then `100 × (level - 1)²`. Each promotion earns a persistent badge. Mission XP, achievements and season-completion awards appear in a collectable popup on returning to Headquarters, including after co-op missions. Campaign seasons still unlock when all their missions are complete; mission and technology prerequisites remain campaign-based. Players at different personal levels may join the same multiplayer room and retain their own XP on their device.
- **Budget and funding**: builds and mission operations deduct their actual costs. Headquarters shows the current available balance, total spent and mission funding added, with exact dollar amounts so small purchases are visible. The initial $25B allocation remains labelled separately. Mission objectives, science and lifetime determine the base award; response accuracy scales it from 0.50 to 1.00 (`0.5 + accuracy / 200`, with accuracy as a percentage), and each missed station check deducts another 3%. Failed missions earn no funding. Manual timing scores, deferred station checks and timeouts determine response accuracy; other decisions affect funding through their physical mission consequences, not the colour of a log entry. Unclaimed AI stations complete routine checks at full accuracy. Earned funding replenishes the balance and is reinvested across the spending categories, in both solo and co-op. The debrief explains the calculation.
- **Share and compare**: in the hangar, Share makes a copyable design code and loads one back; Compare sets two designs side by side with their trade-offs. Settings has a double-confirmed Clear all data.

## Leaderboard

Every scored mission (never sandbox) gets a score out of 100, scaled by difficulty (Cadet ×0.8, Engineer ×1, Director ×1.3, capped at 130), and the global leaderboard on the game server (`GET/POST /api/scores`) lets anyone compete, even when no developer machine is on. Honesty notes: the server never accepts a score from a browser. A single-player submission sends the recorded flight (spacecraft, plan, seed and every decision), and the server re-flies it with the same deterministic simulation, rejects anything that does not replay, and computes the score itself. Multiplayer room results are likewise computed by the server. What the server cannot check is the player's own progress (which parts they had researched) and the accuracy they report in a manual-control mini-game, so those are still taken on trust. Scores are saved to a JSON file (`SCORES_FILE`, default `./data/scores.json`). On Render's free tier that disk is wiped when the service restarts or redeploys, so for a leaderboard that lasts, also create a free Redis-compatible REST database (for example a free Upstash Redis) and add its REST address and token to the Render service as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or `SCORES_REDIS_REST_URL` and `SCORES_REDIS_REST_TOKEN`). The server then keeps the board there as well and merges it back in on every start; the startup log says which storage is active.

## Publishing

- **The game** is published to GitHub Pages automatically on every push to `main` (see `.github/workflows/deploy.yml`). Change the code, push, and the public link updates in about a minute.
- **The multiplayer server** is a separate Node program. `render.yaml` describes it for Render's free tier: create a Blueprint from this repo, wait for it to go live, then in GitHub open Settings, Secrets and variables, Actions, Variables and add `SERVER_URL` set to the server's address with `wss://` (for example `wss://aurelia-server.onrender.com`). The next push (or a manual run of the workflow) builds the public game with that address. The server redeploys itself on each push too.
- Free hosts put an idle server to sleep, so the first connection after a quiet spell can take up to a minute.
- **Automatic server updates:** Render does not always redeploy on a push by itself. In Render open the service, Settings, Deploy Hook, and copy the URL. In GitHub open Settings, Secrets and variables, Actions, and add a repository secret named `RENDER_DEPLOY_HOOK` with that URL. The `Redeploy server` workflow then deploys the server whenever the game's code changes. You can also run it by hand from the Actions tab.
- Optional: set `ALLOWED_ORIGINS` on the server to your Pages address so only your copy of the game can connect.
- Render's `/health` response includes its deployed commit in `revision`, from `RENDER_GIT_COMMIT`, so an update can be verified rather than just checking that the old server is healthy.

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

Real figures come from public-domain government space-science data and published research. AURELIA is an independent game. Where a model is simplified it is labelled as an approximation.

- **Live** (Headquarters): the Moon's and Mars's current distance and radio delay from an open ephemeris service, the next asteroid close approaches from an open close-approach service, and recent space weather (latest solar flare, coronal mass ejection and particle-event counts, geomagnetic storms) from open space-weather records. These services don't all allow direct calls from a web page, so the game server fetches them and caches the result for 30 minutes at `GET /api/space`. Each source fails on its own, so partial data is fine. A game-only "activity factor" (0.5 to 2.0) is worked out from the recent flare sizes (see `src/data/weather.ts`); it is a teaching model, not an official measure.
  - Server setting `SPACE_DATA_API_KEY` (optional): your own free key for the open space-data gateway. Without it the server uses the gateway's shared `DEMO_KEY`, which allows only about 30 requests an hour per IP address; the 30 minute cache keeps use far below that. If the gateway does not answer, the server asks the weather service's own server (no key needed).
- **Reference** (`src/data/real.ts`): published stage data for historic and current heavy launchers, crew-capsule figures, lunar mission campaign milestones, a real mission matching each game mission, technology-readiness and concept-maturity scales, Hohmann transfers and Mars launch windows.
- **Pictures**: the crew portraits and multiplayer banner are AI-generated illustrations, with visible labels. Planet views are procedural illustrations rather than photographs.
- **Mission Academy**: eight short lessons (destination, delta-v, rocket equation, orbits and launch windows, launch day, how missions mature, real missions, and keeping a crew alive), each ending in a quiz. The last one has a radiation dose calculator built on measured dose rates and a published 600 mSv career limit, from public human-research data. Crew life support and fatigue are explained but not simulated.
- **Guidance**: a next-step banner, a hangar build coach that names the next part, highlights it and can fit it for you (and nudges if you stall), and a spoken launch poll and countdown with explained flight call-outs.
- The flight physics and part stats are simplified teaching models, and the game says so.

Contains public-domain government space-science data. AURELIA is an independent game. The full source list is in Settings and the Academy.

Scripted crew recordings are original CC0 audio generated with Piper and four public-domain dataset voices; device speech covers unscripted lines. Music and effects are synthesised in the browser.
