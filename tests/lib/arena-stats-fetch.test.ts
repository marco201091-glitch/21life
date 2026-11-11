import { describe, expect, it, vi } from 'vitest';
import {
  buildColorAnalyticsFromRows,
  buildCommanderStatsFromRows,
  buildPlayerStatsFromRows,
  extractDeckColorOverridesFromRows,
  fetchArenaStatsParticipants,
  type ArenaStatsParticipantRow,
} from '@/lib/arena-stats-fetch';

function row(overrides: Partial<ArenaStatsParticipantRow> = {}): ArenaStatsParticipantRow {
  return {
    match_id: 'match-1',
    played_at: '2026-08-01T10:00:00.000Z',
    is_draw: false,
    duration_seconds: 3600,
    win_condition: 'combat',
    tracking_version: 8,
    user_id: 'user-1',
    guest_id: null,
    deck_id: 'deck-1',
    guest_deck_id: null,
    is_winner: true,
    placement: 1,
    was_starting_player: true,
    tracked_event_count: 4,
    life_lost: 20,
    life_gained: 3,
    life_damage_dealt: 24,
    commander_damage_taken: 2,
    commander_damage_dealt: 8,
    infect_received: 0,
    infect_dealt: 1,
    eliminations_caused: 1,
    group_damage_dealt: 24,
    group_damage_events: 3,
    username: 'alice',
    display_name: 'Alice',
    guest_display_name: null,
    deck_name: 'Atraxa counters',
    deck_commander: 'Atraxa, Praetors Voice',
    deck_commander_image: 'https://cards.example/atraxa.jpg',
    deck_bracket: '3',
    deck_color_identity: ['W', 'U', 'B', 'G'],
    guest_deck_name: null,
    guest_deck_commander: null,
    guest_deck_commander_image: null,
    guest_deck_bracket: null,
    guest_deck_color_identity: null,
    ...overrides,
  };
}

describe('arena stats row adapters', () => {
  it('uses the RPC result when available', async () => {
    const rows = [row()];
    const client = { rpc: vi.fn().mockResolvedValue({ data: rows, error: null }) };

    await expect(fetchArenaStatsParticipants(client as never, 'group-1')).resolves.toEqual(rows);
    expect(client.rpc).toHaveBeenCalledWith('get_arena_stats_participants', {
      p_group_id: 'group-1',
      p_since: null,
    });
  });

  it('keeps the V8-compatible relation fallback and date filter', async () => {
    const fallbackRow = {
      match_id: 'match-1', user_id: 'user-1', guest_id: null, deck_id: 'deck-1', guest_deck_id: null,
      is_winner: true, placement: 1, was_starting_player: true, tracked_event_count: 2,
      life_lost: 5, life_gained: 2, life_damage_dealt: 7, commander_damage_taken: 1,
      commander_damage_dealt: 3, infect_received: 0, infect_dealt: 0, eliminations_caused: 1,
      group_damage_dealt: 7, group_damage_events: 2,
      profiles: { username: 'alice', display_name: 'Alice' }, arena_guests: null,
      decks: { name: 'Deck', commander: 'Atraxa', commander_image: 'image', bracket: '3', color_identity: ['W', 'U'] },
      arena_guest_decks: null,
      matches: { group_id: 'group-1', played_at: '2026-08-01T10:00:00.000Z', is_draw: false, duration_seconds: 60, win_condition: 'combat', tracking_version: 8 },
    };
    const oldRow = { ...fallbackRow, match_id: 'old', matches: { ...fallbackRow.matches, played_at: '2025-01-01T00:00:00.000Z' } };
    const query = {
      select: vi.fn(),
      eq: vi.fn().mockResolvedValue({ data: [fallbackRow, oldRow, { ...oldRow, matches: null }], error: null }),
    };
    query.select.mockReturnValue(query);
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('RPC unavailable') }),
      from: vi.fn(() => query),
    };

    const result = await fetchArenaStatsParticipants(client as never, 'group-1', new Date('2026-01-01T00:00:00.000Z'));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ match_id: 'match-1', username: 'alice', deck_commander: 'Atraxa', tracking_version: 8 });
  });

  it('throws when both RPC and fallback fail', async () => {
    const query = { select: vi.fn(), eq: vi.fn().mockResolvedValue({ data: null, error: new Error('fallback failed') }) };
    query.select.mockReturnValue(query);
    const client = { rpc: vi.fn().mockResolvedValue({ error: new Error('rpc failed') }), from: vi.fn(() => query) };
    await expect(fetchArenaStatsParticipants(client as never, 'group-1')).rejects.toThrow('fallback failed');
  });

  it('keeps a deleted deck in the fallback statistics using its match snapshot', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn().mockResolvedValue({ data: [{
        match_id: 'match-1', user_id: 'user-1', deck_id: 'deleted-deck',
        decks: null, arena_guest_decks: null, profiles: null, arena_guests: null,
        deck_name_snapshot: 'Historic deck', commander_snapshot: 'Jodah',
        commander_image_snapshot: 'image', deck_bracket_snapshot: '3',
        color_identity_snapshot: ['W', 'U'],
        matches: { played_at: '2026-08-01T10:00:00.000Z' },
      }], error: null }),
    };
    query.select.mockReturnValue(query);
    const client = { rpc: vi.fn().mockResolvedValue({ error: new Error('unavailable') }), from: vi.fn(() => query) };

    const result = await fetchArenaStatsParticipants(client as never, 'group-1');
    expect(result[0]).toMatchObject({ deck_id: 'deleted-deck', deck_name: 'Historic deck', deck_commander: 'Jodah', deck_commander_image: 'image', deck_bracket: '3', deck_color_identity: ['W', 'U'] });
  });

  it('builds player, commander and color aggregates for users and guests', () => {
    const rows = [
      row(),
      row({ match_id: 'match-2', is_winner: false, was_starting_player: false }),
      row({
        match_id: 'match-1', user_id: null, guest_id: 'guest-1', deck_id: null, guest_deck_id: 'guest-deck-1',
        is_winner: false, username: null, display_name: null, guest_display_name: 'Bob', deck_commander: null,
        deck_commander_image: null, deck_bracket: null, deck_color_identity: null, guest_deck_name: 'Guest deck',
        guest_deck_commander: 'Krenko', guest_deck_commander_image: 'krenko-image', guest_deck_bracket: '2',
        guest_deck_color_identity: ['R'], placement: 2,
      }),
      row({ user_id: null, deck_id: null, deck_commander: null, deck_color_identity: null }),
    ];

    expect(buildPlayerStatsFromRows(rows)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'user:user-1', gamesPlayed: 2, wins: 1, winRate: 50 }),
      expect.objectContaining({ key: 'guest:guest-1', displayName: 'Bob', isGuest: true }),
    ]));
    expect(buildCommanderStatsFromRows(rows, 'all')).toEqual(expect.arrayContaining([
      expect.objectContaining({ commander: 'Atraxa, Praetors Voice', gamesPlayed: 2, wins: 1 }),
      expect.objectContaining({ commander: 'Krenko', bracket: '2' }),
    ]));
    expect(buildCommanderStatsFromRows(rows, '3', 'gamesPlayed')).toHaveLength(1);
    expect(buildColorAnalyticsFromRows(rows, new Map(), 'all').played.length).toBeGreaterThan(0);
    expect(extractDeckColorOverridesFromRows(rows)).toEqual({
      'deck-1': ['W', 'U', 'B', 'G'],
      'guest-deck-1': ['R'],
    });
  });
});
