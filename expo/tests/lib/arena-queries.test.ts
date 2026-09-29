import { describe, expect, it, vi } from 'vitest';
import { fetchArenaMatches, fetchArenaMemberDecks, MATCHES_SELECT } from '@/lib/arena-queries';

describe('arena queries', () => {
  it('selects each nested participant profile and guest relation once', () => {
    const participantProjection = MATCHES_SELECT.split('match_participants (')[1];
    expect(participantProjection).toBeTruthy();
    expect(participantProjection.match(/profiles \(/g)).toHaveLength(1);
    expect(participantProjection.match(/arena_guests \(/g)).toHaveLength(1);
  });

  it('uses stable keyset pagination and detects a following page', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: `match-${String(index).padStart(3, '0')}`,
      played_at: '2026-07-29T12:00:00.000Z',
    }));
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      or: vi.fn(),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    chain.or.mockReturnValue(chain);

    const result = await fetchArenaMatches(
      { from: vi.fn().mockReturnValue(chain) } as never,
      'group-1',
      { playedAt: '2026-07-29T12:00:00.000Z', id: 'match-previous' },
    );

    expect(chain.limit).toHaveBeenCalledWith(101);
    expect(chain.or).toHaveBeenCalledWith(
      'played_at.lt.2026-07-29T12:00:00.000Z,and(played_at.eq.2026-07-29T12:00:00.000Z,id.lt.match-previous)',
    );
    expect(result.matches).toHaveLength(100);
    expect(result.hasMore).toBe(true);
  });

  it('fetches every member deck list with one bounded RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'deck-1', user_id: 'user-1' }],
      error: null,
    });
    const from = vi.fn();
    const result = await fetchArenaMemberDecks({ rpc, from } as never, 'group-1', [
      'user-1',
      'user-2',
    ]);

    expect(result).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith('get_arena_member_decks', {
      p_group_id: 'group-1',
      p_user_ids: ['user-1', 'user-2'],
      p_limit_per_user: 120,
    });
    expect(from).not.toHaveBeenCalled();
  });
});
