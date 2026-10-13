import { describe, expect, it } from 'vitest';
import { accumulateLifeDelta, LIFE_DELTA_DURATION, lifeFeedback } from '../../lib/life-feedback';

describe('life feedback', () => {
  it('distinguishes gains from losses without excessive motion', () => {
    expect(lifeFeedback(1)?.scale).toBeGreaterThan(1);
    expect(lifeFeedback(-1)?.scale).toBeLessThan(1);
    expect(lifeFeedback(1000)?.scale).toBeLessThanOrEqual(1.14);
    expect(lifeFeedback(-1000)?.scale).toBeGreaterThanOrEqual(.92);
  });
  it('ignores unchanged or invalid totals', () => {
    for (const value of [0, NaN, Infinity, -Infinity]) expect(lifeFeedback(value)).toBeNull();
  });
  it('aggregates rapid changes and extends their visibility', () => {
    const first = accumulateLifeDelta(null, 10, 100);
    const next = accumulateLifeDelta(first, -3, 200);
    expect(next).toEqual({ delta: 7, expiresAt: 200 + LIFE_DELTA_DURATION });
    expect(accumulateLifeDelta(next, -7, 300).delta).toBe(0);
  });
  it('starts a fresh burst after expiration', () => {
    const first = accumulateLifeDelta(null, 10, 0);
    expect(accumulateLifeDelta(first, -1, LIFE_DELTA_DURATION).delta).toBe(-1);
  });
});
