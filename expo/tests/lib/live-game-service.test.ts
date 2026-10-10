import { describe, expect, it, vi } from 'vitest';
import { createLiveGamePlayer, type LiveGameRecord, type LiveGameState } from '@/lib/live-game';
import {
  applyQueuedLiveGameMutation,
  applyQueuedLiveGameMutations,
  createLiveGame,
  ensureLiveGameCreated,
  fetchActiveLiveGame,
  fetchBusyLiveGameParticipantKeys,
  finalizeLiveGameAsMatch,
  finalizePendingLiveGame,
  setLiveGameStatus,
  subscribeToLiveGame,
} from '@/lib/live-game-service';

function state(version = 0): LiveGameState {
  return {
    version, events: [], players: [createLiveGamePlayer({
      slot: 0, participantKey: 'user:a', deckId: 'deck-a', displayName: 'A',
      commander: 'Atraxa', commanderImage: null, startingLife: 40, allParticipantKeys: ['user:a'],
    })],
  };
}

function record(overrides: Partial<LiveGameRecord> = {}): LiveGameRecord {
  return {
    id: 'live-1', group_id: 'group-1', created_by: 'user-a', status: 'active', starting_life: 40,
    state: state(), match_id: null, started_at: '2026-07-16T10:00:00.000Z', ended_at: null,
    created_at: '2026-07-16T10:00:00.000Z', updated_at: '2026-07-16T10:00:00.000Z', ...overrides,
  };
}

function withSignal<T>(value: T | Promise<T>) {
  const promise = Promise.resolve(value);
  return Object.assign(promise, { abortSignal: () => promise });
}

function selectQuery(result: unknown) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  ['select', 'eq', 'limit', 'in', 'insert', 'upsert', 'update', 'abortSignal'].forEach((method) => {
    query[method] = vi.fn().mockReturnValue(query);
  });
  query.maybeSingle = vi.fn().mockReturnValue(withSignal(result));
  query.single = vi.fn().mockReturnValue(withSignal(result));
  return query;
}

