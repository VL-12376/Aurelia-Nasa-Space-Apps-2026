# Multiplayer architecture

AURELIA's cooperative mode lets up to four people share one spacecraft and one mission. It is a real client/server design: nothing is faked with local UI.

## Shape

```
browser A ──┐                       ┌── Room KRKA (authoritative state)
browser B ──┼── WebSocket (JSON) ──►│    lobby → hangar → flight → debrief
browser C ──┤                       │    runs the same TypeScript simulation as the single-player game
browser D ──┘                       └── AI crew fill any role nobody plays
```

- **Server** (`server/`): Node + `ws`. `index.ts` manages rooms, 4-letter codes, rate limiting, keep-alive pings and a `/health` endpoint. `room.ts` is one room.
- **Client** (`src/net/`): `session.ts` holds the connection and whatever the server last said; `flow.ts` moves every client to the screen matching the room phase; `remoteFlight.ts` lets the mission-control screen read a server flight.
- **Protocol** (`src/net/protocol.ts`): clients send *intents* (`design`, `mission`, `build`, `launch`, `time`, `decide`, `chat`, ...). The server replies with `room` views and 10 Hz `flight` snapshots.

## Authority

The server owns every rule. Clients never decide an outcome.

| Concern | How it is enforced |
| --- | --- |
| Roles | One person per role; locked once the mission starts. |
| Design edits | The submitted design is replayed part by part (`validateDesign`). A multiset diff against the current design must only touch parts the sender's role may change. The host may act for roles run by AI. |
| Build | Aerospace Engineer only; funds and budget checked on the server. |
| Mission and launch | Mission Controller only; the pre-flight gate runs on the server. |
| Time rate | Mission Controller only, warp clamped to 1 to 1000. |
| Launch poll and countdown | The server holds the flight for four 5-second station polls, a 3-second count introduction and a 10-second countdown. Snapshots identify the current stage; clients play the correct character's original recording. |
| Decisions | Only the role that owns the event. Each character has two guaranteed station checks plus applicable anomalies. Human deadlines are exactly 45 s, including mini-games and while simulation time is paused. On expiry, spacecraft autonomy applies the default action and records consequences; AI-owned stations decide after 2.5 s. |
| Outcome and budget | Applied once, on the server, to the shared campaign. Build/operations spending reduces the balance; accuracy-based mission funding increases it and replenishes category allocations. Clients see the same updated budget. |
| Player levels | Personal XP is separate from room seasons and does not restrict joining. Clients save their mission XP and promotion badges locally, deduplicate rewards across reconnections and show awards at Headquarters. Joining clients supply their existing XP for advisory lobby level labels; it does not affect permissions, campaign unlocks or verified scores. |

## Roles

| Role | Fits parts | Decides events |
| --- | --- | --- |
| Aerospace Engineer | Bus, structure, legs, heat shield; approves the build | Atmospheric entry |
| Propulsion Engineer | Tanks, engines | Engine anomaly |
| Mission Controller | Navigation hardware; chooses mission, launches, sets time | Course correction, landing hazard |
| Science and Systems Officer | Instruments, solar, batteries, antennas | Comms dropout, solar flare, power, instrument faults |

## Running it

```
npm run server      # ws://localhost:8787  (PORT and HOST env vars override)
npm run dev         # the game, in a second terminal
```

Other players open the game and type the host machine's address in the Server address box. For play over the internet, put the server behind TLS (a reverse proxy gives `wss://`).

## Known limits

- Rooms live in memory. Restarting the server ends them.
- There is no account system; a player is a connection and a display name.
- Dropped connections can reclaim their seat with the server-issued token. Unclaimed or disconnected stations are covered by AI.
- Personal levels are device-local, not an account-backed or server-verified progression system.
