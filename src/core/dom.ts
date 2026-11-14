type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; onclick?: (e: MouseEvent) => void };

/** Tiny hyperscript helper so screens stay readable without a UI framework. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") el.className = String(value);
      else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === "style" && typeof value === "object") {
        Object.assign(el.style, value);
      } else if (value === true) el.setAttribute(key, "");
      else el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function toast(message: string): void {
  let host = document.getElementById("toasts");
  if (!host) {
    host = h("div", { id: "toasts" });
    document.body.append(host);
  }
  const t = h("div", { class: "toast", role: "status" }, message);
  host.append(t);
  setTimeout(() => t.remove(), 3500);
}
