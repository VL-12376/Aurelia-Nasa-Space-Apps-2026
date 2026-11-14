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
- **Sound**: all music and effects are generated live in the browser (Web Audio), so there are no audio files and no licensing issues. Volume and mute are in Settings, and the speaker button bottom-left.

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

## Demo data

The headquarters has a **Demo data** switch (off by default). When on, a few panels (active missions, research in progress, agency activity) show invented sample content in dashed, labelled panels so you can preview the dashboard. That sample data lives only in `src/demo/` and is never written to the save. Funds, budget, reputation, season and research points always come from the saved game.
