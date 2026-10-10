import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberDeck } from '@/lib/types/arena';

export async function restoreSetupDecks(client: SupabaseClient, groupId: string, deckIds: string[]): Promise<MemberDeck[]> {
 if (!deckIds.length) return [];
 const { data, error } = await client.from('decks').select('*').eq('group_id', groupId).eq('source_type', 'occasional').in('id', deckIds);
 if (error) throw error;
 return (data || []) as MemberDeck[];
}
