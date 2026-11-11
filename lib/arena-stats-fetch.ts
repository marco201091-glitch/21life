import { computeArenaColorAnalytics, type ArenaColorMatch } from '@/lib/arena-color-analytics';
import { getParticipantKey, type MatchParticipantRecord } from '@/lib/arena-participants';
import type { ParticipantKey } from '@/lib/participant-keys';
import { buildMatchRecord, type MatchRecord } from '@/lib/win-rate';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Running counters; the derived fields arrive together in `buildMatchRecord`. */
type StatsCounters = { gamesPlayed: number; wins: number; draws: number };
type PlayerStatsAccumulator = Omit<PlayerStatsRow, keyof MatchRecord> & StatsCounters;
type CommanderStatsAccumulator = Omit<CommanderStatsRow, keyof MatchRecord> & StatsCounters;

export interface ArenaStatsParticipantRow {
  match_id: string;
  played_at: string;
  is_draw: boolean;
  duration_seconds: number | null;
  win_condition: string | null;
  tracking_version: number | null;
  user_id: string | null;
  guest_id: string | null;
  deck_id: string | null;
  guest_deck_id: string | null;
  is_winner: boolean;
  placement: number | null;
  was_starting_player: boolean;
  tracked_event_count: number;
  life_lost: number;
  life_gained: number;
  life_damage_dealt: number;
  commander_damage_taken: number;
  commander_damage_dealt: number;
  infect_received: number;
  infect_dealt: number;
  eliminations_caused: number;
  group_damage_dealt: number;
  group_damage_events: number;
  username: string | null;
  display_name: string | null;
  guest_display_name: string | null;
  deck_name: string | null;
  deck_commander: string | null;
  deck_commander_image: string | null;
  deck_bracket: string | null;
  deck_color_identity: string[] | null;
  guest_deck_name: string | null;
  guest_deck_commander: string | null;
  guest_deck_commander_image: string | null;
  guest_deck_bracket: string | null;
  guest_deck_color_identity: string[] | null;
}

export interface PlayerStatsRow extends MatchRecord {
  key: ParticipantKey;
  displayName: string;
  isGuest: boolean;
  profile: {
    id: string;
    username: string;
    display_name: string | null;
  } | null;
}

export interface CommanderStatsRow extends MatchRecord {
  key: string;
  commander: string;
  commanderImageUrl: string | null;
  bracket: string | null;
}

function rowToParticipant(row: ArenaStatsParticipantRow): MatchParticipantRecord {
  const hasGuest = Boolean(row.guest_id);
  return {
    id: `${row.match_id}:${row.user_id || row.guest_id}`,
    user_id: row.user_id,
    guest_id: row.guest_id,
    deck_id: row.deck_id,
    guest_deck_id: row.guest_deck_id,
    is_winner: row.is_winner,
    profiles: hasGuest || !row.user_id
      ? null
      : {
          id: row.user_id!,
          username: row.username || 'player',
          display_name: row.display_name,
        },
    arena_guests: hasGuest
      ? { id: row.guest_id!, display_name: row.guest_display_name || 'Guest' }
      : null,
    decks: row.deck_id
      ? {
          name: row.deck_commander || 'Deck',
          commander: row.deck_commander || 'Unknown',
          commander_image: row.deck_commander_image,
          bracket: row.deck_bracket,
          color_identity: row.deck_color_identity,
          source_type: null,
        }
      : null,
    arena_guest_decks: row.guest_deck_id
      ? {
          name: row.guest_deck_commander || 'Deck',
          commander: row.guest_deck_commander || 'Unknown',
          commander_image: row.guest_deck_commander_image,
          bracket: row.guest_deck_bracket,
          color_identity: row.guest_deck_color_identity,
        }
      : null,
  };
}

