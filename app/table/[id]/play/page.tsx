'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WebLiveGame, type WebTrackerParticipant } from '@/components/live-game/web-live-game';
import { AppLoader } from '@/components/ui/app-loader';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/components/language-provider';
import { supabase } from '@/lib/supabase';
import { toGuestParticipantKey, toUserParticipantKey } from '@/lib/participant-keys';
import { loadWebLiveGameSetup } from '@/lib/live-game-setup';
import { subscribeToArenaCatalog } from '@/lib/arena-catalog-realtime';

type GroupPayload = {
  id: string;
  name: string;
  group_members: Array<{
    user_id: string;
    profiles: { id: string; username: string; display_name: string | null } | null;
  }>;
};

type UserDeck = {
  id: string;
  user_id: string;
  name: string;
  commander: string;
  commander_image: string | null;
  is_favorite: boolean;
  source_type?: string | null;
};

type GuestPayload = {
  id: string;
  display_name: string;
  arena_guest_decks: Array<{
    id: string;
    name: string;
    commander: string;
    commander_image: string | null;
  }>;
};

export default function WebLiveGamePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { copy } = useLanguage();
  const groupId = params.id;
  // Stable across Supabase token refreshes: depending on `user` re-ran the
  // catalog load on every refresh, and a transient empty read redirected an
  // in-progress tracker to the dashboard.
  const userId = user?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [arenaName, setArenaName] = useState('');
  const [participants, setParticipants] = useState<WebTrackerParticipant[]>([]);

  const load = useCallback(async (silent = false) => {
    if (!userId || !groupId) return;
    if (!silent) { setLoading(true); setLoadError(false); }
    try {
      const [{ data: group, error: groupError }, { data: guests, error: guestsError }] = await Promise.all([
        supabase
          .from('groups')
          .select(`
            id,
            name,
            group_members (
              user_id,
              profiles (id, username, display_name)
            )
          `)
          .eq('id', groupId)
          .maybeSingle(),
        supabase
          .from('arena_guests')
          .select(`
            id,
            display_name,
            arena_guest_decks (id, name, commander, commander_image)
          `)
          .eq('group_id', groupId)
          .order('last_played_at', { ascending: false, nullsFirst: false }),
      ]);
      if (groupError) throw groupError;
      if (guestsError) throw guestsError;
      if (!group) {
        // Never navigate an in-progress tracker away on an empty read. A
        // deleted arena and a transient auth/RLS gap look identical here, so
        // show the retry state instead of guessing.
        if (!silent) setLoadError(true);
        return;
      }
      const payload = group as unknown as GroupPayload;
      if (!payload.group_members.some((member) => member.user_id === userId)) {
        if (!silent) router.replace(`/table/${groupId}`);
        return;
      }
      const memberIds = payload.group_members.map((member) => member.user_id);
      const { data: decks, error: decksError } = await supabase
        .from('decks')
        .select('id,user_id,name,commander,commander_image,is_favorite')
        .in('user_id', memberIds)
        .is('group_id', null)
        .or('source_type.is.null,source_type.neq.occasional')
        .order('is_favorite', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(720);
      if (decksError) throw decksError;

      const userDecks = (decks ?? []) as UserDeck[];
      const restoredIds = loadWebLiveGameSetup(groupId, userId).seats.flatMap(seat => seat.deckId ? [seat.deckId] : []);
      if (restoredIds.length) {
        const { data: restored, error: restoreError } = await supabase.from('decks')
          .select('id,user_id,name,commander,commander_image,is_favorite,source_type')
          .in('id', restoredIds).in('user_id', memberIds).eq('group_id', groupId).eq('source_type', 'occasional');
        if (restoreError) throw restoreError;
        userDecks.push(...(restored ?? []) as UserDeck[]);
      }
      const memberOptions: WebTrackerParticipant[] = payload.group_members
        .filter((member) => member.profiles)
        .map((member) => ({
          key: toUserParticipantKey(member.user_id),
          displayName: member.profiles!.display_name?.trim() || member.profiles!.username,
          isGuest: false,
          userId: member.user_id,
          guestId: null,
          decks: userDecks.filter((deck) => deck.user_id === member.user_id).map((deck) => ({
            id: deck.id,
            name: deck.name,
            commander: deck.commander,
            commanderImage: deck.commander_image,
            isFavorite: deck.is_favorite,
            isOccasional: deck.source_type === 'occasional',
          })),
        }));
      const guestOptions: WebTrackerParticipant[] = ((guests ?? []) as GuestPayload[]).map((guest) => ({
        key: toGuestParticipantKey(guest.id),
        displayName: guest.display_name,
        isGuest: true,
        userId: null,
        guestId: guest.id,
        decks: (guest.arena_guest_decks ?? []).map((deck) => ({
          id: deck.id,
          name: deck.name,
          commander: deck.commander,
          commanderImage: deck.commander_image,
          isFavorite: false,
        })),
      }));
      setArenaName(payload.name);
      setParticipants([...memberOptions, ...guestOptions]);
    } catch (error) {
      console.error('Failed to load web live tracker', error);
      if (!silent) setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [groupId, router, userId]);

  const loadedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    const key = userId && groupId ? `${userId}:${groupId}` : null;
    // Only the first load for this account/group may treat an empty read as
    // "the arena is gone". Any later re-run (router identity or a token
    // refresh) stays silent, so a running tracker cannot be ejected.
    const initial = key !== null && loadedSessionRef.current !== key;
    loadedSessionRef.current = key;
    void load(!initial);
  }, [groupId, load, userId]);

  useEffect(() => {
    if (!userId || !groupId) return;
    return subscribeToArenaCatalog(supabase, groupId, () => {
      void load(true);
    });
  }, [groupId, load, userId]);

  if (authLoading || loading || !user) {
    return <AppLoader label={copy({ it: 'Caricamento tracker...', en: 'Loading tracker...' })} />;
  }

  if (loadError) return <div className="mx-auto max-w-md space-y-4 p-6">
    <p role="alert">{copy({ en: 'Could not load this arena. It may no longer be available, or the connection failed. Retry before entering the tracker.', it: 'Impossibile caricare questa arena. Potrebbe non essere più disponibile o la connessione è fallita. Riprova prima di entrare nel tracker.' })}</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={() => void load()} className="rounded-xl border border-border p-3">{copy({ en: 'Retry', it: 'Riprova' })}</button>
      <button type="button" onClick={() => router.push('/dashboard')} className="rounded-xl border border-border p-3 text-muted-foreground">{copy({ en: 'Back to dashboard', it: 'Torna alla dashboard' })}</button>
    </div>
  </div>;

  return (
    <WebLiveGame
      groupId={groupId}
      arenaName={arenaName}
      userId={user.id}
      participants={participants}
    />
  );
}
