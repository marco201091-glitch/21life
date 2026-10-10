import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberDeck } from './types/arena';
import { withLiveGameRequestTimeout } from './live-game-async';

export interface OccasionalDeckInput {
  id: string;
  groupId: string;
  userId: string;
  name: string;
  commander: string;
  commanderImage: string | null;
  colorIdentity: string[];
  bracket: string | null;
  commanderOptions?: unknown[];
}

export function isOccasionalDeck(deck: { source_type?: string | null }): boolean {
  return deck.source_type === 'occasional';
}

/** The caller retains this input ID across retries; creation requires a connection. */
export async function createOccasionalDeck(client: Pick<SupabaseClient, 'rpc'>, input: OccasionalDeckInput): Promise<MemberDeck> {
  const { data, error } = await withLiveGameRequestTimeout(client.rpc('create_occasional_deck', {
    p_id: input.id,
    p_group_id: input.groupId,
    p_user_id: input.userId,
    p_name: input.name,
    p_commander: input.commander,
    p_commander_image: input.commanderImage,
    p_color_identity: input.colorIdentity,
    p_bracket: input.bracket,
    p_commander_options: input.commanderOptions ?? [],
  }));
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Occasional deck creation returned no deck');
  return data as MemberDeck;
}
