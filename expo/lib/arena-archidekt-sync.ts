import { apiPost } from '@/lib/api';

export interface ArenaArchidektSyncResult {
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

export async function syncArenaMemberArchidektDecks(groupId: string, userId: string) {
  const response = await apiPost<ArenaArchidektSyncResult>(
    '/api/arena-archidekt-sync', { groupId, userId }, { timeoutMs: 120_000 },
  );
  if (response.status !== 200 || !response.data
    || !['inserted', 'updated', 'unchanged', 'skipped'].every((key) => {
      const value = response.data?.[key as keyof ArenaArchidektSyncResult];
      return Number.isInteger(value) && Number(value) >= 0;
    })) {
    throw new Error(response.error || 'Unable to sync Archidekt decks.');
  }
  return response.data;
}
