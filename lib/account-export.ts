import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 500;
const MATCH_ID_GROUP_SIZE = 100;
const DEFAULT_MAX_ROWS = 25_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export class AccountExportError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AccountExportError';
  }
}

interface QueryResult<Row> {
  data: Row[] | null;
  error: { message?: string } | null;
  count?: number | null;
}

interface AdminQuery<Row> extends PromiseLike<QueryResult<Row>> {
  select(columns: string, options?: { count?: 'exact'; head?: boolean }): AdminQuery<Row>;
  eq(column: string, value: string): AdminQuery<Row>;
  or(filters: string): AdminQuery<Row>;
  gt(column: string, value: string): AdminQuery<Row>;
  in(column: string, values: string[]): AdminQuery<Row>;
  order(column: string, options?: { ascending?: boolean }): AdminQuery<Row>;
  limit(count: number): AdminQuery<Row>;
  abortSignal(signal: AbortSignal): AdminQuery<Row>;
  maybeSingle(): Promise<{ data: Row | null; error: { message?: string } | null }>;
}

interface ExportAdminClient {
  from(table: string): AdminQuery<Record<string, unknown>>;
}

class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly capacity: number) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.capacity) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active += 1;
    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}

export async function collectCursorPages<Row extends { id: string }>(
  fetchPage: (cursor: string | null, limit: number) => Promise<{ data: Row[] | null; error: { message?: string } | null }>,
  options: { pageSize?: number; maxRows: number; signal?: AbortSignal; onRows?: (count: number) => void },
) {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber <= options.maxRows; pageNumber += 1) {
    if (options.signal?.aborted) throw new AccountExportError('Account export timed out. Please retry.', 504);
    const result = await fetchPage(cursor, pageSize);
    raiseIfError(result.error, options.signal ?? new AbortController().signal);
    const page = result.data ?? [];
    if (page.length === 0) return rows;
    options.onRows?.(page.length);
    rows.push(...page);
    const nextCursor = page.at(-1)?.id;
    if (typeof nextCursor !== 'string' || nextCursor <= (cursor ?? '')) {
      throw new AccountExportError('Account export could not advance its pagination cursor.', 503);
    }
    cursor = nextCursor;
    if (rows.length > options.maxRows) {
      throw new AccountExportError('Account export exceeds the configured row limit. Please reduce the data and retry.', 413);
    }
  }
  throw new AccountExportError('Account export exceeds the configured row limit. Please reduce the data and retry.', 413);
}

interface ExportContext {
  userId: string;
  signal: AbortSignal;
  semaphore: Semaphore;
  maxRows: number;
  rowsRead: number;
}

function positiveLimit(name: string, fallback: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new AccountExportError('Account export limits are misconfigured.', 503);
  }
  return value;
}

function raiseIfError(error: { message?: string } | null, signal: AbortSignal): never | void {
  if (!error) return;
  if (signal.aborted || /abort|timeout/i.test(error.message ?? '')) {
    throw new AccountExportError('Account export timed out. Please retry.', 504);
  }
  throw new AccountExportError('Account export is temporarily unavailable. Please retry.', 503);
}

async function collectPages<Row extends Record<string, unknown> & { id: string }>(
  client: ExportAdminClient,
  context: ExportContext,
  table: string,
  columns: string,
  configure: (query: AdminQuery<Row>) => AdminQuery<Row>,
  includeInBudget = true,
) {
  return collectCursorPages(async (cursor, limit) => {
    let query = client.from(table).select(columns) as unknown as AdminQuery<Row>;
    if (cursor) query = query.gt('id', cursor);
    query = configure(query).order('id', { ascending: true }).limit(limit).abortSignal(context.signal);
    const result = await context.semaphore.run(() => Promise.resolve(query));
    if (includeInBudget && result.data) {
      context.rowsRead += result.data.length;
      if (context.rowsRead > context.maxRows) {
        throw new AccountExportError('Account export exceeds the configured row limit. Please reduce the data and retry.', 413);
      }
    }
    return result;
  }, { maxRows: context.maxRows, signal: context.signal });
}

