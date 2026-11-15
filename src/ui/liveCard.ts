import { h } from "../core/dom";
import { fmtKm, loadSpaceNow, type SpaceNow } from "../net/live";
import { historyFor } from "../data/real";

const fmtLd = (ld: number) => (ld < 10 ? ld.toFixed(1) : Math.round(ld).toString());

function render(host: HTMLElement, data: SpaceNow | null): void {
  if (!data) {
    host.replaceChildren(h("p", { class: "muted small" }, "Live NASA/JPL data comes through the game server, which is not reachable right now. Locally, start it with npm run server. On the public game it may be waking up; open this screen again in a minute."));
    return;
  }
  const rows: (Node | null)[] = [];
  if (data.moon) {
    const m = data.moon;
    rows.push(
      h("div", { class: "live-moon" }, h("span", { class: "muted small" }, "The Moon is"), h("strong", { class: "mono" }, fmtKm(m.distanceKm)), h("span", { class: "muted small" }, `from Earth right now · moving ${m.speedKms.toFixed(2)} km/s · radio takes ${m.lightTimeS.toFixed(2)} s one way`)),
    );
  }
  if (data.approaches.length) {
    rows.push(
      h("h5", null, "Next asteroid close approaches"),
      h(
        "ul",
        { class: "hq3-list live-list" },
        ...data.approaches.slice(0, 4).map((a) =>
          h(
            "li",
            { title: `Absolute magnitude H ${a.h}. Size is a range from H, assuming the surface reflects between 5% and 25% of sunlight.` },
            h("span", { class: "mono" }, a.name),
            h("span", { class: "muted small" }, `${a.date.slice(0, 11)} · ${fmtLd(a.distanceLd)} Moon distances away · ${a.speedKms.toFixed(1)} km/s · about ${a.diameterM[0]}–${a.diameterM[1]} m`),
          ),
        ),
      ),
      h("p", { class: "muted small" }, "All of these pass safely. Tracking them is how we know nothing is coming."),
    );
  }
  host.replaceChildren(...rows.filter((r): r is Node => r !== null), h("p", { class: "muted small live-src" }, `Source: ${data.sources.join("; ")}. Updated ${data.fetchedAt.slice(11, 16)} UTC.`));
}

/** A card that fills itself with live NASA/JPL data. */
export function liveSpaceCard(): HTMLElement {
  const body = h("div", { class: "live-body" }, h("p", { class: "muted small" }, "Contacting NASA/JPL…"));
  const el = h("section", { class: "hq3-card live-card" }, h("h4", null, "Space right now", h("span", { class: "live-dot", title: "Live data" }, "LIVE")), body);
  void loadSpaceNow().then((d) => render(body, d));
  return el;
}

/** A real event from space history for today, or the next one coming up. */
export function historyCard(): HTMLElement {
  const { event, daysAway } = historyFor(new Date());
  return h(
    "section",
    { class: "hq3-card" },
    h("h4", null, daysAway === 0 ? "On this day in space" : "Coming up in space history"),
    h("p", { class: "history-year mono" }, `${event.year} · ${daysAway === 0 ? "today" : daysAway === 1 ? "tomorrow" : `in ${daysAway} days`}`),
    h("p", null, event.text),
  );
}
