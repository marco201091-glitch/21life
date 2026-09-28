import {
  applyLiveGameMutation,
  getDefaultWinCondition,
  parseLiveGameState,
  type LiveGameRecord,
  type LiveGameState,
  type QueuedLiveGameMutation,
  type LiveGameStatus,
  type WinCondition,
} from '@/lib/live-game';
import type { PendingLiveGameFinalization } from '@/lib/live-game-offline';
import { recordLiveGameMutationSync, recordLiveGameSyncError } from '@/lib/live-game-telemetry';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function fetchActiveLiveGame(
  supabase: SupabaseClient,
  groupId: string,
  participantKey: string,
): Promise<LiveGameRecord | null> {
  const { data: participant, error: participantError } = await supabase
    .from('live_game_participants')
    .select('live_game_id')
    .eq('group_id', groupId)
    .eq('participant_key', participantKey)
    .limit(1)
    .maybeSingle();

  if (participantError) throw participantError;
  if (!participant) return null;

  const { data, error } = await supabase
    .from('live_games')
    .select('*')
    .eq('id', participant.live_game_id)
    .eq('group_id', groupId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    state: parseLiveGameState(data.state),
  } as LiveGameRecord;
}

export async function createLiveGame(
  supabase: SupabaseClient,
  input: {
    id?: string;
    groupId: string;
    createdBy: string;
    startingLife: number;
    state: LiveGameState;
  },
): Promise<LiveGameRecord> {
  const { data, error } = await supabase
    .from('live_games')
    .insert({
      ...(input.id ? { id: input.id } : {}),
      group_id: input.groupId,
      created_by: input.createdBy,
      starting_life: input.startingLife,
      status: 'active',
      state: input.state,
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;

  return {
    ...data,
    state: parseLiveGameState(data.state),
  } as LiveGameRecord;
}

export async function fetchBusyLiveGameParticipantKeys(
  supabase: SupabaseClient,
  groupId: string,
  participantKeys: string[],
): Promise<string[]> {
  if (participantKeys.length === 0) return [];

  const { data, error } = await supabase
    .from('live_game_participants')
    .select('participant_key')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .eq('is_eliminated', false)
    .in('participant_key', participantKeys);

  if (error) throw error;
  return (data ?? []).map((entry) => entry.participant_key as string);
}

export async function ensureLiveGameCreated(
  supabase: SupabaseClient,
  record: LiveGameRecord,
): Promise<LiveGameRecord> {
  const { data, error } = await supabase
    .from('live_games')
    .upsert({
      id: record.id,
      group_id: record.group_id,
      created_by: record.created_by,
      starting_life: record.starting_life,
      status: 'active',
      state: record.state,
      started_at: record.started_at,
    }, { onConflict: 'id', ignoreDuplicates: true })
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (data) return { ...data, state: parseLiveGameState(data.state) } as LiveGameRecord;

  const { data: existing, error: fetchError } = await supabase
    .from('live_games')
    .select('*')
    .eq('id', record.id)
    .single();
  if (fetchError) throw fetchError;
  return { ...existing, state: parseLiveGameState(existing.state) } as LiveGameRecord;
}

type MutationRpcResult = {
  applied: boolean;
  duplicate: boolean;
  record: LiveGameRecord;
};

export async function applyQueuedLiveGameMutation(
  supabase: SupabaseClient,
  initialRecord: LiveGameRecord,
  queued: QueuedLiveGameMutation,
): Promise<LiveGameRecord> {
  const startedAt = Date.now();
  let conflicts = 0;
  let base = initialRecord;
  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const nextState = applyLiveGameMutation(base.state, queued.mutation);
      const { data, error } = await supabase.rpc('apply_live_game_mutation', {
        p_live_game_id: base.id,
        p_mutation_id: queued.id,
        p_expected_version: base.state.version,
        p_next_state: nextState,
      });
      if (error) throw error;
      const result = data as MutationRpcResult;
      const record = {
        ...result.record,
        state: parseLiveGameState(result.record.state),
      } as LiveGameRecord;
      if (result.applied) {
        recordLiveGameMutationSync({ durationMs: Date.now() - startedAt, conflicts });
        return record;
      }
      conflicts += 1;
      base = record;
    }
    throw new Error('Live game state stayed busy after multiple retries');
  } catch (error) {
    recordLiveGameSyncError(error);
    throw error;
  }
}

