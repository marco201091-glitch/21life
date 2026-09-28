import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseParticipantKey } from '@/lib/participant-keys';
import type { ArenaGuest } from '@/lib/arena-participants';
import {
  fetchArenaGroup,
  fetchArenaGuests,
  fetchArenaMatches,
  fetchArenaMemberDecks,
} from '@/lib/arena-queries';
import { getParticipantDeckSnapshot } from '@/lib/arena-participants';
import { calculatePlayerStats } from '@/lib/arena-stats';
import { refreshMissingImportedDeckImages } from '@/lib/arena-deck-images';
import { prefetchCommanderNames, prefetchDeckImageUrls } from '@/lib/deck-image-cache';
import type { CommanderSearchResult } from '@/lib/commander-types';
import { addDeckToGuest, createGuestWithDeck } from '@/lib/guest-arena';
import { getSupabaseErrorMessage } from '@/lib/supabase-errors';
import { supabase } from '@/lib/supabase';
import { apiPost } from '@/lib/api';
import type { ArenaDetail, ArenaMatch, ArenaProfile, MemberDeck } from '@/lib/types/arena';
import { subscribeToArenaCatalog } from '@/lib/arena-catalog-realtime';
import {
  clearArenaCache,
  loadArenaCache,
  saveArenaCache,
  type ArenaCacheSnapshot,
} from '@/lib/arena-cache';
import { ARENA_MATCHES_PAGE_SIZE } from '@/lib/arena-matches';

