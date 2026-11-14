import { h } from "../core/dom";
import { ROLES, type RoleDef, type RoleId } from "../crew/roles";
import { mp } from "../net/session";
import { tilt } from "./fx";

/** A portrait with a holographic treatment: slow breathing, scanlines, a sweeping scan band and corner marks. */
export function holoPortrait(r: RoleDef, extra: (Node | null)[] = []): HTMLElement {
  return h(
    "div",
    { class: "rc-photo holo", style: { "--rc": r.color } },
    h("img", { src: r.portrait, alt: `${r.name}, ${r.title}`, loading: "lazy" }),
    h("div", { class: "holo-lines" }),
    h("div", { class: "holo-scan" }),
    h("div", { class: "holo-frame" }),
    ...extra,
  );
}

/** A round portrait with a rotating status ring. The ring spins faster for the player's own role. */
export function avatar(r: RoleDef, me = false): HTMLElement {
  return h("span", { class: `avatar${me ? " me" : ""}`, style: { "--rc": r.color } }, h("i", { class: "avatar-ring" }), h("img", { src: r.portrait, alt: "" }));
}

export function roleCard(r: RoleDef, opts: { badge?: string; badgeTone?: string; selected?: boolean; dim?: boolean; footer?: Node | null; onclick?: () => void; compact?: boolean } = {}): HTMLElement {
  const idx = ROLES.findIndex((x) => x.id === r.id) + 1;
  const body = [
    holoPortrait(r, [opts.badge ? h("span", { class: `rc-badge ${opts.badgeTone ?? ""}` }, opts.badge) : null]),
    h(
      "div",
      { class: "rc-body" },
      h("div", { class: "rc-role mono", style: { color: r.color } }, r.title.toUpperCase()),
      h("h3", { class: "rc-name" }, r.name),
      h("p", { class: "rc-tag" }, `“${r.tagline}”`),
      h("div", { class: "rc-id mono" }, h("span", null, `CREW-0${idx}`), h("span", { class: "rc-barcode" }), h("span", { class: "rc-stat" }, h("i"), "ONLINE")),
      opts.compact ? null : h("p", { class: "rc-bio" }, r.bio),
      opts.compact ? null : h("ul", { class: "rc-duties" }, ...r.duties.map((d) => h("li", null, d))),
      opts.footer ?? null,
    ),
  ];
  const cls = `role-card${opts.selected ? " selected" : ""}${opts.dim ? " dim" : ""}`;
  const el = opts.onclick ? h("button", { class: cls, onclick: opts.onclick, style: { "--rc": r.color } }, ...body) : h("div", { class: cls, style: { "--rc": r.color } }, ...body);
  tilt(el);
  return el;
}

export interface CrewRow {
  role: RoleId;
  /** "You", an AI label, or another player's name. */
  who: string;
  ai: boolean;
  me: boolean;
  line?: string;
  speaking?: boolean;
}

/** Compact crew panel for the mission-control screen: four faces, who is playing, and what they just said. */
export function crewStrip(): { el: HTMLElement; update: (rows: CrewRow[]) => void } {
  const el = h("div", { class: "mc-card crew-strip" }, h("h4", null, "Crew"));
  const list = h("div", { class: "crew-list" });
  el.append(list);
  const update = (rows: CrewRow[]) => {
    list.replaceChildren(
      ...rows.map((row) => {
        const def = ROLES.find((r) => r.id === row.role)!;
        return h(
          "div",
          { class: `crew-row${row.speaking ? " speaking" : ""}${row.me ? " me" : ""}`, style: { "--rc": def.color } },
          avatar(def, row.me),
          h("div", { class: "crew-text" }, h("div", { class: "crew-name" }, def.name, h("span", { class: `crew-who ${row.ai ? "ai" : "human"}` }, row.me ? "YOU" : row.ai ? "AI" : row.who), row.speaking ? h("span", { class: "voice", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i")) : null), h("div", { class: "crew-title mono" }, def.title), row.line ? h("div", { class: "crew-line" }, row.line) : null),
        );
      }),
    );
  };
  return { el, update };
}

/** Floating chat for shared sessions. */
export function chatDock(): HTMLElement {
  let open = false;
  let seen = mp.chat.length;
  const log = h("div", { class: "chat-log", "aria-live": "polite" });
  const input = h("input", { class: "chat-input", type: "text", maxlength: 240, placeholder: "Message the crew…", "aria-label": "Chat message" }) as HTMLInputElement;
  const body = h("div", { class: "chat-body", hidden: true }, log, input);
  const toggle = h("button", { class: "chat-toggle", "aria-expanded": "false", onclick: () => { open = !open; body.hidden = !open; seen = mp.chat.length; toggle.setAttribute("aria-expanded", String(open)); render(); } }, "Crew chat");
  const dock = h("div", { class: "chat-dock" }, toggle, body);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      mp.send({ t: "chat", text: input.value.trim() });
      input.value = "";
    }
    e.stopPropagation();
  });
  const render = () => {
    if (open) seen = mp.chat.length;
    const unread = mp.chat.length - seen;
    toggle.textContent = unread > 0 ? `Crew chat · ${unread} new` : "Crew chat";
    toggle.classList.toggle("unread", unread > 0);
    log.replaceChildren(
      ...mp.chat.slice(-12).map((l) => {
        const def = ROLES.find((r) => r.id === l.role);
        return h("div", { class: `chat-line${l.ai ? " ai" : ""}` }, h("strong", { style: { color: def?.color ?? "var(--lavender)" } }, `${l.from}${l.ai ? " (AI)" : ""}: `), l.text);
      }),
    );
    log.scrollTop = log.scrollHeight;
  };
  render();
  const off = mp.subscribe(render);
  // Detach when the dock leaves the page so listeners do not pile up.
  const obs = new MutationObserver(() => {
    if (!document.body.contains(dock)) {
      off();
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  return dock;
}