export async function fetchArenaStatsParticipants(
  supabase: SupabaseClient,
  groupId: string,
  since?: Date | null,
): Promise<ArenaStatsParticipantRow[]> {
  const { data, error } = await supabase.rpc('get_arena_stats_participants', {
    p_group_id: groupId,
    p_since: since ? since.toISOString() : null,
  });

  if (error) {
    const { data: fallback, error: fallbackError } = await supabase
      .from('match_participants')
      .select(`
        match_id,
        user_id,
        guest_id,
        deck_id,
        guest_deck_id,
        deck_name_snapshot,
        commander_snapshot,
        commander_image_snapshot,
        deck_bracket_snapshot,
        color_identity_snapshot,
        is_winner,
        placement,
        was_starting_player,
        tracked_event_count,
        life_lost,
        life_gained,
        life_damage_dealt,
        commander_damage_taken,
        commander_damage_dealt,
        infect_received,
        infect_dealt,
        eliminations_caused,
        group_damage_dealt,
        group_damage_events,
        profiles (username, display_name),
        arena_guests (display_name),
        decks (name, commander, commander_image, bracket, color_identity),
        arena_guest_decks (name, commander, commander_image, bracket, color_identity),
        matches!inner (group_id, played_at, is_draw, duration_seconds, win_condition, tracking_version)
      `)
      .eq('matches.group_id', groupId);

    if (fallbackError) throw fallbackError;

    const sinceMs = since ? since.getTime() : null;
    return (fallback || [])
      .filter((row) => {
        const match = row.matches as unknown as { played_at?: string } | null;
        const playedAt = match?.played_at;
        if (!playedAt) return false;
        if (sinceMs === null) return true;
        return new Date(playedAt).getTime() >= sinceMs;
      })
      .map((row) => {
        const match = row.matches as unknown as {
          played_at: string;
          is_draw?: boolean;
          duration_seconds?: number | null;
          win_condition?: string | null;
          tracking_version?: number | null;
        };
        return {
        match_id: row.match_id,
        played_at: match.played_at,
        is_draw: Boolean(match.is_draw),
        duration_seconds: match.duration_seconds ?? null,
        win_condition: match.win_condition ?? null,
        tracking_version: match.tracking_version ?? null,
        user_id: row.user_id,
        guest_id: row.guest_id,
        deck_id: row.deck_id,
        guest_deck_id: row.guest_deck_id,
        is_winner: row.is_winner,
        placement: (row as typeof row & { placement?: number | null }).placement ?? null,
        was_starting_player: Boolean((row as typeof row & { was_starting_player?: boolean }).was_starting_player),
        tracked_event_count: Number((row as typeof row & { tracked_event_count?: number }).tracked_event_count || 0),
        life_lost: Number((row as typeof row & { life_lost?: number }).life_lost || 0),
        life_gained: Number((row as typeof row & { life_gained?: number }).life_gained || 0),
        life_damage_dealt: Number((row as typeof row & { life_damage_dealt?: number }).life_damage_dealt || 0),
        commander_damage_taken: Number((row as typeof row & { commander_damage_taken?: number }).commander_damage_taken || 0),
        commander_damage_dealt: Number((row as typeof row & { commander_damage_dealt?: number }).commander_damage_dealt || 0),
        infect_received: Number((row as typeof row & { infect_received?: number }).infect_received || 0),
        infect_dealt: Number((row as typeof row & { infect_dealt?: number }).infect_dealt || 0),
        eliminations_caused: Number((row as typeof row & { eliminations_caused?: number }).eliminations_caused || 0),
        group_damage_dealt: Number((row as typeof row & { group_damage_dealt?: number }).group_damage_dealt || 0),
        group_damage_events: Number((row as typeof row & { group_damage_events?: number }).group_damage_events || 0),
        username: (row.profiles as { username?: string } | null)?.username ?? null,
        display_name: (row.profiles as { display_name?: string | null } | null)?.display_name ?? null,
        guest_display_name: (row.arena_guests as { display_name?: string } | null)?.display_name ?? null,
        deck_name: (row.decks as { name?: string } | null)?.name ?? row.deck_name_snapshot ?? null,
        deck_commander: (row.decks as { commander?: string } | null)?.commander ?? row.commander_snapshot ?? null,
        deck_commander_image: (row.decks as { commander_image?: string | null } | null)?.commander_image ?? row.commander_image_snapshot ?? null,
        deck_bracket: (row.decks as { bracket?: string | null } | null)?.bracket ?? row.deck_bracket_snapshot ?? null,
        deck_color_identity: (row.decks as { color_identity?: string[] | null } | null)?.color_identity ?? row.color_identity_snapshot ?? null,
        guest_deck_name: (row.arena_guest_decks as { name?: string } | null)?.name ?? null,
        guest_deck_commander: (row.arena_guest_decks as { commander?: string } | null)?.commander ?? null,
        guest_deck_commander_image: (row.arena_guest_decks as { commander_image?: string | null } | null)?.commander_image ?? null,
        guest_deck_bracket: (row.arena_guest_decks as { bracket?: string | null } | null)?.bracket ?? null,
        guest_deck_color_identity: (row.arena_guest_decks as { color_identity?: string[] | null } | null)?.color_identity ?? null,
      };
      }) as ArenaStatsParticipantRow[];
  }

  return (data || []) as ArenaStatsParticipantRow[];
}