export function useArena(groupId: string | undefined, userId: string | undefined) {
  const [group, setGroup] = useState<ArenaDetail | null>(null);
  const [members, setMembers] = useState<ArenaProfile[]>([]);
  const [matches, setMatches] = useState<ArenaMatch[]>([]);
  const [guests, setGuests] = useState<ArenaGuest[]>([]);
  const [decks, setDecks] = useState<MemberDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreMatches, setLoadingMoreMatches] = useState(false);
  const [hasMoreMatches, setHasMoreMatches] = useState(false);
  const memberIdsRef = useRef<string[]>([]);

  const applySnapshot = useCallback((snapshot: ArenaCacheSnapshot) => {
    setGroup(snapshot.group);
    setMembers(snapshot.members);
    setMatches(snapshot.matches);
    setHasMoreMatches(snapshot.matches.length >= ARENA_MATCHES_PAGE_SIZE);
    setGuests(snapshot.guests);
    setDecks(snapshot.decks);
    memberIdsRef.current = snapshot.members.map((member) => member.id);
  }, []);

  const refreshMatches = useCallback(async () => {
    if (!groupId) return [] as ArenaMatch[];
    const page = await fetchArenaMatches(supabase, groupId);
    setMatches(page.matches);
    setHasMoreMatches(page.hasMore);
    if (userId) {
      const cached = await loadArenaCache(groupId, userId);
      if (cached) await saveArenaCache({ ...cached, matches: page.matches });
    }
    return page.matches;
  }, [groupId, userId]);

  const loadMoreMatches = useCallback(async () => {
    if (!groupId || loadingMoreMatches || !hasMoreMatches) return;
    const oldestMatch = matches.at(-1);
    if (!oldestMatch) {
      setHasMoreMatches(false);
      return;
    }
    setLoadingMoreMatches(true);
    try {
      const page = await fetchArenaMatches(supabase, groupId, {
        playedAt: oldestMatch.played_at,
        id: oldestMatch.id,
      });
      setMatches((current) => {
        const knownIds = new Set(current.map((match) => match.id));
        return [...current, ...page.matches.filter((match) => !knownIds.has(match.id))];
      });
      setHasMoreMatches(page.hasMore);
    } finally {
      setLoadingMoreMatches(false);
    }
  }, [groupId, hasMoreMatches, loadingMoreMatches, matches]);

  const loadMemberDecks = useCallback(async (memberIds: string[]) => {
    if (!groupId) return [] as MemberDeck[];
    const loadedDecks = await fetchArenaMemberDecks(supabase, groupId, memberIds);
    setDecks(loadedDecks);
    return loadedDecks;
  }, [groupId]);

  const refresh = useCallback(async (showLoading = true) => {
    if (!groupId || !userId) {
      setLoading(false);
      return null;
    }

    if (showLoading) setLoading(true);
    try {
      const [groupData, matchesPage, guestData] = await Promise.all([
        fetchArenaGroup(supabase, groupId),
        fetchArenaMatches(supabase, groupId),
        fetchArenaGuests(supabase, groupId),
      ]);
      const loadedMatches = matchesPage.matches;

      if (!groupData) {
        setGroup(null);
        setMembers([]);
        setMatches([]);
        setHasMoreMatches(false);
        setGuests([]);
        setDecks([]);
        await clearArenaCache(groupId, userId);
        return null;
      }

      setGroup(groupData);
      setMembers(groupData.group_members.map((member) => member.profiles));
      setMatches(loadedMatches);
      setHasMoreMatches(matchesPage.hasMore);
      setGuests(guestData);

      const memberIds = groupData.group_members.map((member) => member.user_id);
      memberIdsRef.current = memberIds;
      const loadedDecks = await loadMemberDecks(memberIds);

      await saveArenaCache({
        groupId,
        userId,
        group: groupData,
        members: groupData.group_members.map((member) => member.profiles),
        matches: loadedMatches,
        guests: guestData,
        decks: loadedDecks,
      });

      const participantDecks = loadedMatches.flatMap((match) =>
        match.match_participants.map((participant) => getParticipantDeckSnapshot(participant)),
      );

      void prefetchDeckImageUrls([
        ...participantDecks.map((deck) => deck?.commander_image),
        ...loadedDecks.map((deck) => deck.commander_image),
        ...guestData.flatMap((guest) =>
          (guest.arena_guest_decks || []).map((deck) => deck.commander_image),
        ),
      ], { background: true });

      void prefetchCommanderNames([
        ...participantDecks.map((deck) => deck?.commander),
        ...loadedDecks.map((deck) => deck.commander),
        ...guestData.flatMap((guest) =>
          (guest.arena_guest_decks || []).map((deck) => deck.commander),
        ),
      ], { background: true });

      void refreshMissingImportedDeckImages(loadedDecks).then(async () => {
        const repairedDecks = await loadMemberDecks(memberIds);
        const cached = await loadArenaCache(groupId, userId);
        if (cached) await saveArenaCache({ ...cached, decks: repairedDecks });
      });

      return groupData;
    } catch (error) {
      console.error('Error fetching arena:', getSupabaseErrorMessage(error, 'Failed to fetch arena'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [groupId, loadMemberDecks, userId]);

  useEffect(() => {
    if (!groupId || !userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setGroup(null);
    setMembers([]);
    setMatches([]);
    setHasMoreMatches(false);
    setGuests([]);
    setDecks([]);
    setLoading(true);
    void (async () => {
      const cached = await loadArenaCache(groupId, userId);
      if (cancelled) return;
      if (cached) {
        applySnapshot(cached);
        setLoading(false);
      }
      await refresh(!cached);
    })();
    return () => { cancelled = true; };
  }, [applySnapshot, groupId, refresh, userId]);

  useEffect(() => {
    if (!groupId || !userId) return;
    return subscribeToArenaCatalog(supabase, groupId, (event) => {
      if (event.entity === 'deck') {
        void loadMemberDecks(memberIdsRef.current);
        return;
      }
      if (event.entity === 'guest' || event.entity === 'guest_deck') {
        void fetchArenaGuests(supabase, groupId).then(setGuests);
        return;
      }
      void refresh(false);
    });
  }, [groupId, loadMemberDecks, refresh, userId]);

  const playerStats = useMemo(() => calculatePlayerStats(matches), [matches]);

  const createMatch = useCallback(async (input: {
    selectedParticipantKeys: string[];
    winnerKey: string | null;
    isDraw: boolean;
    participantDecks: Record<string, string>;
    matchPlayedAtIso: string;
    matchNotes: string;
    winCondition: NonNullable<import('@/lib/types/arena').ArenaMatch['win_condition']>;
  }) => {
    if (!groupId || !userId) {
      throw new Error('Missing arena context');
    }

    const winnerParsed = !input.isDraw && input.winnerKey
      ? parseParticipantKey(input.winnerKey)
      : null;
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .insert({
        group_id: groupId,
        is_draw: input.isDraw,
        winner_id: !input.isDraw && winnerParsed?.type === 'user' ? winnerParsed.id : null,
        winner_guest_id: !input.isDraw && winnerParsed?.type === 'guest' ? winnerParsed.id : null,
        created_by: userId,
        notes: input.matchNotes || null,
        played_at: input.matchPlayedAtIso,
        win_condition: input.isDraw ? null : input.winCondition,
      })
      .select()
      .single();

    if (matchError) throw matchError;

    const participants = input.selectedParticipantKeys.map((participantKey) => {
      const parsed = parseParticipantKey(participantKey);
      const deckId = input.participantDecks[participantKey] || null;
      const isGuest = parsed?.type === 'guest';

      return {
        match_id: match.id,
        user_id: isGuest ? null : parsed?.id,
        guest_id: isGuest ? parsed?.id : null,
        deck_id: isGuest ? null : deckId,
        guest_deck_id: isGuest ? deckId : null,
        is_winner: !input.isDraw && participantKey === input.winnerKey,
      };
    });

    const { error: participantsError } = await supabase.from('match_participants').insert(participants);
    if (participantsError) {
      await supabase.from('matches').delete().eq('id', match.id);
      throw participantsError;
    }
    void apiPost('/api/notifications/match-completed', { matchId: match.id });

    const guestIds = input.selectedParticipantKeys
      .map((key) => parseParticipantKey(key))
      .filter((parsed) => parsed?.type === 'guest')
      .map((parsed) => parsed!.id);

    if (guestIds.length > 0) {
      await supabase
        .from('arena_guests')
        .update({ last_played_at: new Date().toISOString() })
        .in('id', guestIds);
    }

    await refreshMatches();
    if (guestIds.length > 0) {
      const guestData = await fetchArenaGuests(supabase, groupId);
      setGuests(guestData);
    }
  }, [groupId, refreshMatches, userId]);

  const updateGroup = useCallback(async (name: string, description: string, isPublic?: boolean) => {
    if (!groupId) return;

    const payload: {
      name: string;
      description: string | null;
      is_public?: boolean;
    } = {
      name: name.trim(),
      description: description.trim() || null,
    };

    if (typeof isPublic === 'boolean') {
      payload.is_public = isPublic;
    }

    const { error } = await supabase
      .from('groups')
      .update(payload)
      .eq('id', groupId);

    if (error) throw error;
    await refresh();
  }, [groupId, refresh]);

  const updateMatch = useCallback(async (input: {
    matchId: string;
    winnerKey: string | null;
    isDraw: boolean;
    participantDecks: Record<string, string>;
    matchPlayedAtIso: string;
    matchNotes: string;
    winCondition: import('@/lib/types/arena').ArenaMatch['win_condition'];
    isArenaManager: boolean;
    participants: Array<{
      id: string;
      participantKey: string | null;
      isGuest: boolean;
      replacementKey: string | null;
    }>;
  }) => {
    if (input.participants.some((participant) => participant.replacementKey) && !input.isArenaManager) {
      throw new Error('Only the arena manager can replace match participants');
    }
    const winnerParsed = !input.isDraw && input.winnerKey
      ? parseParticipantKey(input.winnerKey)
      : null;
    const { error: matchError } = await supabase
      .from('matches')
      .update({
        is_draw: input.isDraw,
        winner_id: !input.isDraw && winnerParsed?.type === 'user' ? winnerParsed.id : null,
        winner_guest_id: !input.isDraw && winnerParsed?.type === 'guest' ? winnerParsed.id : null,
        notes: input.matchNotes || null,
        played_at: input.matchPlayedAtIso,
        win_condition: input.isDraw ? null : input.winCondition,
      })
      .eq('id', input.matchId);

    if (matchError) throw matchError;

    for (const participant of input.participants) {
      const replacement = participant.replacementKey
        ? parseParticipantKey(participant.replacementKey)
        : null;
      const participantKey = participant.replacementKey || participant.participantKey;
      const isGuest = replacement ? replacement.type === 'guest' : participant.isGuest;
      const deckId = participantKey
        ? input.participantDecks[participantKey] || null
        : null;

      const { error: participantError } = await supabase
        .from('match_participants')
        .update({
          ...(participant.replacementKey ? {
            user_id: replacement?.type === 'user' ? replacement.id : null,
            guest_id: replacement?.type === 'guest' ? replacement.id : null,
          } : {}),
          deck_id: isGuest ? null : deckId,
          guest_deck_id: isGuest ? deckId : null,
          is_winner: !input.isDraw && participantKey === input.winnerKey,
        })
        .eq('id', participant.id);

      if (participantError) throw participantError;
    }

    if (input.participants.some((participant) => participant.replacementKey)) {
      const replacementWinner = input.participants.find((participant) => participant.participantKey === input.winnerKey && participant.replacementKey);
      if (replacementWinner) {
        const parsed = parseParticipantKey(replacementWinner.replacementKey!);
        const { error: winnerError } = await supabase.from('matches').update({
          winner_id: parsed?.type === 'user' ? parsed.id : null,
          winner_guest_id: parsed?.type === 'guest' ? parsed.id : null,
        }).eq('id', input.matchId);
        if (winnerError) throw winnerError;
      }
    }

    await refreshMatches();
  }, [refreshMatches]);

  const kickMember = useCallback(async (memberId: string) => {
    if (!groupId) return;

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', memberId);

    if (error) throw error;
    await refresh();
  }, [groupId, refresh]);

  const deleteArena = useCallback(async () => {
    if (!groupId) return;

    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (error) throw error;
  }, [groupId]);

  const leaveArena = useCallback(async () => {
    if (!groupId || !userId) return;

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) throw error;
  }, [groupId, userId]);

  const deleteMatch = useCallback(async (matchId: string) => {
    const { error: participantError } = await supabase.from('match_participants').delete().eq('match_id', matchId);
    if (participantError) throw participantError;
    const { error } = await supabase.from('matches').delete().eq('id', matchId);
    if (error) throw error;
    const { data: remaining, error: verifyError } = await supabase
      .from('matches')
      .select('id')
      .eq('id', matchId)
      .maybeSingle();
    if (verifyError) throw verifyError;
    if (remaining) throw new Error('Match was not deleted');
    await refreshMatches();
  }, [refreshMatches]);

  const addGuest = useCallback(async (input: {
    displayName: string;
    commander: CommanderSearchResult;
    partnerCommander?: CommanderSearchResult | null;
    deckName?: string;
    selectedArtUrl?: string | null;
  }) => {
    if (!groupId) throw new Error('Missing arena');

    await createGuestWithDeck(supabase, {
      groupId,
      displayName: input.displayName,
      commander: input.commander,
      partnerCommander: input.partnerCommander,
      deckName: input.deckName,
      selectedArtUrl: input.selectedArtUrl,
      existingGuests: guests,
    });

    const guestData = await fetchArenaGuests(supabase, groupId);
    setGuests(guestData);
  }, [groupId, guests]);

  const addGuestDeck = useCallback(async (input: {
    guestId: string;
    commander: CommanderSearchResult;
    partnerCommander?: CommanderSearchResult | null;
    deckName?: string;
    selectedArtUrl?: string | null;
  }) => {
    if (!groupId) throw new Error('Missing arena');

    await addDeckToGuest(supabase, {
      groupId,
      guestId: input.guestId,
      commander: input.commander,
      partnerCommander: input.partnerCommander,
      deckName: input.deckName,
      selectedArtUrl: input.selectedArtUrl,
    });

    const guestData = await fetchArenaGuests(supabase, groupId);
    setGuests(guestData);
  }, [groupId]);

  const removeGuest = useCallback(async (guestId: string) => {
    if (!groupId) return;

    const { error } = await supabase
      .from('arena_guests')
      .delete()
      .eq('id', guestId)
      .eq('group_id', groupId);

    if (error) throw error;

    const guestData = await fetchArenaGuests(supabase, groupId);
    setGuests(guestData);
    await refreshMatches();
  }, [groupId, refreshMatches]);

  return {
    group,
    members,
    matches,
    hasMoreMatches,
    loadingMoreMatches,
    guests,
    decks,
    playerStats,
    loading,
    refresh,
    loadMoreMatches,
    refreshMatches,
    createMatch,
    updateGroup,
    updateMatch,
    kickMember,
    deleteArena,
    leaveArena,
    deleteMatch,
    addGuest,
    addGuestDeck,
    removeGuest,
  };
}
