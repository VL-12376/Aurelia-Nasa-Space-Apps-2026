import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { DEFAULT_PORT, type ClientMsg, type ServerMsg } from "../src/net/protocol";
import { Room } from "./room";
import { spaceNow } from "./live";
import { RateLimiter, ScoreStore, MAX_LIST, NAME_MAX, cleanText, type RemoteStore } from "./scores";
import { replayFlight, validateReplay } from "../src/missions/replay";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TICK_MS = 50;
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_ROOMS = 200;
const MAX_SCORE_BODY_BYTES = 16 * 1024;
/** Comma-separated list of page origins allowed to connect. Empty means anyone. */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

interface Conn {
  id: string;
  ws: WebSocket;
  room: Room | null;
  tokens: number;
  alive: boolean;
  token: string;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
  rooms: Map<string, Room>;
  scores: ScoreStore;
}

export interface ServerOptions {
  /** Where the leaderboard is saved. Omit to keep it in memory only (the tests do this). */
  scoresFile?: string | null;
  /** Durable leaderboard storage (a Redis-compatible REST service), so scores survive restarts on a free host. */
  scoresRemote?: RemoteStore | null;
}

const CORS = { "access-control-allow-origin": "*" };

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...CORS, ...headers });
  res.end(JSON.stringify(body));
}

/** The address of the browser, behind Render's proxy if there is one. */
function clientIp(req: IncomingMessage): string {
  const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "unknown";
}

/**
 * AURELIA multiplayer server.
 *
 * It owns the truth. Browsers send intents over WebSocket; the room validates them against the
 * sender's role, runs the same flight simulation the single-player game uses, and pushes the
 * resulting state back to every player. Nothing in a room is decided on a client.
 */
