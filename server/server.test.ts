import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ROLES, type RoleId } from "../src/crew/roles";
import { addPart, emptyDesign } from "../src/spacecraft/design";
import type { ClientMsg, FlightSnapshot, RoomView, ServerMsg } from "../src/net/protocol";
import { startServer, type RunningServer } from "./index";

/** A real network client: opens a WebSocket to the server and keeps the latest state it was sent. */
class Client {
  ws!: WebSocket;
  id = "";
  room: RoomView | null = null;
  flight: FlightSnapshot | null = null;
  errors: string[] = [];
  chat: string[] = [];
  role: RoleId | null = null;

  constructor(private port: number, readonly name: string) {}

  open(): Promise<void> {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    this.ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)) as ServerMsg;
      if (m.t === "welcome") this.id = m.id;
      if (m.t === "room") this.room = m.room;
      if (m.t === "flight") {
        this.flight = m.flight;
        // The person in the matching role answers their own decisions.
        const p = m.flight.pending;
        if (p && p.owner === this.role && !p.ownerIsAi) {
          const opt = p.options.find((o) => !o.disabled);
          if (opt) this.send({ t: "decide", option: opt.id });
        }
      }
      if (m.t === "error") this.errors.push(m.message);
      if (m.t === "chat") this.chat.push(`${m.from}: ${m.text}`);
    });
    return new Promise((res) => this.ws.on("open", () => res()));
  }
  send(msg: ClientMsg) {
    this.ws.send(JSON.stringify(msg));
  }
  close() {
    this.ws.close();
  }
}

const until = async (cond: () => boolean, ms = 20_000, label = "condition") => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};

let server: RunningServer;
beforeAll(async () => {
  server = await startServer(0, "127.0.0.1");
});
afterAll(async () => {
  await server.close();
});

describe("cooperative multiplayer over real WebSockets", () => {
  it("four players create a room, take roles, share a spacecraft and fly a mission together", async () => {
    const [a, b, c, d] = ["Ada", "Ben", "Cleo", "Dev"].map((n) => new Client(server.port, n));
    for (const x of [a, b, c, d]) await x.open();

    a.send({ t: "create", name: a.name, sandbox: false });
    await until(() => !!a.room, 5000, "room created");
    const code = a.room!.code;
    expect(code).toMatch(/^[A-Z]{4}$/);

    for (const x of [b, c, d]) x.send({ t: "join", code, name: x.name });
    await until(() => a.room!.players.length === 4, 5000, "four players");

    // Everybody picks a different role.
    const picks: [Client, RoleId][] = [[a, "aerospace"], [b, "propulsion"], [c, "controller"], [d, "science"]];
    for (const [x, role] of picks) {
      x.role = role;
      x.send({ t: "role", role });
    }
    await until(() => a.room!.players.every((p) => p.role), 5000, "roles");
    expect(a.room!.aiRoles).toEqual([]);

    // A fifth connection is refused.
    const e = new Client(server.port, "Eve");
    await e.open();
    e.send({ t: "join", code, name: "Eve" });
    await until(() => e.errors.length > 0, 5000, "room full error");
    expect(e.errors[0]).toMatch(/full/);
    e.close();

    a.send({ t: "start" });
    await until(() => d.room!.phase === "hangar", 5000, "hangar phase");

    // The roles build the spacecraft together. Each only touches their own parts.
    let design = emptyDesign();
    const add = (id: string, target: "s1" | "s2" | "s3" | "craft") => {
      design = addPart(design, id, target).design;
      return design;
    };
    a.send({ t: "design", design: add("bus-s", "craft") });
    await until(() => d.room!.design.parts.length === 1, 5000, "bus");
    b.send({ t: "design", design: (() => { add("kestrel-1", "s1"); add("kestrel-1", "s1"); return add("tank-l", "s1"); })() });
    await until(() => c.room!.design.parts.length === 4, 5000, "booster");
    b.send({ t: "design", design: (() => { add("ember-1", "s2"); return add("tank-m", "s2"); })() });
    await until(() => c.room!.design.parts.length === 6, 5000, "second stage");
    d.send({ t: "design", design: (() => { add("solar-m", "craft"); add("bat-s", "craft"); return add("ant-uhf", "craft"); })() });
    await until(() => a.room!.design.parts.length === 9, 5000, "payload");

    // Everyone sees the identical design.
    const key = (x: Client) => JSON.stringify(x.room!.design.parts);
    expect(new Set([a, b, c, d].map(key)).size).toBe(1);

    // Permissions are enforced by the server, not the UI.
    const before = a.room!.design.parts.length;
    b.errors.length = 0;
    b.send({ t: "design", design: addPart(a.room!.design, "bat-m", "craft").design });
    await until(() => b.errors.length > 0, 5000, "permission error");
    expect(b.errors[0]).toMatch(/Science and Systems Officer/);
    expect(a.room!.design.parts.length).toBe(before);

    c.send({ t: "mission", id: "s1-first-satellite" });
    await until(() => a.room!.missionId === "s1-first-satellite", 5000, "mission chosen");
    a.send({ t: "build" });
    await until(() => a.room!.game.fleet.length === 1, 5000, "built");

    c.send({ t: "launch", craftId: a.room!.game.fleet[0].id });
    await until(() => a.room!.phase === "flight", 5000, "flight");
    c.send({ t: "time", mode: 1000 });
    await until(() => !!b.flight && b.flight.telemetry.velKms > 0, 15_000, "telemetry");

    // Every player is watching the same flight.
    await until(() => d.room!.phase === "debrief", 60_000, "debrief");
    const f = [a, b, c, d].map((x) => x.flight!);
    expect(new Set(f.map((x) => x.status)).size).toBe(1);
    expect(f[0].outcome).toBeTruthy();
    expect(a.room!.game.lastFlight?.outcome.headline).toBeTruthy();
    expect(c.chat.some((l) => l.includes("Launch"))).toBe(true);

    for (const x of [a, b, c, d]) x.close();
    void ROLES;
  }, 120_000);

  it("rejects unknown room codes and malformed messages without crashing", async () => {
    const x = new Client(server.port, "Zed");
    await x.open();
    x.send({ t: "join", code: "ZZZZ", name: "Zed" });
    await until(() => x.errors.length > 0, 5000, "error");
    expect(x.errors[0]).toMatch(/No room/);
    x.ws.send("not json");
    x.ws.send(JSON.stringify({ t: "design", design: {} }));
    await until(() => x.errors.length > 1, 5000, "second error");
    x.close();
  });
});
