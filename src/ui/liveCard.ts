import { h } from "../core/dom";
import { fmtKm, loadSpaceNow, type SpaceNow } from "../net/live";
import { DISCLAIMER, historyFor } from "../data/real";
import { describeActivity, describeFlare, type SpaceWeather } from "../data/weather";

const fmtLd = (ld: number) => (ld < 10 ? ld.toFixed(1) : Math.round(ld).toString());
const fmtDelay = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
const AU_KM = 149_597_870.7;
const count = (n: number | null, one: string, many: string) => (n === null ? `${many}: not available` : `${n} ${n === 1 ? one : many}`);

function weatherBlock(w: SpaceWeather): Node[] {
  const latest = w.flares[0];
  const act = describeActivity(w.activity);
  return [
    h("h5", null, "Space weather, last 30 days"),
    h(
      "ul",
      { class: "hq3-list live-list" },
      h("li", { title: "GOES X-ray class: C is common, M is strong, X is the strongest. Each letter is ten times the one before." }, h("span", { class: "mono" }, "Latest flare"), h("span", { class: "muted small" }, latest ? `${describeFlare(latest)}${latest.activeRegion ? ` · active region ${latest.activeRegion}` : ""}` : w.flareCount30d === null ? "not available right now" : "none recorded")),
      h("li", null, h("span", { class: "mono" }, "Events"), h("span", { class: "muted small" }, `${count(w.flareCount30d, "flare", "flares")} · ${count(w.cmeCount30d, "CME", "CMEs")} · ${count(w.sepCount30d, "particle event", "particle events")}${w.geomagneticMaxKp !== undefined ? ` · geomagnetic storm up to Kp ${w.geomagneticMaxKp}` : ""}`)),
      h("li", { title: "AURELIA's own scale from 0.5 to 2.0, worked out from the sizes of the recent real flares. It is a teaching model, not a NASA measure." }, h("span", { class: "mono" }, `Game activity factor ${w.activity.toFixed(2)}`), h("span", { class: "muted small" }, `${act.label}. ${act.text}`)),
    ),
    h("p", { class: "muted small" }, "CME: a cloud of solar plasma thrown into space. Particle event: fast protons from the Sun, the radiation crews must shelter from. The activity factor is AURELIA's teaching model."),
  ];
}

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
  if (data.mars) {
    const m = data.mars;
    rows.push(
      h("div", { class: "live-moon" }, h("span", { class: "muted small" }, "Mars is"), h("strong", { class: "mono" }, fmtKm(m.distanceKm)), h("span", { class: "muted small" }, `(${(m.distanceKm / AU_KM).toFixed(2)} AU) from Earth right now · radio takes ${fmtDelay(m.lightTimeS)} one way`)),
    );
  }
  if (data.weather) rows.push(...weatherBlock(data.weather));
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
  host.replaceChildren(...rows.filter((r): r is Node => r !== null), h("p", { class: "muted small live-src" }, `Source: ${data.sources.join("; ")}. Updated ${data.fetchedAt.slice(11, 16)} UTC.`), h("p", { class: "muted small" }, DISCLAIMER));
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
