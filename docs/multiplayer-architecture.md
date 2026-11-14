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
| Decisions | Only the role that owns the event. If nobody answers in 45 s (2.5 s for AI roles), the AI crew decides. |
| Outcome | Applied once, on the server, to the shared campaign. |

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
- A reconnecting player cannot reclaim their seat yet.
