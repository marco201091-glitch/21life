import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOccasionalDeck, isOccasionalDeck } from '../lib/occasional-decks';

const input = { id: 'deck-id', groupId: 'arena-id', userId: 'player-id', name: 'Loaner', commander: 'Atraxa', commanderImage: null, colorIdentity: ['W', 'U', 'B', 'G'], bracket: null };
describe('occasional deck creation', () => {
  it('passes the stable ID and registered arena identity to the RPC on every retry', async () => {
    const deck = { id: input.id, user_id: input.userId, group_id: input.groupId, source_type: 'occasional' };
    const rpc = vi.fn().mockReturnValue({ abortSignal: () => Promise.resolve({ data: deck, error: null }) });
    const client = { rpc } as unknown as SupabaseClient;
    expect(await createOccasionalDeck(client, input)).toEqual(deck);
    await createOccasionalDeck(client, input);
    expect(rpc).toHaveBeenNthCalledWith(2, 'create_occasional_deck', {
      p_id: input.id, p_group_id: input.groupId, p_user_id: input.userId,
      p_name: input.name, p_commander: input.commander, p_commander_image: null,
      p_color_identity: input.colorIdentity, p_bracket: null, p_commander_options: [],
    });
  });
  it('propagates denied/offline creation and never returns a made-up deck', async () => {
    const client = { rpc: vi.fn().mockReturnValue({ abortSignal: () => Promise.resolve({ data: null, error: { message: 'Arena membership required' } }) }) } as unknown as SupabaseClient;
    await expect(createOccasionalDeck(client, input)).rejects.toThrow('Arena membership required');
  });
  it('rejects an empty successful response', async () => {
    const client = { rpc: vi.fn().mockReturnValue({ abortSignal: () => Promise.resolve({ data: null, error: null }) }) } as unknown as SupabaseClient;
    await expect(createOccasionalDeck(client, input)).rejects.toThrow();
  });
  it('identifies occasional rows without excluding regular or imported decks', () => {
    expect(isOccasionalDeck({ source_type: 'occasional' })).toBe(true);
    expect(isOccasionalDeck({ source_type: 'archidekt' })).toBe(false);
    expect(isOccasionalDeck({})).toBe(false);
  });
  it('releases a stuck creation request so the same stable ID can be retried', async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      const rpc = vi.fn().mockReturnValue({ abortSignal: (signal: AbortSignal) => { requestSignal = signal; return new Promise(() => {}); } });
      const pending = createOccasionalDeck({ rpc } as unknown as SupabaseClient, input);
      const rejection = expect(pending).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(15000);
      await rejection;
      expect(requestSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
