export interface ReputationTier {
  name: string;
  min: number;
  next: number | null;
}

const TIERS: ReputationTier[] = [
  { name: "Unproven", min: 0, next: 25 },
  { name: "Emerging", min: 25, next: 60 },
  { name: "Established", min: 60, next: 120 },
  { name: "Leading", min: 120, next: null },
];

export function reputationTier(reputation: number): ReputationTier {
  return [...TIERS].reverse().find((t) => reputation >= t.min) ?? TIERS[0];
}

/** Share (0 to 1) of a season's missions that are complete. */
export function seasonProgress(seasonMissionIds: string[], completed: string[]): number {
  if (!seasonMissionIds.length) return 0;
  const done = seasonMissionIds.filter((id) => completed.includes(id)).length;
  return done / seasonMissionIds.length;
}
