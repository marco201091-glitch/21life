import { describe, expect, it } from 'vitest';
import { AccountExportError, collectCursorPages } from '@/lib/account-export';

interface Row { id: string; timestamp: string; owner: string }

function fixture(count: number, owner = 'user-a'): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1).padStart(8, '0'),
    timestamp: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    owner,
  }));
}

function pager(rows: Row[], serverCap = Infinity) {
  return (cursor: string | null, requested: number) => Promise.resolve({
    data: rows.filter((row) => cursor === null || row.id > cursor).slice(0, Math.min(requested, serverCap)),
    error: null,
  });
}

describe('account export cursor pagination', () => {
  it.each([0, 1, 500, 501, 1_000, 1_001, 2_501])('returns exactly %i rows', async (count) => {
    const rows = fixture(count);
    const result = await collectCursorPages(pager(rows), { pageSize: 500, maxRows: 3_000 });
    expect(result.map((row) => row.id)).toEqual(rows.map((row) => row.id));
  });

  it.each([100, 37])('continues through short non-empty pages when server cap is %i', async (cap) => {
    const rows = fixture(1_001);
    const result = await collectCursorPages(pager(rows, cap), { pageSize: 500, maxRows: 2_000 });
    expect(result).toEqual(rows);
  });

  it('fails the whole export when a later page fails', async () => {
    const rows = fixture(1_001);
    let requests = 0;
    await expect(collectCursorPages(async (cursor, limit) => {
      requests += 1;
      if (requests === 3) return { data: null, error: { message: 'database unavailable' } };
      return pager(rows)(cursor, limit);
    }, { pageSize: 500, maxRows: 2_000 })).rejects.toMatchObject({ status: 503 });
    expect(requests).toBe(3);
  });

  it('rejects a cursor that stalls or repeats an id', async () => {
    const repeated = [{ id: '00000001' }, { id: '00000001' }];
    await expect(collectCursorPages(async () => ({ data: repeated, error: null }), { pageSize: 1, maxRows: 10 }))
      .rejects.toMatchObject({ status: 503 });
  });

  it('fails clearly when the row budget is exceeded', async () => {
    await expect(collectCursorPages(pager(fixture(501)), { pageSize: 500, maxRows: 500 }))
      .rejects.toMatchObject({ status: 413 });
  });

  it('recognizes an expired export signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(collectCursorPages(pager(fixture(1)), { maxRows: 1, signal: controller.signal }))
      .rejects.toBeInstanceOf(AccountExportError);
  });
});
