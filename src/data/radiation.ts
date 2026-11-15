/**
 * Measured space radiation dose rates and the career limit commonly applied to astronauts, for the
 * Academy dose calculator.
 *
 * Rates are dose equivalent in millisieverts per day (mSv/day). Four come from one published table,
 * the "average dose equivalent rate for the December 2022 time frame" in George et al. (2024), Nature 634,
 * a paper on radiation measured during an uncrewed lunar test flight. The capsule rate is the middle of
 * the range measured inside the crew capsule on that flight.
 */

export interface RadiationEnv {
  id: "leo" | "capsule" | "moon" | "marsCruise" | "marsSurface";
  label: string;
  mSvPerDay: number;
  /** Measured range, when the source gives one. */
  range?: [number, number];
  where: string;
  note: string;
}

export const RADIATION_ENVS: RadiationEnv[] = [
  { id: "leo", label: "Low Earth orbit (a space station)", mSvPerDay: 0.68, where: "Measured on a space station in low Earth orbit", note: "Earth's magnetic field and the station's walls shield the crew. Published figures are about 80 to 160 mSv for a six-month stay." },
  { id: "capsule", label: "Cruising in a crew capsule (Earth to Moon and back)", mSvPerDay: 1.1, range: [0.96, 1.24], where: "Measured inside a crew capsule on an uncrewed lunar test flight", note: "Cosmic rays dominate once the spacecraft leaves Earth's magnetic field. The range depends on where in the cabin the sensor sat." },
  { id: "moon", label: "On the lunar surface", mSvPerDay: 0.81, where: "Published lunar-surface measurement quoted in the same paper", note: "The Moon itself blocks the cosmic rays that would come from below." },
  { id: "marsCruise", label: "Cruise between Earth and Mars", mSvPerDay: 1.58, where: "Measured by a rover instrument on its way to Mars", note: "Measured inside the spacecraft that carried the rover. Dose rate rises and falls with the solar cycle; the first published figure was an average of 1.8 mSv/day for the original flight." },
  { id: "marsSurface", label: "On the surface of Mars", mSvPerDay: 0.65, where: "Measured by a rover instrument in a Martian crater", note: "Mars's thin air and the planet itself give some shielding." },
];

/** The career effective dose from spaceflight radiation commonly applied to astronauts, for all ages and sexes. */
export const CAREER_LIMIT_MSV = 600;

export type DaysByEnv = Partial<Record<RadiationEnv["id"], number>>;

export interface DoseResult {
  perEnv: { id: RadiationEnv["id"]; mSv: number }[];
  totalMSv: number;
  /** Share of the 600 mSv career limit, 1 = exactly at the limit. */
  limitShare: number;
}

/** Simple sum of days × rate. Real doses change with solar activity, shielding and flares, which this ignores. */
export function totalDose(days: DaysByEnv): DoseResult {
  const perEnv = RADIATION_ENVS.map((e) => ({ id: e.id, mSv: Math.max(0, days[e.id] ?? 0) * e.mSvPerDay }));
  const totalMSv = perEnv.reduce((n, p) => n + p.mSv, 0);
  return { perEnv, totalMSv, limitShare: totalMSv / CAREER_LIMIT_MSV };
}

/** Days of living in one environment that add up to the career limit. */
export const daysToLimit = (env: RadiationEnv): number => CAREER_LIMIT_MSV / env.mSvPerDay;

export const DOSE_PRESETS: { label: string; days: DaysByEnv; note: string }[] = [
  { label: "Six months on a space station", days: { leo: 182 }, note: "Published figures are about 80 to 160 mSv for a six-month stay." },
  { label: "Crewed lunar flyby (10 days)", days: { capsule: 10 }, note: "An uncrewed lunar test flight measured 26.7 to 35.4 mSv over its 25.5 days." },
  { label: "A month on the Moon", days: { capsule: 8, moon: 30 }, note: "A made-up plan: 8 days of travel and 30 days on the surface." },
  { label: "Mars round trip", days: { marsCruise: 360, marsSurface: 500 }, note: "A made-up plan: about 180 days each way and 500 days on the surface." },
];