async function countRows(
  client: ExportAdminClient,
  context: ExportContext,
  table: string,
  filterColumn: string,
  userId: string,
  countColumn = 'id',
) {
  const query = client.from(table).select(countColumn, { count: 'exact', head: true }).eq(filterColumn, userId).abortSignal(context.signal);
  const result = await context.semaphore.run(() => Promise.resolve(query));
  raiseIfError(result.error, context.signal);
  return result.count ?? 0;
}

async function countInvitations(client: ExportAdminClient, context: ExportContext) {
  const query = client.from('arena_invitations')
    .select('id', { count: 'exact', head: true })
    .or('invited_user_id.eq.' + context.userId + ',invited_by.eq.' + context.userId)
    .abortSignal(context.signal);
  const result = await context.semaphore.run(() => Promise.resolve(query));
  raiseIfError(result.error, context.signal);
  return result.count ?? 0;
}

async function readUserCounts(client: ExportAdminClient, context: ExportContext) {
  const specs = [
    ['decks', 'user_id'],
    ['group_members', 'user_id'],
    ['groups', 'created_by'],
    ['match_participants', 'user_id'],
    ['app_notifications', 'user_id'],
    ['access_logs', 'user_id'],
    ['profiles', 'id'],
    ['notification_preferences', 'user_id'],
  ] as const;
  const results = await Promise.all([
    ...specs.map(([table, column]) => countRows(
      client,
      context,
      table,
      column,
      context.userId,
      table === 'notification_preferences' ? 'user_id' : 'id',
    )),
    countInvitations(client, context),
  ]);
  return results;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, operation: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(items[index]);
    }
  }));
  return results;
}

function byTimestampAndId<Row extends Record<string, unknown>>(rows: Row[], column: string) {
  return rows.sort((left, right) => {
    const leftTime = String(left[column] ?? '');
    const rightTime = String(right[column] ?? '');
    return leftTime.localeCompare(rightTime) || String(left.id).localeCompare(String(right.id));
  });
}