describe('live game Supabase service', () => {
  it('stops active-game lookup when the participant is not busy', async () => {
    const participantQuery = selectQuery({ data: null, error: null });
    const from = vi.fn().mockReturnValue(participantQuery);
    expect(await fetchActiveLiveGame({ from } as never, 'group-1', 'user:a')).toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('loads and normalizes an active game in two scoped queries', async () => {
    const participantQuery = selectQuery({ data: { live_game_id: 'live-1' }, error: null });
    const gameQuery = selectQuery({ data: record({ state: { ...state(), layoutVariant: undefined } }), error: null });
    const from = vi.fn().mockReturnValueOnce(participantQuery).mockReturnValueOnce(gameQuery);
    const loaded = await fetchActiveLiveGame({ from } as never, 'group-1', 'user:a');
    expect(loaded?.state.layoutVariant).toBe('classic');
    expect(gameQuery.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('creates a started game and handles empty busy-player checks', async () => {
    const gameQuery = selectQuery({ data: record(), error: null });
    const from = vi.fn().mockReturnValue(gameQuery);
    const created = await createLiveGame({ from } as never, {
      id: 'live-1', groupId: 'group-1', createdBy: 'user-a', startingLife: 40, state: state(),
    });
    expect(created.state.layoutVariant).toBe('classic');
    expect(gameQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'live-1', status: 'active' }));
    expect(await fetchBusyLiveGameParticipantKeys({ from } as never, 'group-1', [])).toEqual([]);
  });

  it('returns busy participant keys and propagates query errors', async () => {
    const query = selectQuery({ data: null, error: null });
    query.in.mockReturnValueOnce(withSignal({ data: [{ participant_key: 'user:a' }], error: null }));
    expect(await fetchBusyLiveGameParticipantKeys({ from: vi.fn().mockReturnValue(query) } as never, 'g', ['user:a']))
      .toEqual(['user:a']);

    const failed = selectQuery({ data: null, error: null });
    const error = new Error('RLS');
    failed.in.mockReturnValueOnce(withSignal({ data: null, error }));
    await expect(fetchBusyLiveGameParticipantKeys({ from: vi.fn().mockReturnValue(failed) } as never, 'g', ['user:a']))
      .rejects.toBe(error);
  });

  it('falls back to fetching an existing game when an idempotent upsert returns no row', async () => {
    const upsertQuery = selectQuery({ data: null, error: null });
    const existingQuery = selectQuery({ data: record(), error: null });
    const from = vi.fn().mockReturnValueOnce(upsertQuery).mockReturnValueOnce(existingQuery);
    expect((await ensureLiveGameCreated({ from } as never, record())).id).toBe('live-1');
    expect(upsertQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'live-1' }), {
      onConflict: 'id', ignoreDuplicates: true,
    });
  });

  it('retries optimistic mutations against the latest server version', async () => {
    const rpc = vi.fn()
      .mockReturnValueOnce(withSignal({ data: { applied: false, duplicate: false, record: record() }, error: null }))
      .mockReturnValueOnce(withSignal({ data: { applied: true, duplicate: false, record: record({ state: state(1) }) }, error: null }));
    const updated = await applyQueuedLiveGameMutation({ rpc } as never, record(), {
      id: 'mutation-1', mutation: { type: 'adjust', targetKey: 'user:a', amount: 1, mode: 'life' },
    });
    expect(updated.state.version).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('persists a burst with one atomic batch RPC', async () => {
    const rpc = vi.fn().mockReturnValue(withSignal({
      data: { applied: true, duplicate: false, record: record({ state: state(2) }) },
      error: null,
    }));
    const updated = await applyQueuedLiveGameMutations({ rpc } as never, record(), [
      { id: 'mutation-1', mutation: { type: 'adjust', targetKey: 'user:a', amount: 1, mode: 'life' } },
      { id: 'mutation-2', mutation: { type: 'adjust', targetKey: 'user:a', amount: -1, mode: 'life' } },
    ]);

    expect(updated.state.version).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('apply_live_game_mutation_batch', expect.objectContaining({
      p_mutation_ids: ['mutation-1', 'mutation-2'],
      p_expected_version: 0,
    }));
  });

  it('serializes final results and uses safe defaults for legacy pending games', async () => {
    const rpc = vi.fn().mockReturnValue(withSignal({ data: 'match-1', error: null }));
    const players = [{ participantKey: 'user:a', deckId: 'deck-a', isGuest: false, userId: 'a', guestId: null }];
    expect(await finalizeLiveGameAsMatch({ rpc } as never, {
      liveGameId: 'live-1', winnerKey: null, isDraw: true, winCondition: 'combo',
      endedAt: '2026-07-16T11:00:00.000Z', players,
    })).toBe('match-1');
    expect(rpc).toHaveBeenLastCalledWith('finalize_live_game', expect.objectContaining({
      p_is_draw: true, p_win_condition: null,
    }));

    await finalizePendingLiveGame({ rpc } as never, 'live-1', {
      winnerKey: 'user:a', isDraw: false, winCondition: null, endedAt: '', players,
    });
    expect(rpc).toHaveBeenLastCalledWith('finalize_live_game', expect.objectContaining({ p_win_condition: 'other' }));
  });

  it('recovers a partially acknowledged batch without applying life changes twice', async () => {
    let saved = record();
    const acknowledged = new Set<string>(['mutation-1']);
    saved.state.players[0].life = 41;
    saved.state.version = 1;
    const rpc = vi.fn((name: string, args: Record<string, unknown>) => withSignal((async () => {
      if (name === 'apply_live_game_mutation_batch') {
        return { data: null, error: { code: '23505', message: 'Partially applied live game mutation batch' } };
      }
      const id = args.p_mutation_id as string;
      if (acknowledged.has(id)) return { data: { applied: true, duplicate: true, record: saved }, error: null };
      if (args.p_expected_version !== saved.state.version) {
        return { data: { applied: false, record: saved }, error: null };
      }
      saved = { ...saved, state: args.p_next_state as LiveGameState };
      acknowledged.add(id);
      return { data: { applied: true, record: saved }, error: null };
    })()));
    const updated = await applyQueuedLiveGameMutations({ rpc } as never, record(), [
      { id: 'mutation-1', mutation: { type: 'adjust', targetKey: 'user:a', amount: -1, mode: 'life' } },
      { id: 'mutation-2', mutation: { type: 'adjust', targetKey: 'user:a', amount: 5, mode: 'life' } },
    ]);
    expect(updated.state.players[0].life).toBe(36);
    expect(updated.state.version).toBe(2);
    expect(acknowledged.size).toBe(2);
  });

  it('acknowledges actions that became no-ops after another client eliminated the opponent', async () => {
    const current = record();
    current.state.players.push({ ...current.state.players[0], participantKey: 'user:b', slot: 1, isEliminated: true });
    const rpc = vi.fn((_name: string, args: Record<string, unknown>) => {
      const next = args.p_next_state as LiveGameState;
      if (next.version !== current.state.version + 1) {
        return withSignal({ data: null, error: { code: '22023', message: 'Invalid next live game state' } });
      }
      return withSignal({ data: { applied: true, record: { ...current, state: next } }, error: null });
    });
    const updated = await applyQueuedLiveGameMutations({ rpc } as never, current, [
      { id: 'last-standing', mutation: { type: 'last_standing', winnerKey: 'user:a' } },
    ]);
    expect(updated.state.version).toBe(1);
    expect(updated.state.players).toEqual(current.state.players);
  });

  it('updates terminal status and unsubscribes realtime channels', async () => {
    const eq = vi.fn().mockReturnValue(withSignal({ error: null }));
    const update = vi.fn().mockReturnValue({ eq });
    await setLiveGameStatus({ from: vi.fn().mockReturnValue({ update }) } as never, 'live-1', 'ended', 'match-1');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'ended', match_id: 'match-1', ended_at: expect.any(String) }));

    let changeHandler: ((payload: { new: LiveGameRecord }) => void) | undefined;
    const channel = {
      on: vi.fn((_event, _filter, handler) => { changeHandler = handler; return channel; }),
      subscribe: vi.fn((callback) => { callback('SUBSCRIBED'); return channel; }),
    };
    const onChange = vi.fn();
    const onStatus = vi.fn();
    const removeChannel = vi.fn().mockReturnValue(withSignal(undefined));
    const unsubscribe = subscribeToLiveGame({ channel: vi.fn().mockReturnValue(channel), removeChannel } as never, 'live-1', onChange, onStatus);
    changeHandler?.({ new: record() });
    expect(onChange.mock.calls[0]?.[0].state.layoutVariant).toBe('classic');
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED');
    unsubscribe();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});
