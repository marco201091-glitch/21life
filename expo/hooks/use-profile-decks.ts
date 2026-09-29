import { useCallback, useEffect, useState } from 'react';
import { apiPost } from '@/lib/api';
import { isImportedDeckSource } from '@/lib/deck-importers';
import { prefetchEdhrecStats } from '@/lib/edhrec-client';
import {
  buildPairedCommanderColorFields,
  buildPairedCommanderName,
} from '@/lib/commander-partners';
import type { CommanderSearchResult } from '@/lib/commander-types';
import {
  deckDataToColorFields,
  getDefaultImportedCommanderOption,
  repairImportedCommanderOptions,
  resolveImportedDeckCommanderImage,
  type CommanderOption,
  type ImportedDeckPreview,
} from '@/lib/deck-importers';
import { fetchCommanderArtOptions } from '@/lib/commander-arts';
import {
  filterSelectableCommanderOptions,
  getCommanderOptions,
  mergeDeckColorFields,
  resolveSelectedCommanderOption,
  type CommanderMetadataOption,
} from '@/lib/deck-metadata';
import {
  buildPersonalAnalytics,
  type PersonalDeckSnapshot,
  type PersonalMatchParticipantRow,
} from '@/lib/personal-analytics';
import { buildMatchRecord, type MatchRecord } from '@/lib/win-rate';
import { getDeckDisplayColors } from '@/lib/deck-metadata';
import { getSupabaseErrorMessage } from '@/lib/supabase-errors';
import { supabase } from '@/lib/supabase';
import { prefetchProfileDeckImages } from '@/lib/deck-image-cache';
import { fetchProfileDeckPerformance } from '@/lib/profile-deck-performance';
import type { DeckPerformance, DeckWinRate, ProfileDeck } from '@/lib/types/profile';
import { syncArchidektUserDecks as syncArchidektDecks } from '@/lib/archidekt-auto-sync';

function uniqueCommanderOptions(options: CommanderMetadataOption[]) {
  return options.filter((option, index, allOptions) =>
    option.name &&
    allOptions.findIndex((candidate) => candidate.name.toLowerCase() === option.name.toLowerCase()) === index
  );
}

