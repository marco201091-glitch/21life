import 'server-only';

type EventName = 'archidekt_sync' | 'push_delivery' | 'account_export' | 'account_delete';
type Stage = 'import' | 'save' | 'complete' | 'worker' | 'export' | 'delete' | 'rate_limits' | 'storage_list' | 'storage_remove' | 'session_revoke' | 'auth_delete';
type Result = 'success' | 'partial' | 'failed' | 'timeout';

/** Structured events contain no user, deck, token, URL, or raw error data. */
export function logCriticalEvent(event: EventName, stage: Stage, result: Result, options: {
  durationMs?: number;
  skipped?: number;
  processed?: number;
  requestId?: string;
} = {}) {
  const safeCount = (value: number | undefined) => Number.isSafeInteger(value) && value! >= 0 ? value : undefined;
  const record = {
    event, stage, result,
    durationMs: safeCount(options.durationMs),
    skipped: safeCount(options.skipped),
    processed: safeCount(options.processed),
    requestId: typeof options.requestId === 'string' && /^[a-f0-9-]{36}$/.test(options.requestId) ? options.requestId : undefined,
  };
  const output = JSON.stringify(record);
  if (result === 'failed' || result === 'timeout') console.error(output);
  else console.info(output);
}
