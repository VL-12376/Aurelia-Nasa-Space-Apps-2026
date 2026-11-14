import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { DEFAULT_PORT, type ClientMsg, type ServerMsg } from "../src/net/protocol";
import { Room } from "./room";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TICK_MS = 50;
const MAX_MESSAGE_BYTES = 64 * 1024;

interface Conn {
  id: string;
  ws: WebSocket;
  room: Room | null;
  tokens: number;
  alive: boolean;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
  rooms: Map<string, Room>;
}

/**
 * AURELIA multiplayer server.
 *
 * It owns the truth. Browsers send intents over WebSocket; the room validates them against the
 * sender's role, runs the same flight simulation the single-player game uses, and pushes the
 * resulting state back to every player. Nothing in a room is decided on a client.
 */
export function startServer(port = DEFAULT_PORT, host = "0.0.0.0"): Promise<RunningServer> {
  const rooms = new Map<string, Room>();
  const conns = new Map<string, Conn>();

  const http: Server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: conns.size }));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("AURELIA multiplayer server");
  });
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });

  const send = (id: string, msg: ServerMsg) => {
    const c = conns.get(id);
    if (c && c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  };
  const transport = { send };

  const newCode = (): string => {
    for (let i = 0; i < 50; i++) {
      const code = Array.from(randomBytes(4), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
      if (!rooms.has(code)) return code;
    }
    throw new Error("Could not allocate a room code");
  };

  const leave = (c: Conn) => {
    const room = c.room;
    if (!room) return;
    room.removePlayer(c.id);
    c.room = null;
    if (room.empty) rooms.delete(room.code);
  };

  wss.on("connection", (ws) => {
    const c: Conn = { id: randomBytes(6).toString("hex"), ws, room: null, tokens: 40, alive: true };
    conns.set(c.id, c);
    send(c.id, { t: "welcome", id: c.id });
    ws.on("pong", () => (c.alive = true));
    ws.on("message", (raw) => {
      c.tokens -= 1;
      if (c.tokens < 0) return send(c.id, { t: "error", message: "Slow down: too many messages." });
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw)) as ClientMsg;
      } catch {
        return send(c.id, { t: "error", message: "Malformed message." });
      }
      if (!msg || typeof msg.t !== "string") return;
      switch (msg.t) {
        case "create": {
          if (c.room) leave(c);
          const room = new Room(newCode(), !!msg.sandbox, transport);
          rooms.set(room.code, room);
          const err = room.addPlayer(c.id, String(msg.name ?? ""));
          if (err) return send(c.id, { t: "error", message: err });
          c.room = room;
          return;
        }
        case "join": {
          if (c.room) leave(c);
          const room = rooms.get(String(msg.code ?? "").trim().toUpperCase());
          if (!room) return send(c.id, { t: "error", message: "No room with that code." });
          const err = room.addPlayer(c.id, String(msg.name ?? ""));
          if (err) return send(c.id, { t: "error", message: err });
          c.room = room;
          return;
        }
        case "leave":
          leave(c);
          return send(c.id, { t: "left" });
        default:
          if (!c.room) return send(c.id, { t: "error", message: "Join or create a room first." });
          c.room.handle(c.id, msg);
      }
    });
    ws.on("close", () => {
      leave(c);
      conns.delete(c.id);
    });
  });

  let last = Date.now();
  const clock = setInterval(() => {
    const now = Date.now();
    const dt = now - last;
    last = now;
    for (const c of conns.values()) c.tokens = Math.min(40, c.tokens + dt / 50);
    for (const room of rooms.values()) room.tick(dt);
  }, TICK_MS);

  const keepAlive = setInterval(() => {
    for (const c of conns.values()) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 20_000);

  return new Promise((resolve) => {
    http.listen(port, host, () => {
      const address = http.address();
      const actual = typeof address === "object" && address ? address.port : port;
      resolve({
        port: actual,
        rooms,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(clock);
            clearInterval(keepAlive);
            for (const c of conns.values()) c.ws.terminate();
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  startServer(port).then((s) => console.log(`AURELIA multiplayer server listening on ws://localhost:${s.port}`));
}
