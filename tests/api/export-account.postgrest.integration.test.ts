import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildAccountExport } from '@/lib/account-export';

const enabled = process.env.STAGING_ACCOUNT_EXPORT_TESTS === '1';
const email = `account-export-${randomUUID()}@example.invalid`;
let admin: ReturnType<typeof createClient> | null = null;
let userId: string | null = null;

beforeAll(async () => {
  if (!enabled) return;
  const url = process.env.SUPABASE_URL;
  const stagingHost = process.env.STAGING_SUPABASE_DOMAIN;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !stagingHost || !serviceKey || new URL(url).hostname !== stagingHost) {
    throw new Error('Staging account export test requires matching staging URL and service-role configuration.');
  }
  admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
});

describe.skipIf(!enabled)('account export PostgREST staging integration', () => {
  it('exports all 1,001 synthetic decks through the staging API row cap', async () => {
    if (!admin) throw new Error('Staging client is not configured.');
    const created = await admin.auth.admin.createUser({
      email,
      password: `T-${randomUUID()}-aA9!`,
      email_confirm: true,
      user_metadata: { username: email.split('@')[0] },
    });
    if (created.error || !created.data.user) throw new Error('Could not create the temporary staging account.');
    userId = created.data.user.id;

    try {
      for (let offset = 0; offset < 1_001; offset += 100) {
        const batch = Array.from({ length: Math.min(100, 1_001 - offset) }, (_, index) => ({
          user_id: userId,
          group_id: null,
          name: `Export fixture ${offset + index}`,
          commander: 'Synthetic Commander',
          source_type: 'manual',
        }));
        const result = await admin.from('decks').insert(batch as never[]);
        if (result.error) throw new Error('Could not seed synthetic staging export rows.');
      }

      const exported = await buildAccountExport(admin, {
        id: userId,
        email,
        created_at: created.data.user.created_at,
      }, '9.0.4');
      expect(exported.stable).toBe(true);
      if (!exported.stable) throw new Error('Staging rows changed during account export.');
      expect(exported.payload.decks).toHaveLength(1_001);
      expect(new Set(exported.payload.decks.map((deck) => deck.id)).size).toBe(1_001);
      expect(exported.payload.decks.every((deck) => deck.user_id === userId)).toBe(true);
    } finally {
      const deckCleanup = await admin.from('decks').delete().eq('user_id', userId);
      if (deckCleanup.error) throw new Error('Could not clean up synthetic staging deck rows.');
      const accountCleanup = await admin.auth.admin.deleteUser(userId);
      if (accountCleanup.error) throw new Error('Could not clean up the synthetic staging account.');
      const remainingDecks = await admin.from('decks').select('id', { count: 'exact', head: true }).eq('user_id', userId);
      if (remainingDecks.error || remainingDecks.count !== 0) throw new Error('Synthetic staging deck cleanup verification failed.');
      const accountCheck = await admin.auth.admin.getUserById(userId);
      if (accountCheck.data.user) throw new Error('Synthetic staging account cleanup verification failed.');
      userId = null;
    }
  }, 120_000);
});
