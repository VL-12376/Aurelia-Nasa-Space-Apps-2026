export interface Zone {
  start: number;
  width: number;
}

export const ROUNDS = 3;

/** Marker position 0 to 1 at a time: it sweeps back and forth, faster in later rounds. */
export function markerAt(ms: number, round: number): number {
  const speed = [0.7, 1.0, 1.4][Math.min(round, ROUNDS - 1)];
  const phase = ((ms / 1000) * speed) % 2;
  return phase <= 1 ? phase : 2 - phase;
}

/** The target gets narrower each round. */
export function zoneFor(round: number, rnd: () => number): Zone {
  const width = [0.26, 0.2, 0.15][Math.min(round, ROUNDS - 1)];
  return { start: 0.08 + rnd() * (0.84 - width), width };
}

/** 1 for a hit inside the zone, half for a near miss within one zone-width, otherwise 0. */
export function roundScore(pos: number, zone: Zone): number {
  const d = Math.abs(pos - (zone.start + zone.width / 2));
  if (d <= zone.width / 2) return 1;
  if (d <= zone.width) return 0.5;
  return 0;
}
