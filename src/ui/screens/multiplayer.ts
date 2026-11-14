import { h } from "../../core/dom";
import { router } from "../../core/router";
import { store } from "../../core/store";
import { ROLES, type RoleId } from "../../crew/roles";
import type { ClientMsg } from "../../net/protocol";
import { mp } from "../../net/session";
import { chatDock, roleCard } from "../crew";

/** Multiplayer lobby: connect to the server, create or join a room, pick one of four roles. */
export function multiplayerScreen(): HTMLElement {
  const settings = store.get().settings;
  let name = settings.playerName || "";
  let url = settings.serverUrl || mp.defaultUrl();
  let sandbox = false;
  let code = "";
  let busy = false;

  const root = h("main", { class: "screen" });
  const body = h("div", { class: "mode-grid wide" });
  root.append(body);

  async function withConnection(msg: ClientMsg): Promise<void> {
    store.updateSettings({ playerName: name, serverUrl: url });
    busy = true;
    render();
    try {
      if (mp.status !== "online") await mp.connect(url);
      mp.send(msg);
    } catch {
      /* the error is shown from mp.lastError */
    }
    busy = false;
    render();
  }

  function render(): void {
    const room = mp.room;
    body.replaceChildren(
      h("div", { class: "back-row" }, h("button", { class: "btn ghost small", onclick: () => { if (room) mp.leave(); router.navigate("menu"); } }, "Back"), h("h2", null, "Cooperative Multiplayer")),
      room ? lobby() : connectPanel(),
    );
  }

  function connectPanel(): HTMLElement {
    return h(
      "div",
      { class: "grid" },
      h("div", { class: "mp-hero" }, h("img", { src: "/crew/crew-banner.jpg", alt: "The AURELIA crew around the holographic mission table" }), h("div", { class: "mp-hero-text" }, h("h2", null, "Fly it together"), h("p", null, "Up to four people share one spacecraft and one mission. Each plays a specialist: the Aerospace Engineer, Propulsion Engineer, Mission Controller or Science and Systems Officer. Anyone not playing is covered by AI crew."))),
      h(
        "div",
        { class: "grid cols-2" },
        h(
          "div",
          { class: "panel hud mp-form" },
          h("h3", null, "Your details"),
          field("Your name", h("input", { type: "text", maxlength: 20, value: name, placeholder: "Call sign", oninput: (e: Event) => { name = (e.target as HTMLInputElement).value; } })),
          field("Server address", h("input", { type: "text", value: url, spellcheck: "false", oninput: (e: Event) => { url = (e.target as HTMLInputElement).value; } })),
          h("p", { class: "muted small" }, "The multiplayer server must be running. On the machine that hosts it, run ", h("code", null, "npm run server"), ". Other players use that machine's address in place of localhost."),
          mp.lastError ? h("p", { class: "bad small" }, mp.lastError) : null,
          mp.status === "connecting" ? h("p", { class: "muted small" }, "Connecting…") : null,
        ),
        h(
          "div",
          { class: "panel hud mp-form" },
          h("h3", null, "Start or join"),
          h("label", { class: "mp-check" }, h("input", { type: "checkbox", checked: sandbox, onchange: (e: Event) => { sandbox = (e.target as HTMLInputElement).checked; } }), " Sandbox: unlock all technology so every mission can be flown"),
          h("button", { class: "btn", disabled: busy, onclick: () => withConnection({ t: "create", name, sandbox }) }, "Create a room"),
          h("div", { class: "mp-or mono" }, "OR"),
          field("Room code", h("input", { type: "text", maxlength: 4, value: code, placeholder: "ABCD", class: "mono", oninput: (e: Event) => { code = (e.target as HTMLInputElement).value.toUpperCase(); (e.target as HTMLInputElement).value = code; } })),
          h("button", { class: "btn ghost", disabled: busy, onclick: () => withConnection({ t: "join", code, name }) }, "Join a room"),
        ),
      ),
    );
  }

  function lobby(): HTMLElement {
    const room = mp.room!;
    const me = mp.me;
    const taken = new Map<RoleId, string>();
    for (const p of room.players) if (p.role) taken.set(p.role, p.name);
    return h(
      "div",
      { class: "grid" },
      h(
        "div",
        { class: "panel hud mp-code" },
        h("div", null, h("div", { class: "muted mono small" }, "ROOM CODE"), h("div", { class: "mp-code-big mono" }, room.code), h("div", { class: "muted small" }, room.sandbox ? "Sandbox: all technology unlocked" : "Campaign: starter technology, Season 1")),
        h("div", { class: "mp-players" }, ...room.players.map((p) => h("div", { class: `mp-player${p.id === mp.id ? " me" : ""}` }, h("span", { class: `dot ${p.ready ? "ready" : ""}` }), h("span", null, `${p.name}${p.host ? " (host)" : ""}${p.id === mp.id ? " · you" : ""}`), h("span", { class: "muted mono small" }, p.role ? ROLES.find((r) => r.id === p.role)!.title : "no role yet")))),
        h("button", { class: "btn ghost small", onclick: () => navigator.clipboard?.writeText(room.code) }, "Copy code"),
      ),
      h("p", { class: "muted small" }, "Pick your role. Roles nobody takes are played by AI crew. When everyone is ready, the host starts the mission."),
      h(
        "div",
        { class: "role-grid" },
        ...ROLES.map((r) => {
          const holder = room.players.find((p) => p.role === r.id);
          const mine = holder?.id === mp.id;
          return roleCard(r, {
            selected: mine,
            badge: holder ? (mine ? `YOU · ${holder.name}` : holder.name) : "AI CREW",
            badgeTone: holder ? "human" : "ai",
            footer: h(
              "button",
              { class: `btn small${mine ? " ghost" : ""}`, disabled: !!holder && !mine, onclick: () => mp.send({ t: "role", role: mine ? null : r.id }) },
              mine ? "Release role" : holder ? `Taken by ${holder.name}` : "Take this role",
            ),
          });
        }),
      ),
      mp.lastError ? h("p", { class: "bad small" }, mp.lastError) : null,
      h(
        "div",
        { class: "mp-actions" },
        me ? h("button", { class: `btn${me.ready ? " ghost" : ""}`, disabled: !me.role, onclick: () => mp.send({ t: "ready", ready: !me.ready }) }, me.ready ? "Not ready" : "I'm ready") : null,
        mp.isHost ? h("button", { class: "btn", onclick: () => mp.send({ t: "start" }) }, "Start mission") : h("span", { class: "muted small" }, "Waiting for the host to start."),
        h("button", { class: "btn ghost small", onclick: () => { mp.leave(); render(); } }, "Leave room"),
      ),
      h("p", { class: "muted small" }, `${taken.size} of 4 roles are played by people. ${4 - taken.size} will be AI crew.`),
    );
  }

  render();
  const off = mp.subscribe(() => render());
  const dock = chatDock();
  root.append(dock);
  router.onLeave(off);
  return root;
}

function field(label: string, input: HTMLElement): HTMLElement {
  return h("label", { class: "mp-field" }, h("span", { class: "muted small" }, label), input);
}
