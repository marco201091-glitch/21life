import 'server-only';
import { fetchDeckFromSource } from '@/lib/deck-importers-server';
import { buildCanonicalDeckSourceUrl, deckDataToColorFields, getDefaultImportedCommanderOption, resolveImportedDeckCommanderImage } from '@/lib/deck-importers';

type DeckSummary = { id: number; private?: boolean };
export async function fetchArchidektSyncDecks(username: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Archidekt import timed out.')); }, 90_000);
  });
  const importDecks = async () => {
    const url = new URL('https://archidekt.com/api/decks/v3/');
    url.searchParams.set('ownerUsername', username.trim());
    url.searchParams.set('deckFormat', '3');
    url.searchParams.set('orderBy', '-updatedAt');
    url.searchParams.set('pageSize', '80');
    const summaries: DeckSummary[] = [];
    const seen = new Set<number>();
    let page = 1;
    while (true) {
      url.searchParams.set('page', String(page));
      const response = await fetch(url.toString(), {
        cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': '21Life/9.0 (https://app.phyrexianarena.dpdns.org)' },
      });
      if (!response.ok) throw new Error(`Archidekt profile request failed (${response.status}).`);
      const payload = await response.json();
      if (!Array.isArray(payload.results)) throw new Error('Invalid Archidekt profile response.');
      for (const deck of payload.results as DeckSummary[]) {
        if (Number.isSafeInteger(deck?.id) && deck.id > 0 && deck.private !== true && !seen.has(deck.id)) {
          seen.add(deck.id); summaries.push(deck);
        }
      }
      // Reject excessive responses rather than silently reporting a truncated catalog as complete.
      if (summaries.length > 5000 || page > 100) throw new Error('Archidekt catalog is too large.');
      if (!payload.next) break;
      const nextPage = Number(new URL(payload.next, url).searchParams.get('page'));
      if (!Number.isSafeInteger(nextPage) || nextPage !== page + 1) throw new Error('Invalid Archidekt pagination.');
      page = nextPage;
    }
    const decks: Array<Record<string, unknown>> = [];
    let skipped = 0; let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, summaries.length) }, async () => {
      while (next < summaries.length) {
        if (controller.signal.aborted) throw new Error('Archidekt import timed out.');
        const summary = summaries[next++];
        try {
          const data = await fetchDeckFromSource('archidekt', String(summary.id), { fresh: true, signal: controller.signal });
          const commander = getDefaultImportedCommanderOption(data);
          if (!commander.name?.trim() || commander.name === 'Unknown Commander') throw new Error('Missing commander.');
          decks.push({
            name: data.name, commander: commander.name,
            commander_image: resolveImportedDeckCommanderImage(commander, data),
            source_url: buildCanonicalDeckSourceUrl('archidekt', String(summary.id)),
            source_type: 'archidekt', bracket: data.bracket, ...deckDataToColorFields(data),
          });
        } catch {
          if (controller.signal.aborted) throw new Error('Archidekt import timed out.');
          skipped++;
        }
      }
    }));
    if (summaries.length > 0 && decks.length === 0) throw new Error('No Archidekt decks could be imported.');
    return { decks, skipped };
  };
  try { return await Promise.race([importDecks(), deadline]); }
  finally { clearTimeout(timer!); controller.abort(); }
}
