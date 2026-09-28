import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArenaGuest } from '@/lib/arena-participants';
import { ARENA_MATCHES_PAGE_SIZE } from '@/lib/arena-matches';
import { getSupabaseErrorMessage } from '@/lib/supabase-errors';
import type { ArenaDetail, ArenaMatch, MemberDeck } from '@/lib/types/arena';

export const MATCHES_SELECT = `
  *,
  winner:winner_id (id, username, display_name),
  winner_guest:arena_guests!matches_winner_guest_id_fkey (id, display_name),
  match_participants (
    id,
    user_id,
    guest_id,
    participant_name_snapshot,
    deck_id,
    guest_deck_id,
    profiles (id, username, display_name),
    arena_guests (id, display_name),
    is_winner,
    tracked_event_count,
    life_lost,
    life_gained,
    life_damage_dealt,
    unattributed_life_lost,
    commander_damage_taken,
    commander_damage_dealt,
    infect_received,
    infect_dealt,
    eliminations,
    eliminations_caused,
    revives,
    corrections,
    placement,
    eliminated_at,
    was_starting_player,
    group_damage_dealt,
    group_damage_events,
    deck_name_snapshot,
    commander_snapshot,
    commander_image_snapshot,
    deck_bracket_snapshot,
    color_identity_snapshot,
    final_life,
    final_infect,
    profiles (id, username, display_name),
    arena_guests (id, display_name),
    decks (name, commander, commander_image, bracket, color_identity, source_type),
    arena_guest_decks (name, commander, commander_image, bracket, color_identity)
  )
`;

const DECK_PICKER_COLUMNS = `
  id,
  user_id,
  group_id,
  name,
  commander,
  commander_image,
  source_url,
  source_type,
  bracket,
  color_identity,
  is_favorite,
  created_at
`;

const MEMBER_DECK_LIMIT = 120;
const MEMBER_FETCH_CONCURRENCY = 4;

export type ArenaMatchesPage = {
  matches: ArenaMatch[];
  hasMore: boolean;
};

export type ArenaMatchesCursor = {
  playedAt: string;
  id: string;
};

export async function fetchArenaMatches(
  supabase: SupabaseClient,
  groupId: string,
  cursor?: ArenaMatchesCursor | null,
): Promise<ArenaMatchesPage> {
  let query = supabase
    .from('matches')
    .select(MATCHES_SELECT)
    .eq('group_id', groupId)
    .order('played_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(ARENA_MATCHES_PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(
      `played_at.lt.${cursor.playedAt},and(played_at.eq.${cursor.playedAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching matches:', getSupabaseErrorMessage(error, 'Failed to fetch matches'));
    return { matches: [], hasMore: false };
  }

  const rows = (data as ArenaMatch[]) || [];
  return {
    matches: rows.slice(0, ARENA_MATCHES_PAGE_SIZE),
    hasMore: rows.length > ARENA_MATCHES_PAGE_SIZE,
  };
}

export async function fetchArenaGroup(supabase: SupabaseClient, groupId: string) {
  const { data, error } = await supabase
    .from('groups')
    .select(`
      *,
      profiles:created_by (id, username, display_name),
      group_members (
        user_id,
        profiles (id, username, display_name)
      )
    `)
    .eq('id', groupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ArenaDetail | null;
}

export async function fetchArenaGuests(supabase: SupabaseClient, groupId: string) {
  const { data, error } = await supabase
    .from('arena_guests')
    .select(`
      id,
      group_id,
      display_name,
      last_played_at,
      arena_guest_decks (
        id,
        guest_id,
        group_id,
        name,
        commander,
        commander_image,
        color_identity,
        bracket,
        created_at
      )
    `)
    .eq('group_id', groupId)
    .order('last_played_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('Error fetching guests:', getSupabaseErrorMessage(error, 'Failed to fetch guests'));
    return [] as ArenaGuest[];
  }

  return (data as ArenaGuest[]) || [];
}

export async function fetchArenaMemberDecks(
  supabase: SupabaseClient,
  groupId: string,
  memberIds: string[],
) {
  if (memberIds.length === 0) return [] as MemberDeck[];

  const { data, error } = await supabase.rpc('get_arena_member_decks', {
    p_group_id: groupId,
    p_user_ids: memberIds,
    p_limit_per_user: MEMBER_DECK_LIMIT,
  });
  if (!error) return (data || []) as MemberDeck[];

  // Compatibility fallback while a new deployment is waiting for migrations.
  const decks: MemberDeck[] = [];

  for (let index = 0; index < memberIds.length; index += MEMBER_FETCH_CONCURRENCY) {
    const chunk = memberIds.slice(index, index + MEMBER_FETCH_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(async (memberId) => {
      const { data, error } = await supabase
        .from('decks')
        .select(DECK_PICKER_COLUMNS)
        .eq('user_id', memberId)
        .order('is_favorite', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(MEMBER_DECK_LIMIT);

      if (error) {
        console.error('Error fetching member decks:', getSupabaseErrorMessage(error, 'Failed to fetch member decks'));
        return [] as MemberDeck[];
      }

      return (data || []) as MemberDeck[];
    }));

    decks.push(...chunkResults.flat());
  }

  return decks;
}
