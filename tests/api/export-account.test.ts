import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-a', email: 'a@example.test', created_at: '2026-01-01T00:00:00.000Z' } as { id: string; email?: string; created_at?: string } | null,
  rateLimit: null as Response | null,
  tables: {} as Record<string, Record<string, unknown>[]>,
  errorTable: '' as string,
  pageCap: 37,
  active: 0,
  maxActive: 0,
  adminAvailable: true,
  unstableDeckCounts: false,
  deckCountReads: 0,
  client: null as unknown,
}));

vi.mock('@/app/api/_lib/require-auth', () => ({
  requireAuthOr401: async () => mocks.user
    ? { user: mocks.user, response: null }
    : { user: null, response: new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 }) },
}));
vi.mock('@/lib/api-rate-limit', () => ({ enforceUserRateLimit: async () => mocks.rateLimit }));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => mocks.adminAvailable ? mocks.client : null,
}));

function createClient() {
  return {
    from(table: string) {
      const state: {
        filters: Array<(row: Record<string, unknown>) => boolean>;
        columns: string;
        head: boolean;
        count: boolean;
        orderBy: string;
        ascending: boolean;
        limit: number;
        cursor: string;
      } = { filters: [], columns: '*', head: false, count: false, orderBy: '', ascending: true, limit: Infinity, cursor: '' };
      const builder = {
        select(columns: string, options?: { count?: string; head?: boolean }) {
          state.columns = columns;
          state.count = Boolean(options?.count);
          state.head = Boolean(options?.head);
          return builder;
        },
        eq(column: string, value: string) {
          state.filters.push((row) => row[column] === value);
          return builder;
        },
        or(expression: string) {
          const parts = expression.split(',').map((part) => {
            const [column, operator, value] = part.split('.');
            return (row: Record<string, unknown>) => operator === 'eq' && row[column] === value;
          });
          state.filters.push((row) => parts.some((matches) => matches(row)));
          return builder;
        },
        gt(column: string, value: string) {
          state.cursor = value;
          state.filters.push((row) => String(row[column]) > value);
          return builder;
        },
        in(column: string, values: string[]) {
          state.filters.push((row) => values.includes(String(row[column])));
          return builder;
        },
        order(column: string, options?: { ascending?: boolean }) {
          state.orderBy = column;
          state.ascending = options?.ascending ?? true;
          return builder;
        },
        limit(count: number) {
          state.limit = count;
          return builder;
        },
        abortSignal() { return builder; },
        maybeSingle() {
          return invoke().then((result) => ({ data: result.error ? null : result.data?.[0] ?? null, error: result.error }));
        },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return invoke().then(resolve, reject);
        },
      };
      function invoke() {
        mocks.active += 1;
        mocks.maxActive = Math.max(mocks.maxActive, mocks.active);
        return new Promise<typeof execute extends () => infer R ? R : never>((resolve) => {
          setTimeout(() => resolve(execute()), 1);
        }).finally(() => { mocks.active -= 1; });
      }
      function execute() {
        const all = mocks.tables[table] ?? [];
        const filtered = all.filter((row) => state.filters.every((matches) => matches(row)));
        if (mocks.errorTable === table) {
          return { data: null, error: { message: 'database unavailable' }, count: null };
        }
        if (state.count && state.head) {
          if (table === 'decks') mocks.deckCountReads += 1;
          const changedCount = mocks.unstableDeckCounts && table === 'decks' && mocks.deckCountReads % 2 === 1;
          return { data: null, error: null, count: filtered.length + (changedCount ? 1 : 0) };
        }
        const ordered = state.orderBy
          ? filtered.slice().sort((a, b) => (String(a[state.orderBy]).localeCompare(String(b[state.orderBy]))) * (state.ascending ? 1 : -1))
          : filtered;
        const cap = Number.isFinite(state.limit) ? Math.min(state.limit, mocks.pageCap) : mocks.pageCap;
        const selected = ordered.slice(0, cap).map((row) => {
          if (state.columns === '*') return { ...row };
          const fields = state.columns.split(',').map((field) => field.trim());
          return Object.fromEntries(fields.map((field) => [field, row[field]]));
        });
        return { data: selected, error: null, count: state.count ? filtered.length : null };
      }
      return builder;
    },
  };
}

vi.mock('next/server', async () => await vi.importActual('next/server'));
import { GET } from '@/app/api/auth/export-account/route';

