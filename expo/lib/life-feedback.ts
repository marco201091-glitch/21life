export const LIFE_DELTA_DURATION = 2_200;

export type LifeDeltaBurst = { delta: number; expiresAt: number };

export function accumulateLifeDelta(previous: LifeDeltaBurst | null, change: number, now: number): LifeDeltaBurst {
  return {
    delta: (previous && previous.expiresAt > now ? previous.delta : 0) + change,
    expiresAt: now + LIFE_DELTA_DURATION,
  };
}

export function lifeFeedback(change: number) {
  if (!Number.isFinite(change) || change === 0) return null;
  const intensity = Math.min(Math.abs(change), 10) / 10;
  return {
    gain: change > 0,
    scale: change > 0 ? Math.min(1.14, 1.06 + intensity * .08) : Math.max(.92, .97 - intensity * .05),
    travel: change > 0 ? -6 - intensity * 4 : 4 + intensity * 3,
    opacity: .3 + intensity * .2,
  };
}