export function startServer(port = DEFAULT_PORT, host = "0.0.0.0", options: ServerOptions = {}): Promise<RunningServer> {
  const rooms = new Map<string, Room>();
  const conns = new Map<string, Conn>();
  const scores = new ScoreStore({ file: options.scoresFile ?? null, remote: options.scoresRemote ?? null });
  const submitLimit = new RateLimiter(8, 60_000);

  const handleScores = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...CORS, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" });
      res.end();
      return;
    }
    if (req.method === "GET") {
      const mission = url.searchParams.get("mission") ?? "all";
      const limit = Math.min(Number(url.searchParams.get("limit")) || 20, MAX_LIST);
      sendJson(res, 200, { entries: scores.list(mission, limit) }, { "cache-control": "no-cache" });
      return;
    }
    if (req.method !== "POST") return sendJson(res, 405, { error: "Use GET or POST." });
    const origin = String(req.headers.origin ?? "");
    if (allowedOrigins.length && origin && !allowedOrigins.includes(origin)) return sendJson(res, 403, { error: "Origin not allowed." });
    if (!submitLimit.allow(clientIp(req))) return sendJson(res, 429, { error: "Too many submissions. Try again in a minute." }, { "retry-after": "60" });

    const tooBig = () => {
      res.writeHead(413, { "content-type": "application/json", connection: "close", ...CORS });
      res.end(JSON.stringify({ error: "That request is too large." }), () => req.destroy());
    };
    if (Number(req.headers["content-length"] ?? 0) > MAX_SCORE_BODY_BYTES) return tooBig();
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    req.on("data", (c: Buffer) => {
      if (rejected) return;
      size += c.length;
      if (size > MAX_SCORE_BODY_BYTES) {
        rejected = true;
        tooBig();
        return;
      }
      chunks.push(c);
    });
    req.on("error", () => undefined);
    req.on("end", () => {
      if (rejected) return;
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return sendJson(res, 400, { error: "That was not valid JSON." });
      }
      const b = (body ?? {}) as { name?: unknown; flight?: unknown };
      const name = cleanText(b.name, NAME_MAX);
      if (!name) return sendJson(res, 400, { error: "Enter a name of 1 to 20 characters." });
      // The server never trusts a score from a browser: it re-flies the submitted flight and scores that.
      if (!b.flight) return sendJson(res, 400, { error: "Scores are calculated by the server from the recorded flight. Submit the flight, not a score." });
      const v = validateReplay(b.flight);
      if (!v.ok) return sendJson(res, 400, { error: v.reason });
      const rep = replayFlight(v.value);
      if (!rep.ok) return sendJson(res, 422, { error: `This flight could not be verified: ${rep.reason}` });
      const entry = scores.add({ name, missionId: v.value.missionId, craftName: v.value.design.name || "Spacecraft", score: rep.score.total, result: rep.outcome.result, difficulty: v.value.difficulty }, { verified: true });
      sendJson(res, 201, { ok: true, entry, score: rep.score });
    });
  };

  const http: Server = createServer((req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://localhost");
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (url.pathname === "/api/scores") return handleScores(req, res, url);
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: conns.size }));
      return;
    }
    if (req.url === "/api/space" && req.method === "GET") {
      spaceNow().then(
        (data) => {
          res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "public, max-age=300" });
          res.end(JSON.stringify(data));
        },
        () => {
          res.writeHead(502, { "content-type": "application/json", "access-control-allow-origin": "*" });
          res.end(JSON.stringify({ error: "Live space data is not reachable right now." }));
        },
      );
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

  const issueSeat = (c: Conn, room: Room, name: string): string | null => {
    const token = randomBytes(16).toString("hex");
    const err = room.addPlayer(c.id, name, token);
    if (err) return err;
    c.room = room;
    c.token = token;
    send(c.id, { t: "seat", code: room.code, token });
    return null;
  };

  wss.on("connection", (ws, req) => {
    if (allowedOrigins.length && !allowedOrigins.includes(String(req.headers.origin ?? ""))) {
      ws.close(1008, "Origin not allowed");
      return;
    }
    const c: Conn = { id: randomBytes(6).toString("hex"), ws, room: null, tokens: 40, alive: true, token: "" };
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
          if (rooms.size >= MAX_ROOMS) return send(c.id, { t: "error", message: "The server is busy. Try again in a few minutes." });
          const room = new Room(newCode(), !!msg.sandbox, transport, scores);
          rooms.set(room.code, room);
          const err = issueSeat(c, room, String(msg.name ?? ""));
          if (err) {
            rooms.delete(room.code);
            return send(c.id, { t: "error", message: err });
          }
          return;
        }
        case "join": {
          if (c.room) leave(c);
          const room = rooms.get(String(msg.code ?? "").trim().toUpperCase());
          if (!room) return send(c.id, { t: "error", message: "No room with that code." });
          const err = issueSeat(c, room, String(msg.name ?? ""));
          if (err) return send(c.id, { t: "error", message: err });
          return;
        }
        case "rejoin": {
          if (c.room) return;
          const room = rooms.get(String(msg.code ?? "").trim().toUpperCase());
          const p = room?.reattach(String(msg.token ?? ""), c.id);
          if (!room || !p) return send(c.id, { t: "error", message: "That seat is no longer available." });
          // A stale connection that still holds the seat is dropped.
          for (const other of conns.values()) if (other !== c && other.token === msg.token) other.room = null;
          c.room = room;
          c.token = String(msg.token);
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
      const room = c.room;
      c.room = null;
      conns.delete(c.id);
      if (room) {
        room.disconnect(c.id);
        if (room.empty) rooms.delete(room.code);
      }
    });
  });

  let last = Date.now();
  const clock = setInterval(() => {
    const now = Date.now();
    const dt = now - last;
    last = now;
    for (const c of conns.values()) c.tokens = Math.min(40, c.tokens + dt / 50);
    for (const room of rooms.values()) {
      room.tick(dt);
      if (room.empty) rooms.delete(room.code);
    }
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
        scores,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(clock);
            clearInterval(keepAlive);
            for (const c of conns.values()) c.ws.terminate();
            wss.close(() => http.close(() => void scores.flush().then(() => done())));
          }),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const remoteUrl = process.env.SCORES_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
  const remoteToken = process.env.SCORES_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const scoresRemote = remoteUrl && remoteToken ? { url: remoteUrl, token: remoteToken } : null;
  startServer(port, "0.0.0.0", { scoresFile: process.env.SCORES_FILE || "./data/scores.json", scoresRemote }).then((s) => {
    console.log(`AURELIA multiplayer server listening on ws://localhost:${s.port}`);
    console.log(scoresRemote ? "Leaderboard storage: durable remote store plus local file." : "Leaderboard storage: local file only (resets when this host restarts). See the README to add a free durable store.");
    // A redeploy sends SIGTERM; save the leaderboard before exiting.
    for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => void s.close().then(() => process.exit(0)));
  });
}
