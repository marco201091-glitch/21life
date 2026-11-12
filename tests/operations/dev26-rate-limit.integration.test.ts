import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import nextEnv from '@next/env';
import { consumeRateLimit } from '@/lib/api-rate-limit';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

describe.skipIf(process.env.DEV26_BACKEND_TESTS !== '1')('Dev26 rate-limit live contract', () => {
  it('accepts the live RPC contract, denies at the limit and removes its synthetic bucket', async () => {
    if (!process.env.E2E_ENV_ROOT) throw new Error('Explicit Dev env root required');
    nextEnv.loadEnvConfig(process.env.E2E_ENV_ROOT);
    if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).hostname !== process.env.STAGING_SUPABASE_DOMAIN
      || process.env.SELFHOSTED_DEV_COMPOSE_PROJECT !== 'supabase-dev') throw new Error('Explicit Dev backend required');
    const client = getSupabaseAdminClient();
    if (!client) throw new Error('Dev service client unavailable');
    const key = `dev26-smoke:${randomUUID()}`;
    try {
      expect(await consumeRateLimit(key, { maxRequests: 1, windowSeconds: 60, failClosed: true }))
        .toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
      const denied = await consumeRateLimit(key, { maxRequests: 1, windowSeconds: 60, failClosed: true });
      expect(denied.allowed).toBe(false);
      expect(denied.remaining).toBe(0);
      expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    } finally {
      const { error } = await client.from('api_rate_limits').delete().eq('bucket_key', key);
      if (error) throw new Error('Synthetic rate-limit cleanup failed');
      const { data, error: readError } = await client.from('api_rate_limits').select('bucket_key').eq('bucket_key', key);
      expect(readError).toBeNull();
      expect(data).toEqual([]);
    }
  }, 15000);
});