export async function applyQueuedLiveGameMutations(
  supabase: SupabaseClient,
  initialRecord: LiveGameRecord,
  queuedMutations: QueuedLiveGameMutation[],
): Promise<LiveGameRecord> {
  if (queuedMutations.length === 0) return initialRecord;
  const startedAt = Date.now();
  let conflicts = 0;
  let base = initialRecord;
  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const nextState = queuedMutations.reduce(
        (current, queued) => applyLiveGameMutation(current, queued.mutation),
        base.state,
      );
      const { data, error } = await supabase.rpc('apply_live_game_mutation_batch', {
        p_live_game_id: base.id,
        p_mutation_ids: queuedMutations.map((queued) => queued.id),
        p_expected_version: base.state.version,
        p_next_state: nextState,
      });
      if (error) throw error;
      const result = data as MutationRpcResult;
      const record = {
        ...result.record,
        state: parseLiveGameState(result.record.state),
      } as LiveGameRecord;
      if (result.applied) {
        recordLiveGameMutationSync({ durationMs: Date.now() - startedAt, conflicts });
        return record;
      }
      conflicts += 1;
      base = record;
    }
    throw new Error('Live game state stayed busy after multiple retries');
  } catch (error) {
    recordLiveGameSyncError(error);
    throw error;
  }
}

export async function fetchLiveGameByMatchId(
  supabase: SupabaseClient,
  matchId: string,
): Promise<LiveGameRecord | null> {
  const { data, error } = await supabase
    .from('live_games')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, state: parseLiveGameState(data.state) } as LiveGameRecord : null;
}

export async function updateLiveGameState(
  supabase: SupabaseClient,
  liveGameId: string,
  state: LiveGameState,
): Promise<LiveGameRecord> {
  const { data, error } = await supabase
    .from('live_games')
    .update({ state })
    .eq('id', liveGameId)
    .select('*')
    .single();

  if (error) throw error;

  return {
    ...data,
    state: parseLiveGameState(data.state),
  } as LiveGameRecord;
}

export async function setLiveGameStatus(
  supabase: SupabaseClient,
  liveGameId: string,
  status: LiveGameStatus,
  matchId?: string | null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    status,
    ended_at: status === 'ended' || status === 'cancelled' ? new Date().toISOString() : null,
  };

  if (matchId !== undefined) {
    payload.match_id = matchId;
  }

  const { error } = await supabase
    .from('live_games')
    .update(payload)
    .eq('id', liveGameId);

  if (error) throw error;
}

export function subscribeToLiveGame(
  supabase: SupabaseClient,
  liveGameId: string,
  onChange: (record: LiveGameRecord) => void,
  onStatus?: (status: string) => void,
) {
  const channel = supabase
    .channel(`live-game:${liveGameId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_games',
        filter: `id=eq.${liveGameId}`,
      },
      (payload) => {
        const next = payload.new as LiveGameRecord;
        onChange({
          ...next,
          state: parseLiveGameState(next.state),
        });
      },
    )
    .subscribe((status) => onStatus?.(status));

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function cancelLiveGame(
  supabase: SupabaseClient,
  liveGameId: string,
): Promise<void> {
  await setLiveGameStatus(supabase, liveGameId, 'cancelled', null);
}

export async function finalizeLiveGameAsMatch(
  supabase: SupabaseClient,
  input: {
    liveGameId: string;
    winnerKey: string | null;
    isDraw: boolean;
    winCondition: WinCondition | null;
    endedAt: string;
    players: Array<{
      participantKey: string;
      deckId: string;
      isGuest: boolean;
      userId: string | null;
      guestId: string | null;
    }>;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('finalize_live_game', {
    p_live_game_id: input.liveGameId,
    p_winner_key: input.winnerKey,
    p_is_draw: input.isDraw,
    p_win_condition: input.isDraw ? null : input.winCondition ?? 'other',
    p_ended_at: input.endedAt,
    p_players: input.players.map((player) => ({
      participant_key: player.participantKey,
      deck_id: player.deckId,
      is_guest: player.isGuest,
      user_id: player.userId,
      guest_id: player.guestId,
    })),
  });
  if (error) throw error;
  return data as string;
}

export async function finalizePendingLiveGame(
  supabase: SupabaseClient,
  liveGameId: string,
  pending: PendingLiveGameFinalization,
  state?: LiveGameState,
): Promise<string> {
  const legacyWinCondition = state ? getDefaultWinCondition(state) ?? 'other' : 'other';
  return finalizeLiveGameAsMatch(supabase, {
    liveGameId,
    winnerKey: pending.winnerKey,
    isDraw: pending.isDraw,
    winCondition: pending.isDraw ? null : pending.winCondition ?? legacyWinCondition,
    endedAt: pending.endedAt || new Date().toISOString(),
    players: pending.players,
  });
}
