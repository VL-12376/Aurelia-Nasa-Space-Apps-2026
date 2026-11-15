import { describe, expect, it } from "vitest";
import { addPart, emptyDesign } from "../src/spacecraft/design";
import type { ClientMsg, FlightSnapshot, RoomView, ServerMsg } from "../src/net/protocol";
import { Room, validateDesign, type Transport } from "./room";
import { Flight } from "../src/missions/flight";
import { MISSIONS } from "../src/missions/missions";
import { TEMPLATES } from "../src/spacecraft/templates";
import { SHARED_LAUNCH_MS } from "../src/ui/launchSequence";

class Fake implements Transport {
  inbox = new Map<string, ServerMsg[]>();
  send(id: string, msg: ServerMsg) {
    const l = this.inbox.get(id) ?? [];
    l.push(msg);
    this.inbox.set(id, l);
  }
  errors(id: string) {
    return (this.inbox.get(id) ?? []).filter((m) => m.t === "error").map((m) => (m as { message: string }).message);
  }
  room(id: string): RoomView {
    const rooms = (this.inbox.get(id) ?? []).filter((m) => m.t === "room");
    return (rooms[rooms.length - 1] as { room: RoomView }).room;
  }
  flight(id: string): FlightSnapshot | null {
    const f = (this.inbox.get(id) ?? []).filter((m) => m.t === "flight");
    return f.length ? (f[f.length - 1] as { flight: FlightSnapshot }).flight : null;
  }
}

function lobby(roles: (string | null)[], sandbox = false) {
  const net = new Fake();
  const room = new Room("ABCD", sandbox, net);
  roles.forEach((r, i) => {
    room.addPlayer(`p${i + 1}`, `Player ${i + 1}`);
    if (r) room.handle(`p${i + 1}`, { t: "role", role: r } as ClientMsg);
  });
  return { net, room };
}

const send = (room: Room, id: string, msg: ClientMsg) => room.handle(id, msg);

describe("room membership and roles", () => {
  it("allows players with different personal levels in the same campaign", () => {
    const net = new Fake();
    const room = new Room("ABCD", false, net);
    expect(room.addPlayer("new", "New", "", 0)).toBeNull();
    expect(room.addPlayer("experienced", "Experienced", "", 400)).toBeNull();
    expect(net.room("new").players.map((p) => p.level)).toEqual([1, 3]);
    expect(net.room("new").game.season).toBe(1);
    room.handle("new", { t: "role", role: "aerospace" });
    room.handle("experienced", { t: "role", role: "controller" });
    room.handle("new", { t: "start" });
    expect(net.room("new").phase).toBe("hangar");
  });

  it("accepts four players and refuses a fifth", () => {
    const { room } = lobby([null, null, null, null]);
    expect(room.addPlayer("p5", "Late")).toMatch(/full/);
  });

  it("gives each role to one player only", () => {
    const { net, room } = lobby(["aerospace", null]);
    send(room, "p2", { t: "role", role: "aerospace" });
    expect(net.errors("p2")[0]).toMatch(/already taken/);
    expect(net.room("p1").players.find((p) => p.id === "p2")?.role).toBeNull();
  });

  it("only the host can start, and unclaimed roles fall to the AI crew", () => {
    const { net, room } = lobby(["controller", "science"]);
    send(room, "p2", { t: "start" });
    expect(net.errors("p2")[0]).toMatch(/host/);
    send(room, "p1", { t: "start" });
    const view = net.room("p1");
    expect(view.phase).toBe("hangar");
    expect(view.aiRoles.sort()).toEqual(["aerospace", "propulsion"]);
  });
});

