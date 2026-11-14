import { aiContribute, aiDecide, crewName } from "../src/crew/ai";
import { ROLES, ROLE_BY_ID, roleForEvent, roleForPart, type RoleId } from "../src/crew/roles";
import { newGameState, type GameState } from "../src/core/gameState";
import { trySpend, type BudgetCategoryId } from "../src/budget/budget";
import { Flight, hashSeed, launchBlockers, preflight } from "../src/missions/flight";
import { MISSIONS } from "../src/missions/missions";
import { applyOutcome } from "../src/missions/results";
import { MAX_PLAYERS, type ClientMsg, type FlightSnapshot, type Phase, type PlayerView, type RoomView, type ServerMsg } from "../src/net/protocol";
import { TECHS } from "../src/research/tech";
import { addPart, analyse, emptyDesign, isUnlocked, type BuiltCraft, type Design } from "../src/spacecraft/design";
import { PART_BY_ID } from "../src/spacecraft/parts";

export interface Transport {
  send(playerId: string, msg: ServerMsg): void;
}

interface Player {
  id: string;
  name: string;
  role: RoleId | null;
  ready: boolean;
  connected: boolean;
}

const HUMAN_DECISION_MS = 45_000;
const AI_DECISION_MS = 2_500;
const SNAPSHOT_MS = 100;

/** Re-adds every part through the normal rules. Anything the rules reject makes the design invalid. */
export function validateDesign(design: Design, researched: string[]): string | null {
  if (!design || !Array.isArray(design.parts)) return "Invalid design.";
  if (design.parts.length > 60) return "Design is too large.";
  let d: Design = emptyDesign();
  // The bus must be present before anything that mounts on it.
  const ordered = [...design.parts].sort((a, b) => Number(!(PART_BY_ID[a.partId]?.category === "structure")) - Number(!(PART_BY_ID[b.partId]?.category === "structure")));
  for (const ref of ordered) {
    const p = PART_BY_ID[ref.partId];
    if (!p) return `Unknown part ${String(ref.partId)}.`;
    if (!["s1", "s2", "s3", "craft"].includes(ref.target)) return "Invalid stage.";
    if (!isUnlocked(p, researched)) return `${p.name} is not researched yet.`;
    const r = addPart(d, ref.partId, ref.target);
    if (!r.ok) return r.reason ?? "That layout is not allowed.";
    if (r.target !== ref.target) return `${p.name} cannot go there.`;
    d = r.design;
  }
  return null;
}

function multiset(d: Design): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of d.parts) m.set(`${r.partId}|${r.target}`, (m.get(`${r.partId}|${r.target}`) ?? 0) + 1);
  return m;
}

export class Room {
  phase: Phase = "lobby";
  players: Player[] = [];
  game: GameState;
  design: Design = emptyDesign();
  missionId: string | null = null;
  flight: Flight | null = null;
  warp: "auto" | number = "auto";
  paused = false;
  hostId = "";

  private now = 0;
  private snapshotAcc = 0;
  private decisionDeadline = 0;
  private decisionKey = "";
  private flightSeed = 0;
  private flightCraft = "";
  private lastSnapshot: FlightSnapshot | null = null;
  private ended = false;

  constructor(readonly code: string, readonly sandbox: boolean, private net: Transport) {
    this.game = newGameState("multiplayer", sandbox ? 4 : 1);
    this.game.agencyName = "AURELIA";
    if (sandbox) this.game.researchedTech = TECHS.map((t) => t.id);
  }

  /* ---------- membership ---------- */

  addPlayer(id: string, name: string): string | null {
    if (this.players.length >= MAX_PLAYERS) return "This room is full (4 players).";
    if (this.phase !== "lobby") return "This mission has already started. Ask the host to set up a new room.";
    const clean = name.trim().slice(0, 20) || `Player ${this.players.length + 1}`;
    this.players.push({ id, name: clean, role: null, ready: false, connected: true });
    if (!this.hostId) this.hostId = id;
    this.sync();
    return null;
  }

  removePlayer(id: string): void {
    const gone = this.players.find((p) => p.id === id);
    this.players = this.players.filter((p) => p.id !== id);
    if (this.hostId === id) this.hostId = this.players[0]?.id ?? "";
    if (gone) this.say(null, false, `${gone.name} left the room.`);
    this.sync();
  }

  get empty(): boolean {
    return this.players.length === 0;
  }

