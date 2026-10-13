import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { addDeckToGuest, createGuestWithDeck } from '@/lib/guest-arena';
import type { ArenaGuest } from '@/lib/arena-participants';
const commander = { id: 'c', name: 'Tymna', imageUrl: 'default.jpg', typeLine: 'Legendary Creature', colorIdentity: ['W', 'B'], oracleText: '', keywords: [] };
const guest = { id: 'g', group_id: 'arena', display_name: 'Alice', last_played_at: null, arena_guest_decks: [] } as ArenaGuest;
function client(guestError: unknown = null, deckError: unknown = null) {
  const guestInsert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: guest, error: guestError }) }) });
  const deckInsert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'gd', guest_id: 'g' }, error: deckError }) }) });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const from = vi.fn((table: string) => table === 'arena_guests' ? { insert: guestInsert, update } : { insert: deckInsert });
  return { db: { from } as unknown as SupabaseClient, from, guestInsert, deckInsert, update };
}
describe('guest persistence used by iPad and other native clients', () => {
  it('creates a guest and preserves the chosen deck art', async () => {
    const mock = client();
    const result = await createGuestWithDeck(mock.db, { groupId: 'arena', displayName: ' Alice ', commander, selectedArtUrl: 'chosen.jpg', deckName: ' My deck ', existingGuests: [] });
    expect(mock.guestInsert).toHaveBeenCalledWith({ group_id: 'arena', display_name: 'Alice', normalized_name: 'alice' });
    expect(mock.deckInsert).toHaveBeenCalledWith(expect.objectContaining({ guest_id: 'g', group_id: 'arena', name: 'My deck', commander_image: 'chosen.jpg' }));
    expect(result.deck.id).toBe('gd');
  });
  it('reuses the same guest regardless of whitespace or case', async () => {
    const mock = client();await createGuestWithDeck(mock.db, { groupId: 'arena', displayName: ' ALICE ', commander, existingGuests: [guest] });
    expect(mock.guestInsert).not.toHaveBeenCalled();expect(mock.deckInsert).toHaveBeenCalledOnce();
  });
  it('adds a partner deck to an existing guest without creating another guest', async () => {
    const mock = client();await addDeckToGuest(mock.db, { groupId: 'arena', guestId: 'g', commander, partnerCommander: { ...commander, name: 'Kraum', colorIdentity: ['U', 'R'] } });
    expect(mock.guestInsert).not.toHaveBeenCalled();expect(mock.deckInsert).toHaveBeenCalledWith(expect.objectContaining({ guest_id: 'g', name: 'Tymna // Kraum', color_identity: ['W', 'B', 'U', 'R'] }));
  });
  it('rejects empty names before sending writes', async () => {
    const mock = client();await expect(createGuestWithDeck(mock.db, { groupId: 'arena', displayName: ' ', commander, existingGuests: [] })).rejects.toThrow('Guest name is required');expect(mock.from).not.toHaveBeenCalled();
  });
  it('propagates guest insert errors without adding a deck', async () => {
    const error = { message: 'denied' };const mock = client(error);await expect(createGuestWithDeck(mock.db, { groupId: 'arena', displayName: 'Alice', commander, existingGuests: [] })).rejects.toEqual(error);expect(mock.deckInsert).not.toHaveBeenCalled();
  });
  it('propagates deck failures and does not update last-played', async () => {
    const error = { message: 'offline' };const mock = client(null, error);await expect(addDeckToGuest(mock.db, { groupId: 'arena', guestId: 'g', commander })).rejects.toEqual(error);expect(mock.update).not.toHaveBeenCalled();
  });
});