export function useProfileDecks(userId: string | undefined) {
  const [decks, setDecks] = useState<ProfileDeck[]>([]);
  const [winRates, setWinRates] = useState<Record<string, DeckWinRate>>({});
  const [performance, setPerformance] = useState<Record<string, DeckPerformance>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setDecks([]);
      setWinRates({});
      setPerformance({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: deckRows, error: deckError } = await supabase
        .from('decks')
        .select('id, user_id, group_id, name, commander, commander_image, source_url, source_type, bracket, color_identity, commander_options, commander_cmc, is_favorite, is_archived, created_at, updated_at')
        .is('group_id', null)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (deckError) throw deckError;

      const loadedDecks = (deckRows as ProfileDeck[]) || [];
      setDecks(loadedDecks);
      setLoading(false);
      prefetchProfileDeckImages(loadedDecks);
      void repairLoadedDeckArtwork(loadedDecks).then((repairedDecks) => {
        const repairedById = new Map(repairedDecks.map((deck) => [deck.id, deck]));
        setDecks((current) => current.map((deck) => repairedById.get(deck.id) || deck));
        prefetchProfileDeckImages(repairedDecks);
      });

      const deckIds = loadedDecks.map((deck) => deck.id);
      if (deckIds.length === 0) {
        setWinRates({});
        setPerformance({});
        return;
      }

      const rollup = await fetchProfileDeckPerformance(supabase, userId);
      if (rollup) {
        setWinRates(rollup.winRates);
        setPerformance(rollup.performance);
        return;
      }

      // V6 compatibility while production is waiting for the aggregate RPC.
      const { data: participantRows, error: participantsError } = await supabase
        .from('match_participants')
        .select('is_winner, deck_id, placement, life_lost, life_gained, life_damage_dealt, commander_damage_dealt, infect_dealt, eliminations_caused, matches (is_draw, duration_seconds, tracking_version)')
        .in('deck_id', deckIds);

      if (participantsError) {
        console.error(
          'Error fetching deck performance:',
          getSupabaseErrorMessage(participantsError, 'Failed to fetch deck performance'),
        );
        setWinRates({});
        setPerformance({});
        return;
      }

      const participants = (participantRows as PersonalMatchParticipantRow[]) || [];
      const decksById = new Map<string, PersonalDeckSnapshot>(
        loadedDecks.map((deck) => [deck.id, {
          id: deck.id,
          name: deck.name,
          commander: deck.commander,
          commander_image: deck.commander_image,
          color_identity: deck.color_identity,
          source_type: deck.source_type,
          source_url: deck.source_url,
        }]),
      );
      const colorOverrides = new Map<string, string[]>();
      loadedDecks.forEach((deck) => {
        const colors = getDeckDisplayColors(deck);
        if (colors.length > 0) colorOverrides.set(deck.id, colors);
      });

      const analytics = buildPersonalAnalytics(participants, decksById, colorOverrides);
      const nextWinRates: Record<string, DeckWinRate> = {};
      analytics.topDecks.forEach((deck) => {
        nextWinRates[deck.id] = {
          gamesPlayed: deck.gamesPlayed,
          wins: deck.wins,
          losses: deck.losses,
          draws: deck.draws,
          decisiveGames: deck.decisiveGames,
          winRate: deck.winRate,
        };
      });
      setWinRates(nextWinRates);

      type PerformanceAccumulator = Omit<DeckPerformance, keyof MatchRecord>
        & { gamesPlayed: number; wins: number; draws: number; winningDurations?: number[] };
      const performanceMap: Record<string, PerformanceAccumulator> = {};
      ((participantRows || []) as Array<Record<string, unknown>>).forEach((raw) => {
        const deckId = raw.deck_id as string | null;
        if (!deckId) return;
        const relation = Array.isArray(raw.matches) ? raw.matches[0] : raw.matches;
        const match = (relation || {}) as { is_draw?: boolean | null; duration_seconds?: number | null; tracking_version?: number | null };
        const tracked = match.tracking_version != null || match.duration_seconds != null;
        const current = performanceMap[deckId] || {
          gamesPlayed: 0, wins: 0, draws: 0, masteryPoints: 0, trackedGames: 0, trackingCoverage: 0,
          secondPlaces: 0, damageDealt: 0, damageTaken: 0, lifeGained: 0,
          commanderDamage: 0, infectDealt: 0, eliminations: 0,
          medianWinningDurationSeconds: null, winningDurations: [],
        };
        current.gamesPlayed += 1;
        if (match.is_draw) current.draws += 1;
        if (raw.is_winner) current.wins += 1;
        if (raw.placement === 2) current.secondPlaces += 1;
        if (tracked) {
          current.trackedGames += 1;
          current.damageDealt += Number(raw.life_damage_dealt || 0);
          current.damageTaken += Number(raw.life_lost || 0);
          current.lifeGained += Number(raw.life_gained || 0);
          current.commanderDamage += Number(raw.commander_damage_dealt || 0);
          current.infectDealt += Number(raw.infect_dealt || 0);
          current.eliminations += Number(raw.eliminations_caused || 0);
          if (raw.is_winner && match.duration_seconds != null) current.winningDurations!.push(match.duration_seconds);
        }
        performanceMap[deckId] = current;
      });
      const nextPerformance: Record<string, DeckPerformance> = {};
      Object.entries(performanceMap).forEach(([deckId, entry]) => {
        const { winningDurations = [], ...rest } = entry;
        const values = [...winningDurations].sort((a, b) => a - b);
        const middle = Math.floor(values.length / 2);
        nextPerformance[deckId] = {
          ...rest,
          ...buildMatchRecord(entry),
          masteryPoints: entry.gamesPlayed + entry.wins * 2,
          trackingCoverage: entry.gamesPlayed
            ? Math.round((entry.trackedGames / entry.gamesPlayed) * 100)
            : 0,
          medianWinningDurationSeconds: values.length
            ? (values.length % 2
              ? values[middle]
              : Math.round((values[middle - 1] + values[middle]) / 2))
            : null,
        };
      });
      setPerformance(nextPerformance);
    } catch (error) {
      console.error('Error fetching decks:', getSupabaseErrorMessage(error, 'Failed to fetch decks'));
      setDecks([]);
      setWinRates({});
      setPerformance({});
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const deleteDeck = useCallback(async (deckId: string) => {
    const { error } = await supabase.from('decks').delete().eq('id', deckId);
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const toggleDeckFavorite = useCallback(async (deckId: string, favorite: boolean) => {
    if (!userId) throw new Error('Not authenticated');
    setDecks((current) => current.map((deck) => deck.id === deckId ? { ...deck, is_favorite: favorite } : deck));
    const { error } = await supabase.from('decks').update({ is_favorite: favorite }).eq('id', deckId).eq('user_id', userId);
    if (error) {
      setDecks((current) => current.map((deck) => deck.id === deckId ? { ...deck, is_favorite: !favorite } : deck));
      throw error;
    }
  }, [userId]);

  const setDeckArchived = useCallback(async (deckId: string, archived: boolean) => {
    if (!userId) throw new Error('Not authenticated');
    const { error } = await supabase.from('decks').update({ is_archived: archived })
      .eq('id', deckId).eq('user_id', userId).is('group_id', null);
    if (error) throw error;
    await refresh();
  }, [refresh, userId]);

  const saveImportedDeck = useCallback(async (
    imported: ImportedDeckPreview,
    options?: {
      selectedCommander?: CommanderOption | null;
      deckName?: string;
      overwrite?: boolean;
    },
  ) => {
    if (!userId) throw new Error('Not authenticated');

    const existingDeck = decks.find((deck) => deck.source_url === imported.sourceUrl);
    if (existingDeck && !options?.overwrite) {
      return { inserted: 0, updated: 0, skipped: 1 };
    }

    const repairedOptions = await repairCommanderOptions(imported.commanderOptions || []);
    const repairedImported = { ...imported, commanderOptions: repairedOptions };
    const requestedCommander = options?.selectedCommander || getDefaultImportedCommanderOption(repairedImported);
    const selectedCommander = repairedOptions.find(
      (option) => option.name.toLowerCase() === requestedCommander.name.toLowerCase(),
    ) || requestedCommander;
    let commanderImage = resolveImportedDeckCommanderImage(
      selectedCommander,
      repairedImported,
      { preserveImage: existingDeck?.commander_image },
    );
    if (!commanderImage) {
      const arts = await fetchCommanderArtOptions(selectedCommander.name);
      commanderImage = arts[0]?.imageUrl?.trim() || null;
    }
    const commander = repairedOptions.length > 1
      ? imported.commander
      : selectedCommander.name;
    const colorFields = deckDataToColorFields({
      commanderOptions: repairedOptions,
      colorIdentity: imported.colorIdentity || [],
    });
    const payload = {
      name: options?.deckName?.trim() || imported.name,
      commander,
      commander_image: commanderImage,
      source_url: imported.sourceUrl,
      source_type: imported.sourceType,
      bracket: imported.bracket,
      ...colorFields,
    };

    if (existingDeck) {
      const { error } = await supabase
        .from('decks')
        .update(payload)
        .eq('id', existingDeck.id);

      if (error) throw error;
      await refresh();
      return { inserted: 0, updated: 1, skipped: 0 };
    }

    const { error } = await supabase.from('decks').insert({
      user_id: userId,
      group_id: null,
      ...payload,
    });

    if (error) throw error;
    await refresh();
    return { inserted: 1, updated: 0, skipped: 0 };
  }, [decks, refresh, userId]);

  const saveManualDeck = useCallback(async (input: {
    commander: CommanderSearchResult;
    partnerCommander?: CommanderSearchResult | null;
    deckName?: string;
    selectedArtUrl?: string | null;
  }) => {
    if (!userId) throw new Error('Not authenticated');

    const commanderDisplayName = buildPairedCommanderName(input.commander, input.partnerCommander);
    const colorFields = buildPairedCommanderColorFields(input.commander, input.partnerCommander);
    const commanderImage = input.selectedArtUrl ?? input.commander.imageUrl;

    const { error } = await supabase.from('decks').insert({
      user_id: userId,
      group_id: null,
      name: input.deckName?.trim() || commanderDisplayName,
      commander: commanderDisplayName,
      commander_image: commanderImage,
      source_url: null,
      source_type: 'manual',
      bracket: null,
      ...colorFields,
    });

    if (error) throw error;
    await refresh();
  }, [refresh, userId]);

  const refreshImportedDeck = useCallback(async (deck: ProfileDeck) => {
    if (deck.source_type === 'manual' || !deck.source_url) return null;

    const { data, error, status } = await apiPost<ImportedDeckPreview & { error?: string }>(
      '/api/deck-import',
      { url: deck.source_url, fresh: true },
    );

    if (status !== 200 || error || !data?.name) return null;

    const importedCommanderOptions = await repairCommanderOptions(data.commanderOptions || []);
    const currentCommanderStillAvailable = importedCommanderOptions.some((option) =>
      option.name.toLowerCase() === deck.commander.toLowerCase()
    );
    const refreshedCommander = currentCommanderStillAvailable
      ? deck.commander
      : data.commander || deck.commander;
    const refreshedCommanderOption = importedCommanderOptions.find((option) =>
      option.name.toLowerCase() === refreshedCommander.toLowerCase()
    );
    const colorFields = deckDataToColorFields({
      commanderOptions: importedCommanderOptions,
      colorIdentity: data.colorIdentity || [],
    });
    const refreshedDeck = {
      name: data.name || deck.name,
      commander: refreshedCommander,
      commander_image: currentCommanderStillAvailable
        ? deck.commander_image || refreshedCommanderOption?.imageUrl || data.commanderImageUrl || null
        : refreshedCommanderOption?.imageUrl || data.commanderImageUrl || deck.commander_image,
      bracket: typeof data.bracket === 'string' ? data.bracket : null,
      ...colorFields,
    };

    const { error: updateError } = await supabase
      .from('decks')
      .update(refreshedDeck)
      .eq('id', deck.id);

    if (updateError) return null;
    return { id: deck.id, ...refreshedDeck };
  }, []);

  const updateDeck = useCallback(async (
    deckId: string,
    input: {
      commander: string;
      commanderImage: string | null;
      commanderOptions: CommanderMetadataOption[];
    },
  ) => {
    const deck = decks.find((entry) => entry.id === deckId);
    if (!deck) throw new Error('Deck not found');

    const colorFields = mergeDeckColorFields(deck, input.commanderOptions);
    const { error } = await supabase
      .from('decks')
      .update({
        commander: input.commander,
        commander_image: input.commanderImage,
        ...colorFields,
      })
      .eq('id', deckId);

    if (error) throw error;
    await refresh();
  }, [decks, refresh]);

  const linkDeckSource = useCallback(async (deck: ProfileDeck, sourceUrl: string) => {
    const { data, error, status } = await apiPost<ImportedDeckPreview & { error?: string }>(
      '/api/deck-import',
      { url: sourceUrl },
    );
    if (status !== 200 || error || !data?.sourceUrl || !isImportedDeckSource(data.sourceType)) {
      throw new Error(data?.error || 'Invalid Archidekt or Moxfield link');
    }
    const duplicate = decks.find((entry) =>
      entry.id !== deck.id && entry.user_id === deck.user_id && entry.source_url === data.sourceUrl,
    );
    if (duplicate) throw new Error('This list is already linked to another deck');

    const colorFields = deckDataToColorFields({
      commanderOptions: data.commanderOptions || [],
      colorIdentity: data.colorIdentity || [],
    });
    const { error: updateError } = await supabase
      .from('decks')
      .update({
        source_url: data.sourceUrl,
        source_type: data.sourceType,
        bracket: data.bracket,
        ...colorFields,
      })
      .eq('id', deck.id);
    if (updateError) throw updateError;
    await refresh();
  }, [decks, refresh]);

  const saveArchidektUserDecks = useCallback(async (input: {
    decks: ImportedDeckPreview[];
    selectedUrls: string[];
    selectedCommanders: Record<string, CommanderOption>;
    overwriteExisting?: boolean;
  }) => {
    if (!userId) throw new Error('Not authenticated');

    const existingByUrl = new Map(
      decks
        .filter((deck) => deck.source_url)
        .map((deck) => [deck.source_url as string, deck]),
    );

    const selectedDecks = input.decks.filter((deck) => input.selectedUrls.includes(deck.sourceUrl));
    const decksToInsert: Array<Record<string, unknown>> = [];
    const decksToUpdate: Array<{ id: string; payload: Record<string, unknown> }> = [];

    for (const deck of selectedDecks) {
      const repairedOptions = await repairCommanderOptions(deck.commanderOptions || []);
      const repairedDeck = { ...deck, commanderOptions: repairedOptions };
      const requestedCommander = input.selectedCommanders[deck.sourceUrl] || getDefaultImportedCommanderOption(repairedDeck);
      const selectedCommander = repairedOptions.find(
        (option) => option.name.toLowerCase() === requestedCommander.name.toLowerCase(),
      ) || requestedCommander;
      const colorFields = deckDataToColorFields({
        commanderOptions: repairedOptions,
        colorIdentity: deck.colorIdentity || [],
      });
      const existingDeck = existingByUrl.get(deck.sourceUrl);
      let commanderImage = resolveImportedDeckCommanderImage(
        selectedCommander,
        repairedDeck,
        { preserveImage: existingDeck?.commander_image },
      );
      if (!commanderImage) {
        const arts = await fetchCommanderArtOptions(selectedCommander.name);
        commanderImage = arts[0]?.imageUrl?.trim() || null;
      }
      const payload = {
        name: deck.name,
        commander: selectedCommander.name,
        commander_image: commanderImage,
        source_url: deck.sourceUrl,
        source_type: deck.sourceType,
        bracket: deck.bracket,
        ...colorFields,
      };
      if (existingDeck) {
        if (input.overwriteExisting) {
          decksToUpdate.push({ id: existingDeck.id, payload });
        }
        continue;
      }

      decksToInsert.push({
        user_id: userId,
        group_id: null,
        ...payload,
      });
    }

    if (decksToInsert.length === 0 && decksToUpdate.length === 0) {
      return { inserted: 0, updated: 0, skipped: selectedDecks.length };
    }

    const syncRows = [
      ...decksToInsert,
      ...decksToUpdate.map((entry) => entry.payload),
    ];
    const { data: syncResult, error } = await supabase.rpc('sync_archidekt_decks', {
      p_decks: syncRows,
    });
    if (error) throw error;

    await refresh();
    const counts = (syncResult || {}) as { inserted?: number; updated?: number };
    return {
      inserted: counts.inserted ?? decksToInsert.length,
      updated: counts.updated ?? decksToUpdate.length,
      skipped: selectedDecks.length - syncRows.length,
    };
  }, [decks, refresh, userId]);

  const syncArchidektUserDecks = useCallback(async (username: string) => {
    const result = await syncArchidektDecks(username);
    await refresh();
    return result;
  }, [refresh]);

  const refreshAllDecks = useCallback(async () => {
    const decksToRefresh = decks.filter(
      (deck) => isImportedDeckSource(deck.source_type) && Boolean(deck.source_url),
    );

    if (decksToRefresh.length === 0) {
      return { imported: 0, edhrec: 0, rateLimited: false, skipped: true };
    }

    let imported = 0;
    let edhrec = 0;
    let rateLimited = false;

    for (const deck of decksToRefresh) {
      const { status } = await apiPost<{ ok?: boolean }>('/api/profile/deck-refresh-budget', {});
      if (status !== 200) {
        rateLimited = true;
        break;
      }

      const update = await refreshImportedDeck(deck);
      if (update) imported += 1;

      const commander = update?.commander || deck.commander;
      if (commander?.trim()) {
        const stats = await prefetchEdhrecStats(commander);
        if (stats) edhrec += 1;
      }
    }

    await refresh();
    return { imported, edhrec, rateLimited, skipped: false };
  }, [decks, refresh, refreshImportedDeck]);

  const getDeckCommanderOptions = useCallback(async (deck: ProfileDeck): Promise<CommanderMetadataOption[]> => {
    const currentCommander = { name: deck.commander, imageUrl: deck.commander_image };
    const storedOptions = getCommanderOptions(deck);
    if (storedOptions.length > 0) {
      const repairedOptions = await repairCommanderOptions(storedOptions);
      if (JSON.stringify(repairedOptions) !== JSON.stringify(storedOptions)) {
        await supabase
          .from('decks')
          .update({ commander_options: repairedOptions })
          .eq('id', deck.id);
      }
      return filterSelectableCommanderOptions(uniqueCommanderOptions([currentCommander, ...repairedOptions]));
    }

    if (deck.source_type !== 'manual' && deck.source_url) {
      try {
        const { data, status } = await apiPost<ImportedDeckPreview & { error?: string }>(
          '/api/deck-import',
          { url: deck.source_url },
        );
        if (status === 200 && data?.commanderOptions?.length) {
          const repairedOptions = await repairCommanderOptions(data.commanderOptions);
          return filterSelectableCommanderOptions(uniqueCommanderOptions([currentCommander, ...repairedOptions]));
        }
      } catch {
        // Fall back to current commander only.
      }
    }

    return filterSelectableCommanderOptions([currentCommander]);
  }, []);

  return {
    decks,
    winRates,
    performance,
    loading,
    refresh,
    deleteDeck,
    toggleDeckFavorite,
    setDeckArchived,
    saveImportedDeck,
    saveManualDeck,
    refreshImportedDeck,
    refreshAllDecks,
    updateDeck,
    linkDeckSource,
    saveArchidektUserDecks,
    syncArchidektUserDecks,
    getDeckCommanderOptions,
  };
}

async function repairCommanderOptions(
  options: CommanderMetadataOption[],
): Promise<CommanderMetadataOption[]> {
  return repairImportedCommanderOptions(options, async (name) => {
    const arts = await fetchCommanderArtOptions(name);
    return arts[0]?.imageUrl?.trim() || null;
  });
}

async function repairLoadedDeckArtwork(loadedDecks: ProfileDeck[]): Promise<ProfileDeck[]> {
  const repairedDecks: ProfileDeck[] = [];

  for (const deck of loadedDecks) {
    const storedOptions = getCommanderOptions(deck);
    const repairedOptions = await repairCommanderOptions(storedOptions);
    const optionsChanged = JSON.stringify(repairedOptions) !== JSON.stringify(storedOptions);
    const oldSelection = resolveSelectedCommanderOption(
      storedOptions,
      deck.commander,
      deck.commander_image,
    );
    const repairedSelection = resolveSelectedCommanderOption(
      repairedOptions,
      deck.commander,
      deck.commander_image,
    );

    let commanderImage = deck.commander_image?.trim() || null;
    if (
      repairedSelection?.imageUrl &&
      (!commanderImage || (optionsChanged && commanderImage === (oldSelection?.imageUrl || null)))
    ) {
      commanderImage = repairedSelection.imageUrl;
    }

    if (!commanderImage && deck.commander.trim().length >= 2) {
      const arts = await fetchCommanderArtOptions(deck.commander);
      commanderImage = arts[0]?.imageUrl?.trim() || null;
    }

    const imageChanged = commanderImage !== (deck.commander_image?.trim() || null);
    if (!optionsChanged && !imageChanged) {
      repairedDecks.push(deck);
      continue;
    }

    const payload = {
      commander_image: commanderImage,
      commander_options: repairedOptions.length > 0 ? repairedOptions : deck.commander_options,
    };
    const { error } = await supabase.from('decks').update(payload).eq('id', deck.id);
    repairedDecks.push(error ? deck : { ...deck, ...payload });
  }

  return repairedDecks;
}