  private human(role: RoleId): Player | undefined {
    return this.players.find((p) => p.role === role);
  }

  aiRoles(): RoleId[] {
    return ROLES.filter((r) => !this.human(r.id)).map((r) => r.id);
  }

  /** A player may act for their own role, or for an AI-run role if they are the host. */
  private actsFor(p: Player, role: RoleId): boolean {
    return p.role === role || (!this.human(role) && p.id === this.hostId);
  }

  private researched(): string[] {
    return this.game.researchedTech;
  }

  /* ---------- messages ---------- */

  handle(playerId: string, msg: ClientMsg): void {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    const err = (m: string) => this.net.send(playerId, { t: "error", message: m });
    switch (msg.t) {
      case "role": {
        if (this.phase !== "lobby") return err("Roles are locked once the mission has started.");
        if (msg.role) {
          if (!ROLE_BY_ID[msg.role]) return err("Unknown role.");
          const holder = this.human(msg.role);
          if (holder && holder.id !== p.id) return err(`${ROLE_BY_ID[msg.role].title} is already taken by ${holder.name}.`);
        }
        p.role = msg.role;
        p.ready = false;
        return this.sync();
      }
      case "ready":
        if (this.phase !== "lobby") return;
        if (!p.role && msg.ready) return err("Pick a role first.");
        p.ready = !!msg.ready;
        return this.sync();
      case "chat": {
        const text = String(msg.text ?? "").trim().slice(0, 240);
        if (text) this.say(p.role, false, text, p.name);
        return;
      }
      case "start":
        return this.start(p, err);
      case "design":
        return this.editDesign(p, msg.design, err);
      case "aiHelp":
        return this.aiHelp(p, msg.role, err);
      case "mission": {
        if (this.phase !== "hangar") return;
        if (!this.actsFor(p, "controller")) return err("Only the Mission Controller chooses the mission.");
        const m = MISSIONS.find((x) => x.id === msg.id);
        if (!m || m.season > this.game.season) return err("That mission is not available.");
        this.missionId = m.id;
        return this.sync();
      }
      case "build":
        return this.build(p, err);
      case "launch":
        return this.launch(p, msg.craftId, err);
      case "time": {
        if (this.phase !== "flight") return;
        if (!this.actsFor(p, "controller")) return err("Only the Mission Controller controls time.");
        if (msg.mode === "pause") this.paused = !this.paused;
        else {
          this.paused = false;
          this.warp = msg.mode === "auto" ? "auto" : Math.min(Math.max(Number(msg.mode) || 1, 1), 1000);
        }
        return this.pushFlight(true);
      }
      case "decide": {
        const f = this.flight;
        if (this.phase !== "flight" || !f?.pending) return;
        const owner = roleForEvent(f.pending.eventId);
        if (p.role !== owner) return err(`That decision belongs to the ${ROLE_BY_ID[owner].title}.`);
        const opt = f.pending.options.find((o) => o.id === msg.option);
        if (!opt || opt.disabled) return err("That option is not available.");
        this.say(owner, false, `I'll go with: ${opt.label}.`, p.name);
        f.decide(msg.option);
        this.afterStep();
        return;
      }
      case "toHangar":
        if (this.phase !== "debrief" || p.id !== this.hostId) return;
        this.flight = null;
        this.phase = "hangar";
        this.design = emptyDesign();
        this.lastSnapshot = null;
        return this.sync();
      case "leave":
        return;
      default:
        return;
    }
  }

  private start(p: Player, err: (m: string) => void): void {
    if (this.phase !== "lobby") return;
    if (p.id !== this.hostId) return err("Only the host can start the mission.");
    const humans = this.players.filter((x) => x.role === null);
    // Anyone without a role takes whatever role is still free, in crew order.
    for (const h of humans) {
      const free = ROLES.find((r) => !this.human(r.id));
      if (free) h.role = free.id;
    }
    this.phase = "hangar";
    this.missionId = MISSIONS.find((m) => m.season <= this.game.season && !this.game.completedMissions.includes(m.id))?.id ?? MISSIONS[0].id;
    const ai = this.aiRoles();
    this.say(null, false, `Mission started. ${ai.length ? `AI crew are covering: ${ai.map((r) => ROLE_BY_ID[r].title).join(", ")}.` : "All four roles are played by people."}`);
    this.sync();
  }

