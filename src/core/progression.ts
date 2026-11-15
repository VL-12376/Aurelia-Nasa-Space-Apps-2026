import type { FlightReport } from "./gameState";

export interface MissionReward {
  id: string;
  title: string;
  experience: number;
  fundsEarned?: number;
  awards: string[];
}

export interface PlayerProgress {
  experience: number;
  badges: string[];
  receipts: string[];
  pendingRewards: MissionReward[];
}

export const newPlayerProgress = (): PlayerProgress => ({ experience: 0, badges: [], receipts: [], pendingRewards: [] });

/** Cumulative XP thresholds: level 2 = 100, level 3 = 400, level 4 = 900. */
export function playerLevel(experience: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, experience) / 100));
}

export function levelProgress(experience: number): { level: number; current: number; required: number; nextAt: number } {
  const level = playerLevel(experience);
  const start = 100 * (level - 1) ** 2;
  const nextAt = 100 * level ** 2;
  return { level, current: experience - start, required: nextAt - start, nextAt };
}

export function awardFlight(progress: PlayerProgress, id: string, report: FlightReport, awards: string[] = []): void {
  if (progress.receipts.includes(id) || report.outcome.plan?.sandbox) return;
  const before = playerLevel(progress.experience);
  progress.experience += report.outcome.experience;
  const after = playerLevel(progress.experience);
  for (let level = before + 1; level <= after; level++) awards = [...awards, `Level ${level} promotion badge`];
  progress.badges = [...new Set([...progress.badges, ...awards])];
  progress.receipts.push(id);
  progress.pendingRewards.push({ id, title: report.outcome.headline, experience: report.outcome.experience, fundsEarned: report.outcome.fundsEarned, awards });
}
