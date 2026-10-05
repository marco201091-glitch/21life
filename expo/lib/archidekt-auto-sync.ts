import { apiPost } from '@/lib/api';
import { fetchCommanderArtOptions } from '@/lib/commander-arts';
import {
  deckDataToColorFields,
  getDefaultImportedCommanderOption,
  repairImportedCommanderOptions,
  resolveImportedDeckCommanderImage,
  type ImportedDeckPreview,
} from '@/lib/deck-importers';
import { supabase } from '@/lib/supabase';

const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const syncsInFlight = new Map<string, {
  force: boolean;
  promise: Promise<ArchidektSyncResult>;
}>();
const requestProcessorsInFlight = new Map<string, Promise<void>>();
const requestProcessorReruns = new Set<string>();

export type ArchidektSyncResult = {
  inserted: number;
  updated: number;
  skipped: number;
};

type ImportPayload = {
  decks?: Array<ImportedDeckPreview & { warning?: string; error?: string }>;
};

export async function syncArchidektUserDecks(
  username: string,
): Promise<ArchidektSyncResult> {
  const cleanUsername = username.trim();
  if (!cleanUsername) throw new Error('Archidekt username is required');

  const { data, error, status } = await apiPost<ImportPayload>(
    '/api/archidekt-user-decks',
    { username: cleanUsername },
  );
  if (status !== 200) throw new Error(error || 'Archidekt sync failed');

  const imported = data?.decks ?? [];
  const candidates = imported.filter((deck) =>
    deck.sourceType === 'archidekt'
    && Boolean(deck.sourceUrl)
    && !deck.warning
    && !deck.error
    && Boolean(deck.commander?.trim()),
  );
  const rows: Array<Record<string, unknown>> = [];

  for (const deck of candidates) {
    const commanderOptions = await repairImportedCommanderOptions(
      deck.commanderOptions || [],
      async (name) => {
        const arts = await fetchCommanderArtOptions(name);
        return arts[0]?.imageUrl?.trim() || null;
      },
    );
    const repairedDeck = { ...deck, commanderOptions };
    const commander = getDefaultImportedCommanderOption(repairedDeck);
    let commanderImage = resolveImportedDeckCommanderImage(commander, repairedDeck);
    if (!commanderImage) {
      const arts = await fetchCommanderArtOptions(commander.name);
      commanderImage = arts[0]?.imageUrl?.trim() || null;
    }
    rows.push({
      name: deck.name,
      commander: commander.name,
      commander_image: commanderImage,
      source_url: deck.sourceUrl,
      source_type: 'archidekt',
      bracket: deck.bracket,
      ...deckDataToColorFields({
        commanderOptions,
        colorIdentity: deck.colorIdentity || [],
      }),
    });
  }

  // An empty payload still updates archidekt_last_sync_at, avoiding a retry
  // loop for valid accounts that currently have no public Commander decks.
  const { data: result, error: syncError } = await supabase.rpc('sync_archidekt_decks', {
    p_decks: rows,
  });
  if (syncError) throw syncError;

  const counts = (result || {}) as { inserted?: number; updated?: number };
  return {
    inserted: counts.inserted ?? 0,
    updated: counts.updated ?? 0,
    skipped: imported.length - candidates.length,
  };
}

export function runArchidektAutoSync(
  userId: string,
  options: { force?: boolean } = {},
): Promise<ArchidektSyncResult> {
  const existing = syncsInFlight.get(userId);
  if (existing) {
    if (options.force && !existing.force) {
      return existing.promise.then(() => runArchidektAutoSync(userId, options));
    }
    return existing.promise;
  }

  const task = (async () => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('archidekt_username, archidekt_auto_import, archidekt_last_sync_at')
      .eq('id', userId)
      .single();
    if (error) throw error;

    const username = profile.archidekt_username?.trim();
    if (!profile.archidekt_auto_import || !username) {
      return { inserted: 0, updated: 0, skipped: 0 };
    }

    const lastSyncAt = profile.archidekt_last_sync_at
      ? new Date(profile.archidekt_last_sync_at).getTime()
      : 0;
    if (!options.force && Number.isFinite(lastSyncAt) && Date.now() - lastSyncAt < AUTO_SYNC_INTERVAL_MS) {
      return { inserted: 0, updated: 0, skipped: 0 };
    }

    return syncArchidektUserDecks(username);
  })().finally(() => {
    syncsInFlight.delete(userId);
  });

  syncsInFlight.set(userId, { force: Boolean(options.force), promise: task });
  return task;
}

/** Processes requests as their target user so the sync RPC stays user-scoped. */
export function processArchidektSyncRequests(userId: string): Promise<void> {
  const existing = requestProcessorsInFlight.get(userId);
  if (existing) {
    requestProcessorReruns.add(userId);
    return existing;
  }

  const task = (async () => {
    do {
      requestProcessorReruns.delete(userId);
      const { data: requests, error: requestError } = await supabase
        .from('archidekt_sync_requests')
        .select('id')
        .eq('user_id', userId);
      if (requestError) throw requestError;
      if (!requests?.length) continue;

      await runArchidektAutoSync(userId, { force: true });
      const { error: deleteError } = await supabase
        .from('archidekt_sync_requests')
        .delete()
        .eq('user_id', userId)
        .in('id', requests.map((request) => request.id));
      if (deleteError) throw deleteError;
    } while (requestProcessorReruns.has(userId));
  })().finally(() => {
    requestProcessorsInFlight.delete(userId);
    requestProcessorReruns.delete(userId);
  });

  requestProcessorsInFlight.set(userId, task);
  return task;
}
