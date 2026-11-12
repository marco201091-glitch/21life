import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), available: true }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminClient: () => mocks.available ? { rpc: mocks.rpc } : null }));
import { consumeRateLimit, createRateLimitResponse } from '@/lib/api-rate-limit';

describe('rate limit RPC boundary', () => {
  beforeEach(() => { mocks.available = true; mocks.rpc.mockReset(); });
  it.each([true, false])('respects failClosed=%s for malformed successes', async failClosed => {
    for (const data of [null, [], {}, 'allowed', { allowed: 'true' },
      { allowed: true, remaining: NaN, retry_after_seconds: 0 },
      { allowed: true, remaining: Infinity, retry_after_seconds: 0 },
      { allowed: true, remaining: -1, retry_after_seconds: 0 },
      { allowed: true, remaining: 20, retry_after_seconds: 0 },
      { allowed: true, remaining: 1, retry_after_seconds: 1 },
      { allowed: false, remaining: 1, retry_after_seconds: 2 },
      { allowed: false, remaining: 0, retry_after_seconds: 0 }]) {
      mocks.rpc.mockResolvedValue({ data, error: null });
      expect(await consumeRateLimit('test', { maxRequests: 10, windowSeconds: 60, failClosed })).toEqual(
        failClosed ? { allowed: false, remaining: 0, retryAfterSeconds: 60 }
          : { allowed: true, remaining: 10, retryAfterSeconds: 0 });
    }
  });
  it('preserves valid allow and deny', async () => {
    for (const allowed of [true, false]) {
      mocks.rpc.mockResolvedValue({ data: { allowed, remaining: 0, retry_after_seconds: allowed ? 0 : 3 }, error: null });
      expect(await consumeRateLimit('test', { maxRequests: 10, windowSeconds: 60, failClosed: true }))
        .toEqual({ allowed, remaining: 0, retryAfterSeconds: allowed ? 0 : 3 });
    }
    expect(createRateLimitResponse(3).headers.get('Retry-After')).toBe('3');
  });
  it.each([true, false])('handles absence, RPC error and throw, failClosed=%s', async failClosed => {
    const config = { maxRequests: 10, windowSeconds: 60, failClosed };
    mocks.available = false;
    expect((await consumeRateLimit('test', config)).allowed).toBe(!failClosed);
    mocks.available = true;
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private' } });
    expect((await consumeRateLimit('test', config)).allowed).toBe(!failClosed);
    mocks.rpc.mockRejectedValue(new Error('private'));
    expect((await consumeRateLimit('test', config)).allowed).toBe(!failClosed);
  });
});
