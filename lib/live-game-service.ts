import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyLiveGameMutation,
  parseLiveGameState,
  type LiveGameRecord,
  type LiveGameState,
  type QueuedLiveGameMutation,
  type WinCondition,
} from '@/lib/live-game';
import { recordLiveGameMutationSync, recordLiveGameSyncError } from '@/lib/live-game-telemetry';

export async function fetchActiveLiveGame(
  client: SupabaseClient,
  groupId: string,
  participantKey: string,
): Promise<LiveGameRecord | null> {
  const { data: participant, error: participantError } = await client
    .from('live_game_participants')
    .select('live_game_id')
    .eq('group_id', groupId)
    .eq('participant_key', participantKey)
    .limit(1)
    .maybeSingle();
  if (participantError) throw participantError;
  const creatorId = participantKey.startsWith('user:')
    ? participantKey.slice('user:'.length)
    : null;
  if (!participant && !creatorId) return null;

  let query = client
    .from('live_games')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (participant && creatorId) {
    query = query.or(`id.eq.${participant.live_game_id},created_by.eq.${creatorId}`);
  } else if (participant) {
    query = query.eq('id', participant.live_game_id);
  } else {
    query = query.eq('created_by', creatorId!);
  }

  const { data, error } = await query
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, state: parseLiveGameState(data.state) } as LiveGameRecord : null;
}

export async function fetchBusyLiveGameParticipantKeys(
  client: SupabaseClient,
  groupId: string,
  participantKeys: string[],
): Promise<string[]> {
  if (!participantKeys.length) return [];
  const { data, error } = await client
    .from('live_game_participants')
    .select('participant_key')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .eq('is_eliminated', false)
    .in('participant_key', participantKeys);
  if (error) throw error;
  return (data ?? []).map((entry) => entry.participant_key as string);
}

export async function ensureLiveGameCreated(client: SupabaseClient, record: LiveGameRecord) {
  const { data, error } = await client.from('live_games').upsert({
    id: record.id,
    group_id: record.group_id,
    created_by: record.created_by,
    starting_life: record.starting_life,
    status: 'active',
    state: record.state,
    started_at: record.started_at,
  }, { onConflict: 'id', ignoreDuplicates: true }).select('*').maybeSingle();
  if (error) throw error;
  if (data) return { ...data, state: parseLiveGameState(data.state) } as LiveGameRecord;

  const { data: existing, error: fetchError } = await client
    .from('live_games').select('*').eq('id', record.id).single();
  if (fetchError) throw fetchError;
  return { ...existing, state: parseLiveGameState(existing.state) } as LiveGameRecord;
}

type MutationRpcResult = {
  applied: boolean;
  duplicate: boolean;
  record: LiveGameRecord;
};

export async function applyQueuedLiveGameMutation(
  client: SupabaseClient,
  initialRecord: LiveGameRecord,
  queued: QueuedLiveGameMutation,
): Promise<LiveGameRecord> {
  const startedAt = Date.now();
  let conflicts = 0;
  let base = initialRecord;
  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const nextState = applyLiveGameMutation(base.state, queued.mutation);
      const { data, error } = await client.rpc('apply_live_game_mutation', {
        p_live_game_id: base.id,
        p_mutation_id: queued.id,
        p_expected_version: base.state.version,
        p_next_state: nextState,
      });
      if (error) throw error;
      const result = data as MutationRpcResult;
      const record = { ...result.record, state: parseLiveGameState(result.record.state) } as LiveGameRecord;
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
  client: SupabaseClient,
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
        (state, queued) => applyLiveGameMutation(state, queued.mutation),
        base.state,
      );
      const { data, error } = await client.rpc('apply_live_game_mutation_batch', {
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
  client: SupabaseClient,
  matchId: string,
): Promise<LiveGameRecord | null> {
  const { data, error } = await client
    .from('live_games')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, state: parseLiveGameState(data.state) } as LiveGameRecord : null;
}

export function subscribeToLiveGame(
  client: SupabaseClient,
  liveGameId: string,
  onChange: (record: LiveGameRecord) => void,
  onStatus?: (status: string) => void,
) {
  const channel = client.channel(`web-live-game:${liveGameId}`).on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'live_games', filter: `id=eq.${liveGameId}` },
    (payload) => {
      const next = payload.new as LiveGameRecord;
      onChange({ ...next, state: parseLiveGameState(next.state) });
    },
  ).subscribe((status) => onStatus?.(status));
  return () => { void client.removeChannel(channel); };
}

export async function cancelLiveGame(client: SupabaseClient, liveGameId: string) {
  const { error } = await client.from('live_games').update({
    status: 'cancelled',
    ended_at: new Date().toISOString(),
  }).eq('id', liveGameId);
  if (error) throw error;
}

export async function finalizeLiveGameAsMatch(client: SupabaseClient, input: {
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
}) {
  const { data, error } = await client.rpc('finalize_live_game', {
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

export async function updateLiveGameState(
  client: SupabaseClient,
  liveGameId: string,
  state: LiveGameState,
) {
  const { data, error } = await client.from('live_games').update({ state }).eq('id', liveGameId).select('*').single();
  if (error) throw error;
  return { ...data, state: parseLiveGameState(data.state) } as LiveGameRecord;
}
