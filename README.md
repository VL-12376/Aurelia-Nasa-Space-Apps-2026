# AURELIA

> Embarking on a Radiant Tomorrow.

AURELIA is a space exploration and aerospace engineering simulation game. Players run a fictional exploration agency: they design spacecraft, manage a $25 billion annual budget, plan missions and learn real engineering concepts by applying them.

Physics is simplified for teaching, and the game labels which values are real measurements and which are game models.

## Run it

```bash
npm install
npm run dev        # start the dev server
npm test           # physics unit tests
npm run build      # typecheck and production build
```

## Tech

Vite, TypeScript, Three.js (3D background and, later, planets and the hangar), GSAP (screen transitions). Single-player progress is saved in `localStorage`.

## Project layout

```
src/
  core/        router, store (state and saves), DOM helpers
  styles/      design tokens and CSS
  scene/       Three.js cosmic background
  ui/          shell layout and screens
  physics/     rocket equation, orbits, escape velocity (tested)
  budget/      funding categories and spending rules
  missions/    mission definitions
  research/    technology tree data
  campaign/    season definitions
```

`branding/` holds the original AURELIA logo. `public/aurelia-logo.jpg` is a resized web copy.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Architecture and plan | Done |
| 2 | Design system and main menu | Done |
| 3 | Headquarters dashboard and navigation | Done |
| 4 | Solar system map | Done |
| 5 | Spacecraft construction | Planned |
| 6 | Mission selection and briefing | Planned |
| 7 | Engineering calculations and simulation | Planned |
| 8 | Progression, budget and research | Planned |
| 9 | Multiplayer (up to four players) | Planned |
| 10 | Cinematics, sound, testing, optimisation | Planned |

Multiplayer is not functional yet: the real-time server has not been built, and the UI says so.

## Demo data

The headquarters has a **Demo data** switch (off by default). When on, a few panels (active missions, research in progress, agency activity) show invented sample content in dashed, labelled panels so you can preview the dashboard. That sample data lives only in `src/demo/` and is never written to the save. Funds, budget, reputation, season and research points always come from the saved game.