export function buildPlayerStatsFromRows(
  rows: ArenaStatsParticipantRow[],
): PlayerStatsRow[] {
  const map = new Map<ParticipantKey, PlayerStatsAccumulator>();

  rows.forEach((row) => {
    const participant = rowToParticipant(row);
    const key = getParticipantKey(participant);
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, {
        key,
        displayName: row.guest_display_name || row.display_name || row.username || 'Player',
        isGuest: Boolean(row.guest_id),
        profile: row.guest_id || !row.user_id
          ? null
          : {
              id: row.user_id,
              username: row.username || 'player',
              display_name: row.display_name,
            },
        gamesPlayed: 0,
        wins: 0,
        draws: 0,
      });
    }

    const stats = map.get(key)!;
    stats.gamesPlayed += 1;
    if (row.is_draw) stats.draws += 1;
    if (row.is_winner) stats.wins += 1;
  });

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      ...buildMatchRecord(entry),
    }))
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
}

export function buildCommanderStatsFromRows(
  rows: ArenaStatsParticipantRow[],
  bracketFilter: string,
  sort: 'winRate' | 'gamesPlayed' = 'winRate',
): CommanderStatsRow[] {
  const map = new Map<string, CommanderStatsAccumulator>();

  rows.forEach((row) => {
    const commander = row.deck_commander || row.guest_deck_commander;
    if (!commander) return;

    const bracket = row.deck_bracket || row.guest_deck_bracket;
    if (bracketFilter !== 'all' && bracket !== bracketFilter) return;

    const key = `${commander}::${bracket || 'none'}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        commander,
        commanderImageUrl: row.deck_commander_image || row.guest_deck_commander_image,
        bracket,
        gamesPlayed: 0,
        wins: 0,
        draws: 0,
      });
    }

    const stats = map.get(key)!;
    stats.gamesPlayed += 1;
    if (row.is_draw) stats.draws += 1;
    if (row.is_winner) stats.wins += 1;
  });

  const results = Array.from(map.values()).map((entry) => ({
    ...entry,
    ...buildMatchRecord(entry),
  }));

  return results.sort((a, b) => {
    if (sort === 'gamesPlayed') return b.gamesPlayed - a.gamesPlayed || b.wins - a.wins;
    return b.winRate - a.winRate || b.wins - a.wins;
  });
}

export function buildColorAnalyticsFromRows(
  rows: ArenaStatsParticipantRow[],
  colorOverrides: Map<string, string[]>,
  bracketFilter: string,
) {
  const matchesMap = new Map<string, ArenaColorMatch>();

  rows.forEach((row) => {
    const participant = rowToParticipant(row);
    const bracket = row.deck_bracket || row.guest_deck_bracket;
    if (bracketFilter !== 'all' && bracket !== bracketFilter) return;

    const existing = matchesMap.get(row.match_id) || {
      is_draw: row.is_draw,
      match_participants: [],
    };
    existing.match_participants.push(participant);
    matchesMap.set(row.match_id, existing);
  });

  return computeArenaColorAnalytics(
    Array.from(matchesMap.values()),
    colorOverrides,
    bracketFilter,
  );
}

export function extractDeckColorOverridesFromRows(rows: ArenaStatsParticipantRow[]) {
  const overrides: Record<string, string[]> = {};
  rows.forEach((row) => {
    if (row.deck_id && row.deck_color_identity?.length) {
      overrides[row.deck_id] = row.deck_color_identity;
    }
    if (row.guest_deck_id && row.guest_deck_color_identity?.length) {
      overrides[row.guest_deck_id] = row.guest_deck_color_identity;
    }
  });
  return overrides;
}
