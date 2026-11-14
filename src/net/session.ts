import type { RoleId } from "../crew/roles";
import { DEFAULT_PORT, type ClientMsg, type FlightSnapshot, type PlayerView, type RoomView, type ServerMsg } from "./protocol";

export interface ChatLine {
  from: string;
  role: RoleId | null;
  ai: boolean;
  text: string;
  at: number;
}

export type ConnStatus = "offline" | "connecting" | "online";

type Listener = () => void;

/**
 * Browser side of the multiplayer connection. It holds whatever the server last said and sends
 * intents back. It never decides anything itself.
 */
class Multiplayer {
  status: ConnStatus = "offline";
  id = "";
  room: RoomView | null = null;
  flight: FlightSnapshot | null = null;
  chat: ChatLine[] = [];
  lastError = "";
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private roomListeners = new Set<(prev: RoomView | null, next: RoomView) => void>();
  private errorListeners = new Set<(m: string) => void>();

  defaultUrl(): string {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.hostname}:${DEFAULT_PORT}`;
  }

  get active(): boolean {
    return this.room !== null;
  }

  get me(): PlayerView | undefined {
    return this.room?.players.find((p) => p.id === this.id);
  }

  get role(): RoleId | null {
    return this.me?.role ?? null;
  }

  get isHost(): boolean {
    return !!this.me?.host;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onRoom(fn: (prev: RoomView | null, next: RoomView) => void): () => void {
    this.roomListeners.add(fn);
    return () => this.roomListeners.delete(fn);
  }

  onError(fn: (m: string) => void): () => void {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  connect(url: string): Promise<void> {
    this.disconnect();
    this.status = "connecting";
    this.lastError = "";
    this.emit();
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        this.status = "offline";
        this.emit();
        return reject(new Error("That server address is not valid."));
      }
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.status = "online";
        this.emit();
        resolve();
      };
      ws.onerror = () => {
        if (!opened) {
          this.status = "offline";
          this.lastError = `Could not reach the multiplayer server at ${url}. Start it with "npm run server".`;
          this.emit();
          reject(new Error(this.lastError));
        }
      };
      ws.onclose = () => {
        const was = this.room;
        this.status = "offline";
        this.ws = null;
        this.room = null;
        this.flight = null;
        if (opened && was) this.lastError = "Disconnected from the server.";
        this.emit();
      };
      ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)) as ServerMsg);
    });
  }

  private onMessage(m: ServerMsg): void {
    switch (m.t) {
      case "welcome":
        this.id = m.id;
        break;
      case "room": {
        const prev = this.room;
        this.room = m.room;
        if (m.room.phase === "hangar" || m.room.phase === "lobby") this.flight = null;
        for (const fn of this.roomListeners) fn(prev, m.room);
        break;
      }
      case "flight":
        this.flight = m.flight;
        break;
      case "chat":
        this.chat.push({ from: m.from, role: m.role, ai: m.ai, text: m.text, at: m.at });
        if (this.chat.length > 120) this.chat.shift();
        break;
      case "error":
        this.lastError = m.message;
        for (const fn of this.errorListeners) fn(m.message);
        break;
      case "left":
        this.room = null;
        this.flight = null;
        this.chat = [];
        break;
    }
    this.emit();
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  leave(): void {
    this.send({ t: "leave" });
    this.lastError = "";
    this.room = null;
    this.flight = null;
    this.chat = [];
    this.emit();
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.status = "offline";
    this.room = null;
    this.flight = null;
    this.chat = [];
  }
}

export const mp = new Multiplayer();
