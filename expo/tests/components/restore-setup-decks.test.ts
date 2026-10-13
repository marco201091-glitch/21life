import { describe, expect, it } from 'vitest';
import { restoreSetupDecks } from '@/components/live-game/restore-setup-decks';
import type { SupabaseClient } from '@supabase/supabase-js';
function client(result: { data: unknown; error: unknown }) {
 const query = { select: () => query, eq: () => query, in: () => Promise.resolve(result) };
 return { from: () => query } as unknown as SupabaseClient;
}
describe('saved occasional setup restoration', () => {
 it('rejects transient catalog errors so the saved deck selection is not replaced by a fallback', async () => {
  await expect(restoreSetupDecks(client({ data: null, error: new Error('offline') }), 'arena', ['saved-id'])).rejects.toThrow('offline');
 });
 it('returns the arena catalog snapshot after retry succeeds', async () => {
  const deck = { id: 'saved-id', user_id: 'a', group_id: 'arena', source_type: 'occasional' };
  await expect(restoreSetupDecks(client({ data: [deck], error: null }), 'arena', ['saved-id'])).resolves.toEqual([deck]);
 });
});
