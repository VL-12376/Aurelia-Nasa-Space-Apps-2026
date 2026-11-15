import { h } from "../core/dom";

export interface DialogAction {
  label: string;
  kind?: "primary" | "danger" | "ghost";
  /** Return false to keep the dialog open. */
  onClick: () => void | boolean;
  /** Receives focus when the dialog opens. */
  default?: boolean;
}

export interface DialogOptions {
  title: string;
  body: Node | string;
  actions: DialogAction[];
  onClose?: () => void;
  /** Extra class on the dialog box, for wider layouts. */
  className?: string;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
let counter = 0;

/** Modal dialog with Escape and backdrop dismissal, a focus trap, and focus restored on close. */
export function openDialog(opts: DialogOptions): { close(): void } {
  const id = `dlg-${++counter}`;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let closed = false;

  const buttons = opts.actions.map((a) =>
    h("button", { class: `btn small dlg-btn ${a.kind ?? "ghost"}`, type: "button", onclick: () => { if (a.onClick() !== false) close(); } }, a.label),
  );
  const box = h(
    "div",
    { class: `dlg ${opts.className ?? ""}`.trim(), role: "dialog", "aria-modal": "true", "aria-labelledby": `${id}-title`, "aria-describedby": `${id}-body`, tabindex: "-1" },
    h("h3", { class: "dlg-title", id: `${id}-title` }, opts.title),
    h("div", { class: "dlg-body", id: `${id}-body` }, opts.body),
    opts.actions.length ? h("div", { class: "dlg-actions" }, ...buttons) : null,
  );
  const backdrop = h("div", { class: "dlg-backdrop", onmousedown: (e: MouseEvent) => { if (e.target === backdrop) close(); } }, box);
  // Keys typed in the dialog must not trigger the screen's shortcuts underneath (Delete, Ctrl+Z).
  backdrop.addEventListener("keydown", (e) => e.stopPropagation());

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) {
      e.preventDefault();
      box.focus();
      return;
    }
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement;
    if (!box.contains(active)) {
      e.preventDefault();
      firstEl.focus();
    } else if (e.shiftKey && (active === firstEl || active === box)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    const hadFocus = box.contains(document.activeElement) || document.activeElement === document.body;
    backdrop.remove();
    // A dialog opened from this one's button keeps the focus it took.
    if (hadFocus) previous?.focus?.();
    opts.onClose?.();
  }

  document.addEventListener("keydown", onKey, true);
  document.body.append(backdrop);
  const defaultIndex = opts.actions.findIndex((a) => a.default);
  (defaultIndex >= 0 ? buttons[defaultIndex] : box).focus();
  return { close };
}