  private editDesign(p: Player, next: Design, err: (m: string) => void): void {
    if (this.phase !== "hangar") return;
    const invalid = validateDesign(next, this.researched());
    if (invalid) {
      this.sync();
      return err(invalid);
    }
    const before = multiset(this.design);
    const after = multiset(next);
    const keys = new Set([...before.keys(), ...after.keys()]);
    for (const k of keys) {
      if ((before.get(k) ?? 0) === (after.get(k) ?? 0)) continue;
      const [partId] = k.split("|");
      const owner = roleForPart(PART_BY_ID[partId]);
      if (!this.actsFor(p, owner)) {
        this.sync();
        return err(`${PART_BY_ID[partId].name} belongs to the ${ROLE_BY_ID[owner].title}.`);
      }
    }
    this.design = { name: String(next.name ?? "").slice(0, 24) || this.design.name, parts: next.parts.map((r) => ({ partId: r.partId, target: r.target })) };
    this.sync();
  }

  private aiHelp(p: Player, role: RoleId, err: (m: string) => void): void {
    if (this.phase !== "hangar") return;
    if (this.human(role)) return err(`${ROLE_BY_ID[role].name} is played by ${this.human(role)!.name}.`);
    const mission = MISSIONS.find((m) => m.id === this.missionId);
    if (!mission) return err("Choose a mission first so the crew knows what to design for.");
    const result = aiContribute(role, this.design, mission, this.researched());
    this.design = result.design;
    for (const note of result.notes) this.say(role, true, note);
    this.sync();
    void p;
  }

  private cost(design: Design) {
    return analyse(design);
  }

  private build(p: Player, err: (m: string) => void): void {
    if (this.phase !== "hangar") return;
    if (!this.actsFor(p, "aerospace")) return err("Only the Aerospace Engineer approves the build.");
    const stats = this.cost(this.design);
    if (stats.errors.length) return err(`Cannot build yet: ${stats.errors[0]}`);
    if (stats.cost > this.game.funds) return err("Not enough funds for this design.");
    const g = this.game;
    for (const [cat, amount] of Object.entries(stats.costByCategory) as [BudgetCategoryId, number][]) {
      if (amount > 0) g.funds = trySpend(g.funds, g.allocation, cat, amount).funds;
    }
    const name = this.design.name.trim() || `AUR-${g.fleet.length + 1}`;
    const craft: BuiltCraft = { id: `craft-${g.fleet.length + 1}-${this.now}`, name, parts: this.design.parts.map((r) => ({ ...r })), costPaid: stats.cost, year: g.year, deltaV: stats.deltaV, payloadKg: stats.payloadMass };
    g.fleet.push(craft);
    this.say("aerospace", true, `${name} is built and in the hangar.`);
    this.design = { name: `AUR-${g.fleet.length + 1}`, parts: this.design.parts.map((r) => ({ ...r })) };
    this.sync();
  }

  private launch(p: Player, craftId: string, err: (m: string) => void): void {
    if (this.phase !== "hangar") return;
    if (!this.actsFor(p, "controller")) return err("Only the Mission Controller launches.");
    const mission = MISSIONS.find((m) => m.id === this.missionId);
    const craft = this.game.fleet.find((c) => c.id === craftId);
    if (!mission || !craft) return err("Choose a mission and a built spacecraft first.");
    const design: Design = { name: craft.name, parts: craft.parts };
    const blockers = launchBlockers(preflight(analyse(design), design, mission, this.game.funds));
    if (blockers.length) return err(`Launch blocked: ${blockers[0].label}. ${blockers[0].detail}`);
    const g = this.game;
    g.funds = trySpend(g.funds, g.allocation, "operations", mission.costUsd).funds;
    g.fleet = g.fleet.filter((c) => c.id !== craftId);
    g.flights += 1;
    this.flightSeed = hashSeed(`${this.code}:${craftId}:${mission.id}:${g.flights}`);
    this.flightCraft = craft.name;
    this.flight = new Flight(design, mission, this.flightSeed);
    this.warp = "auto";
    this.paused = false;
    this.decisionKey = "";
    this.ended = false;
    this.phase = "flight";
    this.say("controller", false, `Launch. ${mission.name} is go.`, this.human("controller")?.name);
    this.sync();
    this.pushFlight(true);
  }

  /* ---------- the flight loop ---------- */