async function exportAttempt(client: ExportAdminClient, context: ExportContext, user: {
  id: string;
  email?: string | null;
  created_at?: string;
}, appVersion: string) {
  const startedAt = new Date().toISOString();
  const countsBefore = await readUserCounts(client, context);
  const userFilter = (column: string) => (query: AdminQuery<Record<string, unknown> & { id: string }>) => query.eq(column, context.userId);
  const profileRead = context.semaphore.run(() => client.from('profiles').select('*').eq('id', context.userId).abortSignal(context.signal).maybeSingle());
  const preferencesRead = context.semaphore.run(() => client.from('notification_preferences').select('*').eq('user_id', context.userId).abortSignal(context.signal).maybeSingle());

  const [profileResult, decks, memberships, ownedGroups, participations, notifications, preferencesResult, accessLogRows, invitations] = await Promise.all([
    profileRead,
    collectPages(client, context, 'decks', '*', userFilter('user_id')),
    collectPages(client, context, 'group_members', '*', userFilter('user_id')),
    collectPages(client, context, 'groups', '*', userFilter('created_by')),
    collectPages(client, context, 'match_participants', '*', userFilter('user_id')),
    collectPages(client, context, 'app_notifications', 'id, type, title, body, data, read_at, created_at', userFilter('user_id')),
    preferencesRead,
    collectPages(client, context, 'access_logs', 'id, source, app_version, accessed_at', userFilter('user_id')),
    collectPages(client, context, 'arena_invitations', '*', (query) => query.or('invited_user_id.eq.' + context.userId + ',invited_by.eq.' + context.userId)),
  ]);
  raiseIfError(profileResult.error, context.signal);
  raiseIfError(preferencesResult.error, context.signal);

  const matchIds = Array.from(new Set(participations.map((row) => row.match_id).filter((id): id is string => typeof id === 'string'))).sort();
  const matchGroups: string[][] = [];
  for (let index = 0; index < matchIds.length; index += MATCH_ID_GROUP_SIZE) {
    matchGroups.push(matchIds.slice(index, index + MATCH_ID_GROUP_SIZE));
  }
  const matchRows = (await mapWithConcurrency(matchGroups, 2, (ids) => collectPages(
    client,
    context,
    'matches',
    '*',
    (query) => query.in('id', ids),
  ))).flat();

  const countsAfter = await readUserCounts(client, context);
  const participantCheck = await collectPages(client, context, 'match_participants', 'id, match_id', userFilter('user_id'), false);
  const sameParticipantRefs = participantCheck.length === participations.length
    && participantCheck.every((row, index) => row.id === participations[index].id && row.match_id === participations[index].match_id);
  const matchesCountStable = await mapWithConcurrency(matchGroups, 2, async (ids) => {
    const query = client.from('matches').select('id', { count: 'exact', head: true }).in('id', ids).abortSignal(context.signal);
    const result = await context.semaphore.run(() => Promise.resolve(query));
    raiseIfError(result.error, context.signal);
    return result.count ?? 0;
  });
  const beforeMatchCount = matchRows.length;
  const afterMatchCount = matchesCountStable.reduce((sum, count) => sum + count, 0);
  if (countsBefore.some((count, index) => count !== countsAfter[index]) || !sameParticipantRefs || beforeMatchCount !== afterMatchCount) {
    return { stable: false as const };
  }

  const exportedAt = new Date().toISOString();
  const payload = {
    format: 'phyrexian-arena-account-export',
    schemaVersion: 1,
    appVersion,
    exportedAt,
    exportStartedAt: startedAt,
    account: { id: context.userId, email: user.email ?? null, createdAt: user.created_at },
    profile: profileResult.data,
    decks: byTimestampAndId(decks, 'created_at'),
    memberships: byTimestampAndId(memberships, 'joined_at'),
    ownedGroups: byTimestampAndId(ownedGroups, 'created_at'),
    matches: byTimestampAndId(matchRows, 'played_at'),
    participations,
    notifications: byTimestampAndId(notifications, 'created_at'),
    notificationPreferences: preferencesResult.data,
    accessLogs: byTimestampAndId(accessLogRows, 'accessed_at').map(({ source, app_version, accessed_at }) => ({ source, app_version, accessed_at })),
    invitations: byTimestampAndId(invitations, 'created_at'),
  };
  const json = JSON.stringify(payload, null, 2);
  const maxBytes = positiveLimit('ACCOUNT_EXPORT_MAX_BYTES', DEFAULT_MAX_BYTES, 100 * 1024 * 1024);
  if (Buffer.byteLength(json, 'utf8') > maxBytes) {
    throw new AccountExportError('Account export exceeds the configured size limit. Please reduce the data and retry.', 413);
  }
  return { stable: true as const, payload, json };
}

export async function buildAccountExport(clientInput: SupabaseClient, user: {
  id: string;
  email?: string | null;
  created_at?: string;
}, appVersion: string) {
  const maxRows = positiveLimit('ACCOUNT_EXPORT_MAX_ROWS', DEFAULT_MAX_ROWS, 100_000);
  const timeoutMs = positiveLimit('ACCOUNT_EXPORT_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 120_000);
  const client = clientInput as unknown as ExportAdminClient;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const context: ExportContext = {
      userId: user.id,
      signal: controller.signal,
      semaphore: new Semaphore(2),
      maxRows,
      rowsRead: 0,
    };
    try {
      const result = await exportAttempt(client, context, user, appVersion);
      if (result.stable) return result;
    } catch (error) {
      if (controller.signal.aborted) throw new AccountExportError('Account export timed out. Please retry.', 504);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AccountExportError('Account data changed while exporting. Please retry the export.', 409);
}