function rows(count: number, userId = 'user-a') {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1).padStart(8, '0'),
    user_id: userId,
    created_at: `2026-02-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    name: `Deck ${index + 1}`,
  }));
}

function request() {
  return new Request('https://app.example.test/api/auth/export-account', { headers: { authorization: 'Bearer test' } });
}

beforeEach(() => {
  process.env.ACCOUNT_EXPORT_MAX_ROWS = '10000';
  process.env.ACCOUNT_EXPORT_MAX_BYTES = String(10 * 1024 * 1024);
  process.env.ACCOUNT_EXPORT_TIMEOUT_MS = '30000';
  mocks.user = { id: 'user-a', email: 'a@example.test', created_at: '2026-01-01T00:00:00.000Z' };
  mocks.rateLimit = null;
  mocks.tables = {
    profiles: [{ id: 'user-a', username: 'player-a' }, { id: 'user-b', username: 'player-b' }],
    decks: rows(2_501).concat(rows(5, 'user-b')),
    group_members: [],
    groups: [],
    match_participants: [
      { id: 'p-1', user_id: 'user-a', match_id: 'match-a' },
      { id: 'p-2', user_id: 'user-a', match_id: 'match-a' },
      { id: 'p-3', user_id: 'user-b', match_id: 'match-b' },
    ],
    matches: [
      { id: 'match-a', played_at: '2026-03-01T00:00:00.000Z', notes: 'account match' },
      { id: 'match-b', played_at: '2026-03-02T00:00:00.000Z', notes: 'other account match' },
    ],
    app_notifications: [{ id: 'n-1', user_id: 'user-a', created_at: '2026-03-01T00:00:00.000Z', body: 'visible' }, { id: 'n-2', user_id: 'user-b' }],
    notification_preferences: [{ user_id: 'user-a', enabled: true }],
    access_logs: [{ id: 'log-1', user_id: 'user-a', source: 'web', app_version: '9.0.4', accessed_at: '2026-03-01T00:00:00.000Z' }],
    arena_invitations: [
      { id: 'i-1', invited_user_id: 'user-a', invited_by: 'user-b', created_at: '2026-03-01T00:00:00.000Z' },
      { id: 'i-2', invited_user_id: 'user-b', invited_by: 'user-a', created_at: '2026-03-02T00:00:00.000Z' },
      { id: 'i-3', invited_user_id: 'user-b', invited_by: 'user-c', created_at: '2026-03-03T00:00:00.000Z' },
    ],
  };
  mocks.errorTable = '';
  mocks.pageCap = 37;
  mocks.active = 0;
  mocks.maxActive = 0;
  mocks.adminAvailable = true;
  mocks.unstableDeckCounts = false;
  mocks.deckCountReads = 0;
  mocks.client = createClient();
});

describe('account export API', () => {
  it('exports all pages, scopes matches and invitations to the authenticated user, and preserves the published shape', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.schemaVersion).toBe(1);
    expect(body.decks).toHaveLength(2_501);
    expect(new Set(body.decks.map((deck: { id: string }) => deck.id))).toEqual(new Set(rows(2_501).map((deck) => deck.id)));
    expect(body.matches.map((match: { id: string }) => match.id)).toEqual(['match-a']);
    expect(body.invitations.map((invitation: { id: string }) => invitation.id)).toEqual(['i-1', 'i-2']);
    expect(body.accessLogs).toEqual([{ source: 'web', app_version: '9.0.4', accessed_at: '2026-03-01T00:00:00.000Z' }]);
    expect(JSON.stringify(body)).not.toContain('other account match');
    expect(JSON.stringify(body)).not.toContain('player-b');
    expect(mocks.maxActive).toBeLessThanOrEqual(2);
  });

  it('returns 401, 429, and 503 for auth, rate limit, and backend configuration failures', async () => {
    mocks.user = null;
    expect((await GET(request())).status).toBe(401);
    mocks.user = { id: 'user-a' };
    mocks.rateLimit = new Response('limited', { status: 429 });
    expect((await GET(request())).status).toBe(429);
    mocks.rateLimit = null;
    mocks.adminAvailable = false;
    expect((await GET(request())).status).toBe(503);
  });

  it('never returns a partial success after a page query fails', async () => {
    mocks.errorTable = 'decks';
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('temporarily unavailable') });
  });

  it('returns an explicit error when the byte budget is exceeded', async () => {
    process.env.ACCOUNT_EXPORT_MAX_BYTES = '500';
    const response = await GET(request());
    expect(response.status).toBe(413);
  });

  it('retries a detectably changing export once, then returns 409 instead of a partial snapshot', async () => {
    mocks.unstableDeckCounts = true;
    const response = await GET(request());
    expect(response.status).toBe(409);
    expect(mocks.deckCountReads).toBe(4);
  });
});
