import {
  isScryfallError,
  resolveCommanderCmcFromCard,
  type ScryfallCardWithCmc,
} from '@/lib/commander-cmc';

const SCRYFALL_HEADERS = {
  Accept: 'application/json',
  'User-Agent': '21Life/9.1 (https://app.21life.win)',
};

const commanderCmcCache = new Map<string, number | null>();

function sanitizeCommanderQuery(query: string) {
  return query.trim().replace(/"/g, '');
}

async function fetchScryfallJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const response = await fetch(url, { headers: SCRYFALL_HEADERS, signal });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

async function fetchNamedCard(queryText: string, mode: 'exact' | 'fuzzy', signal?: AbortSignal) {
  const card = await fetchScryfallJson<ScryfallCardWithCmc>(
    `https://api.scryfall.com/cards/named?${mode}=${encodeURIComponent(queryText)}`,
    signal,
  );
  if (!card || isScryfallError(card)) return null;
  return card;
}

export async function lookupCommanderCmcInBrowser(name: string, signal?: AbortSignal) {
  const queryText = sanitizeCommanderQuery(name);
  if (!queryText) return null;

  const cacheKey = queryText.toLowerCase();
  if (commanderCmcCache.has(cacheKey)) {
    return commanderCmcCache.get(cacheKey) ?? null;
  }

  let card = await fetchNamedCard(queryText, 'exact', signal);
  if (!card) {
    card = await fetchNamedCard(queryText, 'fuzzy', signal);
  }

  if (!card) {
    const commanderSearch = await fetchScryfallJson<{ data?: ScryfallCardWithCmc[] }>(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`is:commander name:"${queryText}"`)}&unique=cards`,
      signal,
    );
    card = commanderSearch?.data?.[0] || null;
  }

  if (!card) {
    const broadSearch = await fetchScryfallJson<{ data?: ScryfallCardWithCmc[] }>(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(queryText)}&unique=cards`,
      signal,
    );
    card = broadSearch?.data?.[0] || null;
  }

  const cmc = resolveCommanderCmcFromCard(card, queryText);
  commanderCmcCache.set(cacheKey, cmc);
  return cmc;
}

export function primeCommanderCmcCache(entries: Record<string, number | null>) {
  Object.entries(entries).forEach(([name, value]) => {
    commanderCmcCache.set(sanitizeCommanderQuery(name).toLowerCase(), value);
  });
}
