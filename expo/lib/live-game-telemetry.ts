export const LIVE_GAME_TELEMETRY_RETENTION_DAYS = 14;
export const LIVE_GAME_TELEMETRY_PERSIST_INTERVAL_MS = 60_000;

export interface LiveGameTelemetrySnapshot {
  mutationSyncs: number;
  versionConflicts: number;
  failedSyncs: number;
  maxQueueDepth: number;
  slowestSyncMs: number;
  lastError: string | null;
}

const snapshot: LiveGameTelemetrySnapshot = {
  mutationSyncs: 0,
  versionConflicts: 0,
  failedSyncs: 0,
  maxQueueDepth: 0,
  slowestSyncMs: 0,
  lastError: null,
};
let lastPersistedSignature = '';
let lastPersistedAt = 0;

export function recordLiveGameQueueDepth(depth: number) {
  snapshot.maxQueueDepth = Math.max(snapshot.maxQueueDepth, depth);
}

export function recordLiveGameMutationSync(input: {
  durationMs: number;
  conflicts: number;
  failed?: boolean;
}) {
  snapshot.mutationSyncs += input.failed ? 0 : 1;
  snapshot.failedSyncs += input.failed ? 1 : 0;
  snapshot.versionConflicts += input.conflicts;
  snapshot.slowestSyncMs = Math.max(snapshot.slowestSyncMs, Math.round(input.durationMs));
}

export function sanitizeLiveGameTelemetryError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [token]')
    .replace(/\b(?:ExponentPushToken|ExpoPushToken)\[[^\]]+\]/g, '[token]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/(["']?(?:password|token|secret|authorization|api[_-]?key)["']?\s*:\s*["'])[^"']*(["'])/gi, '$1[redacted]$2')
    .replace(/\b(password|token|secret|authorization|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300) || 'Unknown sync error';
}

export function recordLiveGameSyncError(error: unknown) {
  snapshot.failedSyncs += 1;
  snapshot.lastError = sanitizeLiveGameTelemetryError(error);
}

export function getLiveGameTelemetrySnapshot(): LiveGameTelemetrySnapshot {
  return { ...snapshot };
}

type LiveGameTelemetryClient = {
  from: (table: 'live_game_telemetry') => {
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string },
    ) => PromiseLike<{ error: unknown }>;
  };
};

export function shouldPersistLiveGameTelemetry(input: {
  lastPersistedAt: number;
  now: number;
  force?: boolean;
}) {
  return Boolean(input.force)
    || input.lastPersistedAt === 0
    || input.now - input.lastPersistedAt >= LIVE_GAME_TELEMETRY_PERSIST_INTERVAL_MS;
}

export async function persistLiveGameTelemetry(client: LiveGameTelemetryClient, input: {
  userId: string;
  liveGameId: string | null;
  sessionId: string;
  platform: 'web' | 'expo';
  force?: boolean;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  if (!shouldPersistLiveGameTelemetry({
    lastPersistedAt,
    now,
    force: input.force,
  })) return false;
  const value = getLiveGameTelemetrySnapshot();
  const { force: _force, now: _now, ...identity } = input;
  const signature = JSON.stringify({ ...identity, value });
  if (signature === lastPersistedSignature) return false;
  const { error } = await client.from('live_game_telemetry').upsert({
    user_id: input.userId,
    live_game_id: input.liveGameId,
    session_id: input.sessionId,
    client_platform: input.platform,
    mutation_syncs: value.mutationSyncs,
    version_conflicts: value.versionConflicts,
    failed_syncs: value.failedSyncs,
    max_queue_depth: value.maxQueueDepth,
    slowest_sync_ms: value.slowestSyncMs,
    last_error: value.lastError,
    updated_at: new Date(now).toISOString(),
  }, { onConflict: 'user_id,session_id' });
  if (error) throw error;
  lastPersistedSignature = signature;
  lastPersistedAt = now;
  return true;
}
