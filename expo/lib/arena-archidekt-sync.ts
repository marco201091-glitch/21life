import { apiPost } from '@/lib/api';

export interface ArenaArchidektSyncResult {
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  requestId?: string;
}

export type ArenaSyncFailure = 'uncertain' | 'authentication' | 'permission' | 'configuration' | 'rate_limit' | 'upstream' | 'upstream_timeout' | 'save' | 'unknown';

export class ArenaSyncError extends Error {
  constructor(public readonly reason: ArenaSyncFailure, public readonly requestId?: string) {
    super(`Archidekt sync: ${reason}`);
  }
}

const pending = new Map<string, Promise<ArenaArchidektSyncResult>>();

export function classifyArenaSyncFailure(status: number): ArenaSyncFailure {
  if (status === 0) return 'uncertain';
  if (status === 401) return 'authentication';
  if (status === 403) return 'permission';
  if (status === 409) return 'configuration';
  if (status === 429) return 'rate_limit';
  if (status === 502) return 'upstream';
  if (status === 500) return 'save';
  return 'unknown';
}

async function requestSync(groupId: string, userId: string) {
  const response = await apiPost<ArenaArchidektSyncResult>(
    '/api/arena-archidekt-sync', { groupId, userId }, { timeoutMs: 120_000 },
  );
  if (response.status !== 200 || !response.data
    || !['inserted', 'updated', 'unchanged', 'skipped'].every((key) => {
      const value = response.data?.[key as keyof ArenaArchidektSyncResult];
      return Number.isInteger(value) && Number(value) >= 0;
    })) {
    const serverCode = (response.data as (ArenaArchidektSyncResult & { code?: unknown }) | undefined)?.code;
    const unconfirmed = response.status === 200 || serverCode === 'SAVE_RESULT_UNCERTAIN' || (response.status >= 500 && typeof serverCode !== 'string');
    const requestId = response.requestId && /^[a-f0-9-]{36}$/i.test(response.requestId) ? response.requestId : undefined;
    throw new ArenaSyncError(unconfirmed ? 'uncertain' : serverCode === 'UPSTREAM_RATE_LIMIT' ? 'rate_limit' : serverCode === 'UPSTREAM_TIMEOUT' ? 'upstream_timeout' : classifyArenaSyncFailure(response.status), requestId);
  }
  const requestId = response.requestId && /^[a-f0-9-]{36}$/i.test(response.requestId) ? response.requestId : undefined;
  return requestId ? { ...response.data, requestId } : response.data;
}

export function syncArenaMemberArchidektDecks(groupId: string, userId: string, requesterId = '') {
  const key = `${requesterId}:${groupId}:${userId}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const operation = requestSync(groupId, userId).finally(() => {
    pending.delete(key);
  });
  pending.set(key, operation);
  return operation;
}

export async function syncAndRefreshArenaMember(groupId: string, userId: string, refresh: (userId: string) => Promise<boolean | void>, requesterId = '') {
  const result = await syncArenaMemberArchidektDecks(groupId, userId, requesterId);
  const wasEmpty = result.inserted + result.updated + result.unchanged === 0 && result.skipped === 0;
  try {
    const limited = await refresh(userId);
    return { status: result.skipped ? 'partial' as const : limited ? 'limited' as const : wasEmpty ? 'empty' as const : 'completed' as const, skipped: result.skipped, wasPartial: result.skipped > 0, wasEmpty, ...(result.requestId ? { requestId: result.requestId } : {}) };
  } catch {
    return { status: 'refresh_failed' as const, skipped: result.skipped, wasPartial: result.skipped > 0, wasEmpty, ...(result.requestId ? { requestId: result.requestId } : {}) };
  }
}