  /** Advance the room by dtMs of real time. Called by the server clock. */
  tick(dtMs: number): void {
    this.now += dtMs;
    const f = this.flight;
    if (this.phase !== "flight" || !f) return;
    if (f.status === "decision") {
      this.handleDecisionTimer();
    } else if (f.status === "running" && !this.paused) {
      const burning = f.telemetry().burning;
      const warp = this.warp === "auto" ? Math.max(1, Math.min(f.chunkSeconds() / (burning ? 6 : 8), 5e7)) : this.warp;
      f.step(Math.min(dtMs / 1000, 0.1) * warp);
    }
    this.afterStep();
    this.snapshotAcc += dtMs;
    if (this.snapshotAcc >= SNAPSHOT_MS) this.pushFlight(false);
  }

  private handleDecisionTimer(): void {
    const f = this.flight!;
    const pending = f.pending;
    if (!pending) return;
    const key = `${pending.eventId}@${f.t}`;
    const owner = roleForEvent(pending.eventId);
    if (key !== this.decisionKey) {
      this.decisionKey = key;
      const human = this.human(owner);
      this.decisionDeadline = this.now + (human ? HUMAN_DECISION_MS : AI_DECISION_MS);
      this.say(owner, !human, human ? `${pending.title}. ${human.name}, this one is yours.` : `${pending.title}. I've got this one.`, human?.name);
      this.pushFlight(true);
      return;
    }
    if (this.now >= this.decisionDeadline) {
      const r = aiDecide(pending, f);
      const human = this.human(owner);
      this.say(owner, true, human ? `${crewName(owner)} is covering for ${human.name}, who did not answer in time. ${r.line}` : r.line);
      f.decide(r.option);
      this.afterStep();
    }
  }

  private afterStep(): void {
    const f = this.flight;
    if (!f || this.ended) return;
    if (f.outcome && (f.status === "success" || f.status === "partial" || f.status === "failed")) {
      this.ended = true;
      const mission = MISSIONS.find((m) => m.id === this.missionId)!;
      applyOutcome(this.game, mission, this.flightCraft, this.flightSeed, f.outcome, f.log);
      this.pushFlight(true);
      this.phase = "debrief";
      this.say(null, false, `${mission.name}: ${f.outcome.headline}.`);
      this.sync();
    }
  }

  /* ---------- output ---------- */

  private view(): RoomView {
    return {
      code: this.code,
      phase: this.phase,
      sandbox: this.sandbox,
      players: this.players.map<PlayerView>((p) => ({ id: p.id, name: p.name, role: p.role, ready: p.ready, host: p.id === this.hostId, connected: p.connected })),
      aiRoles: this.aiRoles(),
      missionId: this.missionId,
      design: this.design,
      game: this.game,
    };
  }

  /** Send the room state to everyone. */
  sync(): void {
    const room = this.view();
    for (const p of this.players) this.net.send(p.id, { t: "room", room });
  }

  snapshot(): FlightSnapshot | null {
    const f = this.flight;
    if (!f) return null;
    const pending = f.pending;
    const owner = pending ? roleForEvent(pending.eventId) : null;
    return {
      t: f.t,
      status: f.status,
      missionId: f.mission.id,
      design: f.design,
      telemetry: f.telemetry(),
      pending: pending && owner ? { ...pending, owner, ownerIsAi: !this.human(owner), secondsLeft: Math.max(0, Math.round((this.decisionDeadline - this.now) / 1000)) } : null,
      log: f.log.slice(-14),
      logLength: f.log.length,
      timeline: f.timeline(),
      objectives: f.objectivesState(),
      activeTargets: f.activeTargets(),
      chunk: f.chunkSeconds(),
      outcome: f.outcome,
      paused: this.paused,
      warp: this.warp,
    };
  }

  private pushFlight(force: boolean): void {
    if (!this.flight) return;
    this.snapshotAcc = 0;
    const snap = this.snapshot();
    if (!snap) return;
    this.lastSnapshot = snap;
    void force;
    for (const p of this.players) this.net.send(p.id, { t: "flight", flight: snap });
  }

  /** Re-send current state to one player, for example after they connect. */
  resend(playerId: string): void {
    this.net.send(playerId, { t: "room", room: this.view() });
    if (this.lastSnapshot) this.net.send(playerId, { t: "flight", flight: this.lastSnapshot });
  }

  private say(role: RoleId | null, ai: boolean, text: string, name?: string): void {
    const from = role ? (ai ? crewName(role) : name ?? ROLE_BY_ID[role].name) : "AURELIA";
    for (const p of this.players) this.net.send(p.id, { t: "chat", from, role, ai, text, at: Date.now() });
  }
}
