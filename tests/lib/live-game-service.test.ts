import { describe, expect, it, vi } from 'vitest';
import { createLiveGamePlayer, type LiveGameRecord } from '@/lib/live-game';
import { fetchActiveLiveGame } from '@/lib/live-game-service';

function record(overrides: Partial<LiveGameRecord> = {}): LiveGameRecord {
  return {
    id: 'live-1',
    group_id: 'group-1',
    created_by: 'a',
    status: 'active',
    starting_life: 40,
    state: {
      version: 0,
      events: [],
      players: [createLiveGamePlayer({
        slot: 0,
        participantKey: 'user:a',
        deckId: 'deck-a',
        displayName: 'A',
        commander: 'Atraxa',
        commanderImage: null,
        startingLife: 40,
        allParticipantKeys: ['user:a'],
      })],
    },
    match_id: null,
    started_at: '2026-07-16T10:00:00.000Z',
    ended_at: null,
    created_at: '2026-07-16T10:00:00.000Z',
    updated_at: '2026-07-16T10:00:00.000Z',
    ...overrides,
  };
}

function selectQuery(result: unknown) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  ['select', 'eq', 'limit', 'order', 'or'].forEach((method) => {
    query[method] = vi.fn().mockReturnValue(query);
  });
  query.maybeSingle = vi.fn().mockReturnValue(Promise.resolve(result));
  return query;
}

describe('web active live game lookup', () => {
  it('filters participant rows to the active, non-eliminated game', async () => {
    const participantQuery = selectQuery({ data: null, error: null });
    const creatorQuery = selectQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(participantQuery).mockReturnValueOnce(creatorQuery) };
    expect(await fetchActiveLiveGame(client as never, 'group-1', 'user:a')).toBeNull();
    expect(participantQuery.eq).toHaveBeenCalledWith('status', 'active');
    expect(participantQuery.eq).toHaveBeenCalledWith('is_eliminated', false);
    expect(creatorQuery.eq).toHaveBeenCalledWith('created_by', 'a');
    expect(creatorQuery.order).toHaveBeenCalledWith('updated_at', { ascending: false });
  });

  it('returns the active participation before considering the creator fallback', async () => {
    const participantQuery = selectQuery({ data: { live_game_id: 'live-1' }, error: null });
    const gameQuery = selectQuery({ data: record(), error: null });
    const client = { from: vi.fn().mockReturnValueOnce(participantQuery).mockReturnValueOnce(gameQuery) };
    expect((await fetchActiveLiveGame(client as never, 'group-1', 'user:a'))?.id).toBe('live-1');
    expect(client.from).toHaveBeenCalledTimes(2);
  });

  it('keeps host resume when the host has been eliminated', async () => {
    const participantQuery = selectQuery({ data: null, error: null });
    const creatorQuery = selectQuery({ data: record({ id: 'live-host' }), error: null });
    const client = { from: vi.fn().mockReturnValueOnce(participantQuery).mockReturnValueOnce(creatorQuery) };
    expect((await fetchActiveLiveGame(client as never, 'group-1', 'user:a'))?.id).toBe('live-host');
  });

  it('does not fall back to created games for guests', async () => {
    const participantQuery = selectQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(participantQuery) };
    expect(await fetchActiveLiveGame(client as never, 'group-1', 'guest:g1')).toBeNull();
    expect(client.from).toHaveBeenCalledTimes(1);
  });
});