describe("shared spacecraft and permissions", () => {
  it("lets a role edit only its own parts", () => {
    const { net, room } = lobby(["aerospace", "propulsion", "controller", "science"]);
    send(room, "p1", { t: "start" });
    // Propulsion tries to add a bus: refused, design unchanged.
    send(room, "p2", { t: "design", design: addPart(emptyDesign(), "bus-s", "craft").design });
    expect(net.errors("p2")[0]).toMatch(/Aerospace Engineer/);
    expect(net.room("p1").design.parts).toHaveLength(0);
    // Aerospace adds it: accepted and visible to everyone.
    send(room, "p1", { t: "design", design: addPart(emptyDesign(), "bus-s", "craft").design });
    for (const id of ["p1", "p2", "p3", "p4"]) expect(net.room(id).design.parts.map((p) => p.partId)).toEqual(["bus-s"]);
  });

  it("rejects parts that are not researched, and layouts the rules forbid", () => {
    expect(validateDesign({ name: "x", parts: [{ partId: "tank-xl", target: "s1" }] }, [])).toMatch(/not researched/);
    expect(validateDesign({ name: "x", parts: [{ partId: "solar-s", target: "craft" }] }, [])).toMatch(/bus/i);
    expect(validateDesign({ name: "x", parts: [{ partId: "nope", target: "s1" }] }, [])).toMatch(/Unknown/);
  });

  it("the host may act for a role that only the AI is playing", () => {
    const { net, room } = lobby(["propulsion"]);
    send(room, "p1", { t: "start" });
    send(room, "p1", { t: "design", design: addPart(emptyDesign(), "bus-s", "craft").design });
    expect(net.errors("p1")).toHaveLength(0);
    expect(net.room("p1").design.parts).toHaveLength(1);
  });

  it("AI crew only help with roles no person is playing", () => {
    const { net, room } = lobby(["controller", "science"]);
    send(room, "p1", { t: "start" });
    send(room, "p1", { t: "aiHelp", role: "science" });
    expect(net.errors("p1")[0]).toMatch(/played by/);
    send(room, "p1", { t: "aiHelp", role: "aerospace" });
    expect(net.room("p1").design.parts.some((p) => p.partId.startsWith("bus"))).toBe(true);
  });
});

describe("a full mission in one room", () => {
  it("holds launch, gives humans exactly 45 seconds even while paused, and rejects late responses", () => {
    const { net, room } = lobby(["aerospace", "propulsion", "controller", "science"]);
    room.phase = "flight";
    const m = MISSIONS.find((m) => m.id === "s1-first-satellite")!;
    room.missionId = m.id;
    room.flight = new Flight(structuredClone(TEMPLATES.find((t) => t.id === "light-launcher")!.design), m, 3, { crewEvents: true, difficulty: "cadet" });
    room.tick(SHARED_LAUNCH_MS - 1);
    expect(room.flight.t).toBe(0);
    expect(room.snapshot()?.prelaunch?.countdown).toBe(1);
    room.tick(1);
    for (let i = 0; i < 2000 && !room.flight.pending; i++) room.tick(100);
    expect(room.flight.pending?.eventId).toBe("crew-aerospace-1");
    expect(room.snapshot()?.pending?.secondsLeft).toBe(45);
    room.handle("p2", { t: "decide", option: "calibrate", skill: 1 });
    expect(net.errors("p2").pop()).toMatch(/Aerospace/);
    room.paused = true;
    room.tick(44_999);
    expect(room.snapshot()?.pending?.secondsLeft).toBe(1);
    expect(room.flight.decisions).toHaveLength(0);
    room.tick(1);
    expect(room.flight.pending).toBeNull();
    expect(room.flight.decisions[0]).toMatchObject({ eventId: "crew-aerospace-1", option: "defer", timedOut: true });
    expect(room.flight.log.some((l) => l.text.includes("Response time expired.") && l.text.includes("3%"))).toBe(true);
    room.handle("p1", { t: "decide", option: "calibrate", skill: 1 });
    expect(room.flight.decisions).toHaveLength(1);
  });

  it("AI crew build, the controller launches, the server flies it and pays out", () => {
    const { net, room } = lobby(["controller"]);
    send(room, "p1", { t: "start" });
    for (const role of ["aerospace", "science", "aerospace", "science", "propulsion"] as const) send(room, "p1", { t: "aiHelp", role });
    send(room, "p1", { t: "mission", id: "s1-first-satellite" });
    const fundsBefore = net.room("p1").game.funds;
    send(room, "p1", { t: "build" });
    const craft = net.room("p1").game.fleet[0];
    expect(craft).toBeTruthy();
    send(room, "p1", { t: "launch", craftId: craft.id });
    expect(net.errors("p1")).toEqual([]);
    expect(net.room("p1").phase).toBe("flight");
    send(room, "p1", { t: "time", mode: 1000 });
    for (let i = 0; i < 6000 && net.room("p1").phase === "flight"; i++) room.tick(100);
    const end = net.room("p1");
    expect(end.phase).toBe("debrief");
    expect(end.game.lastFlight?.outcome.result).toMatch(/success|partial|failed/);
    expect(end.game.fleet).toHaveLength(0);
    expect(end.game.funds).not.toBe(fundsBefore);
    expect(net.flight("p1")?.outcome).toBeTruthy();
  });

  it("only the Mission Controller can launch or control time", () => {
    const { net, room } = lobby(["aerospace", "controller"]);
    send(room, "p1", { t: "start" });
    send(room, "p1", { t: "launch", craftId: "x" });
    expect(net.errors("p1")[0]).toMatch(/Mission Controller/);
    send(room, "p1", { t: "mission", id: "s1-first-satellite" });
    expect(net.errors("p1").pop()).toMatch(/Mission Controller/);
  });
});
