import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
const refreshSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'https://api.example' }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession, refreshSession } } }));

import { apiGet, apiPost } from '@/lib/api';

describe('API client', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: null } });
    refreshSession.mockResolvedValue({ data: { session: null } });
  });

  it('preserves a request reference from a server response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 502, headers: { 'X-Request-Id': 'diagnostic-reference' } }));
    expect((await apiGet('/protected')).requestId).toBe('diagnostic-reference');
  });

  it('adds the current bearer token to GET requests', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'token-1' } } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ groups: [1] }), { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const result = await apiGet<{ groups: number[] }>('/groups');
    expect(fetchMock).toHaveBeenCalledWith('https://api.example/groups', expect.objectContaining({
      method: 'GET',
      headers: { Authorization: 'Bearer token-1' },
      signal: expect.any(AbortSignal),
    }));
    expect(result).toEqual({ data: { groups: [1] }, error: undefined, status: 200 });
  });

  it('serializes POST bodies and exposes API errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: 'Denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } },
    ));
    const result = await apiPost('/join', { code: 'ABC' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.example/join', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'ABC' }),
      signal: expect.any(AbortSignal),
    }));
    expect(result).toEqual({ data: { error: 'Denied' }, error: 'Denied', status: 403 });
  });

  it('survives successful responses without JSON bodies', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    expect(await apiGet('/empty')).toEqual({ data: {}, error: undefined, status: 204 });
  });

  it('refreshes an expired session once after a 401', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'expired' } } });
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'fresh' } } });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Expired' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await apiGet<{ ok: boolean }>('/protected');

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      headers: { Authorization: 'Bearer fresh' },
    }));
    expect(result.status).toBe(200);
  });
});
