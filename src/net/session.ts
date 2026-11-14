import type { RoleId } from "../crew/roles";
import { DEFAULT_PORT, type ClientMsg, type FlightSnapshot, type PlayerView, type RoomView, type ServerMsg } from "./protocol";

export interface ChatLine {
  from: string;
  role: RoleId | null;
  ai: boolean;
  text: string;
  at: number;
}

export type ConnStatus = "offline" | "connecting" | "online" | "reconnecting";

type Listener = () => void;

const SEAT_KEY = "aurelia.seat.v1";

interface Seat {
  url: string;
  code: string;
  token: string;
}

/**
 * Browser side of the multiplayer connection. It holds whatever the server last said and sends
 * intents back. It never decides anything itself. If the connection drops during a room, it keeps
 * retrying and reclaims the same seat with a token the server issued.
 */
class Multiplayer {
  status: ConnStatus = "offline";
  id = "";
  room: RoomView | null = null;
  flight: FlightSnapshot | null = null;
  chat: ChatLine[] = [];
  lastError = "";
  private ws: WebSocket | null = null;
  private url = "";
  private seat: Seat | null = null;
  private wanted = false;
  private retryTimer = 0;
  private retries = 0;
  private listeners = new Set<Listener>();
  private roomListeners = new Set<(prev: RoomView | null, next: RoomView) => void>();
  private errorListeners = new Set<(m: string) => void>();

  /** The address players use by default: the hosted server on the public site, this machine's server when playing locally. */
  defaultUrl(): string {
    const configured = (import.meta.env?.VITE_SERVER_URL as string | undefined) ?? "";
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(location.hostname);
    if (!local && configured) return configured;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return local || !configured ? `${proto}://${location.hostname}:${DEFAULT_PORT}` : configured;
  }

  /** True when the page is public (https) and no hosted server was configured, so multiplayer cannot work from here. */
  get unavailableHere(): boolean {
    const configured = (import.meta.env?.VITE_SERVER_URL as string | undefined) ?? "";
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    return location.protocol === "https:" && !local && !configured;
  }

  /** A saved seat from an earlier visit that may still be held on the server. */
  savedSeat(): Seat | null {
    try {
      return JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? "null") as Seat | null;
    } catch {
      return null;
    }
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
    this.url = url;
    this.wanted = true;
    this.status = "connecting";
    this.lastError = "";
    this.emit();
    return this.open(url);
  }

  private open(url: string): Promise<void> {
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
        this.retries = 0;
        this.status = "online";
        this.emit();
        resolve();
      };
      ws.onerror = () => {
        if (!opened) {
          this.status = "offline";
          this.lastError = this.unavailableHere || !/localhost|127\.0\.0\.1|192\.168\.|10\./.test(url) ? `Could not reach the multiplayer server at ${url}. It may be starting up (free hosts sleep when idle). Try again in a minute.` : `Could not reach the multiplayer server at ${url}. Start it with "npm run server".`;
          this.emit();
          reject(new Error(this.lastError));
        }
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        // Connection lost mid-room: keep the room on screen, mark it reconnecting and try to reclaim the seat.
        if (opened && this.wanted && this.seat && this.room) {
          this.status = "reconnecting";
          this.emit();
          this.scheduleRetry();
          return;
        }
        const was = this.room;
        this.status = "offline";
        this.room = null;
        this.flight = null;
        if (opened && was) this.lastError = "Disconnected from the server.";
        this.emit();
      };
      ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)) as ServerMsg);
    });
  }

  private scheduleRetry(): void {
    clearTimeout(this.retryTimer);
    if (!this.seat) return;
    if (this.retries >= 40) {
      this.giveUp("Could not reconnect to the server.");
      return;
    }
    const wait = Math.min(1000 + this.retries * 750, 6000);
    this.retries++;
    this.retryTimer = window.setTimeout(async () => {
      if (!this.seat || !this.wanted) return;
      try {
        await this.open(this.url);
        this.send({ t: "rejoin", code: this.seat.code, token: this.seat.token });
      } catch {
        this.status = "reconnecting";
        this.emit();
        this.scheduleRetry();
      }
    }, wait);
  }

  private giveUp(message: string): void {
    this.forgetSeat();
    this.wanted = false;
    this.status = "offline";
    this.room = null;
    this.flight = null;
    this.lastError = message;
    this.emit();
  }

  private forgetSeat(): void {
    this.seat = null;
    clearTimeout(this.retryTimer);
    try {
      sessionStorage.removeItem(SEAT_KEY);
    } catch {
      /* private mode: nothing to clear */
    }
  }

  /** Try to resume a seat saved by an earlier page load, such as after a refresh. */
  async resume(): Promise<boolean> {
    const s = this.savedSeat();
    if (!s) return false;
    this.seat = s;
    this.url = s.url;
    this.wanted = true;
    this.status = "connecting";
    this.emit();
    try {
      await this.open(s.url);
    } catch {
      this.forgetSeat();
      this.wanted = false;
      return false;
    }
    this.send({ t: "rejoin", code: s.code, token: s.token });
    return true;
  }

  private onMessage(m: ServerMsg): void {
    switch (m.t) {
      case "welcome":
        this.id = m.id;
        break;
      case "seat":
        this.seat = { url: this.url, code: m.code, token: m.token };
        try {
          sessionStorage.setItem(SEAT_KEY, JSON.stringify(this.seat));
        } catch {
          /* private mode: reconnecting within this page still works */
        }
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
        // A seat the server no longer holds cannot be reclaimed, so stop retrying.
        if (this.seat && !this.room && /no longer available/.test(m.message)) this.giveUp(m.message);
        for (const fn of this.errorListeners) fn(m.message);
        break;
      case "left":
        this.forgetSeat();
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
    this.forgetSeat();
    this.lastError = "";
    this.room = null;
    this.flight = null;
    this.chat = [];
    this.emit();
  }

  disconnect(): void {
    this.wanted = false;
    this.forgetSeat();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.status = "offline";
    this.room = null;
    this.flight = null;
    this.chat = [];
  }
}

export const mp = new Multiplayer();
