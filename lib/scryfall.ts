import { isScryfallError, resolveCommanderCmcFromCard } from '@/lib/commander-cmc';
import { buildCommanderNameSearchClause } from '@/lib/commander-search-aliases';
import { unstable_cache } from 'next/cache';

export { extractCardCmc, resolveCommanderCmcFromCard } from '@/lib/commander-cmc';

export interface ScryfallCard {
  id: string;
  name: string;
  cmc?: number;
  color_identity?: string[];
  oracle_text?: string;
  keywords?: string[];
  image_uris?: {
    art_crop?: string;
    normal?: string;
    large?: string;
  };
  card_faces?: Array<{
    name: string;
    cmc?: number;
    mana_cost?: string;
    image_uris?: {
      art_crop?: string;
      normal?: string;
      large?: string;
    };
  }>;
  mana_cost?: string;
  object?: string;
  type_line?: string;
}

interface ScryfallSearchResponse {
  data: ScryfallCard[];
  has_more?: boolean;
  total_cards?: number;
}

export interface CommanderSearchResult {
  id: string;
  name: string;
  imageUrl: string | null;
  typeLine: string;
  colorIdentity: string[];
  oracleText: string;
  keywords: string[];
}

export interface CommanderArtOption {
  id: string;
  name: string;
  imageUrl: string;
  setName: string;
  collectorNumber: string;
  releasedAt: string | null;
}

const SCRYFALL_HEADERS = {
  Accept: 'application/json',
  'User-Agent': '21Life/9.1 (https://app.21life.win)',
};

const SCRYFALL_MAX_RETRIES = 2;
const SCRYFALL_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const ART_OPTIONS_CACHE_MS = 365 * 24 * 60 * 60 * 1_000;
const ART_OPTIONS_EMPTY_CACHE_MS = 60 * 60 * 1_000;
const ART_OPTIONS_CACHE_LIMIT = 500;
const artOptionsCache = new Map<string, { expiresAt: number; options: CommanderArtOption[] }>();
const artOptionsInflight = new Map<string, Promise<CommanderArtOption[]>>();

function cacheArtOptions(key: string, options: CommanderArtOption[]) {
  if (artOptionsCache.size >= ART_OPTIONS_CACHE_LIMIT) {
    const oldestKey = artOptionsCache.keys().next().value;
    if (oldestKey) artOptionsCache.delete(oldestKey);
  }
  artOptionsCache.set(key, {
    expiresAt: Date.now() + (options.length > 0 ? ART_OPTIONS_CACHE_MS : ART_OPTIONS_EMPTY_CACHE_MS),
    options,
  });
}

function normalizeColorIdentity(value: unknown): string[] {
  const colors = Array.isArray(value) ? value : [];
  return Array.from(new Set(colors
    .map((color) => String(color).trim().toUpperCase())
    .filter((color) => ['W', 'U', 'B', 'R', 'G'].includes(color))));
}

function buildDisplayUrl(scryfallId: string): string {
  return `https://cards.scryfall.io/display/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.webp`;
}

export function extractScryfallImage(card: ScryfallCard): string | null {
  if (card.image_uris?.art_crop) return card.image_uris.art_crop;
  if (card.card_faces?.[0]?.image_uris?.art_crop) return card.card_faces[0].image_uris.art_crop;
  if (card.id) return buildDisplayUrl(card.id);
  if (card.image_uris?.large) return card.image_uris.large;
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris?.large) return card.card_faces[0].image_uris.large;
  if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal;
  return null;
}

function extractScryfallImageForName(card: ScryfallCard, preferredName: string): string | null {
  const normalizedName = preferredName.toLowerCase();
  const matchingFace = card.card_faces?.find((face) => face.name.toLowerCase() === normalizedName);
  if (matchingFace?.image_uris?.art_crop) return matchingFace.image_uris.art_crop;
  if (matchingFace?.image_uris?.large) return matchingFace.image_uris.large;
  if (matchingFace?.image_uris?.normal) return matchingFace.image_uris.normal;
  return extractScryfallImage(card);
}

function sanitizeCommanderQuery(query: string): string {
  return query.trim().replace(/"/g, '');
}

async function fetchScryfallJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt <= SCRYFALL_MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, { headers: SCRYFALL_HEADERS });
    if (response.status === 404) return null;
    if (response.ok) return response.json() as Promise<T>;

    if (!SCRYFALL_RETRYABLE_STATUSES.has(response.status) || attempt === SCRYFALL_MAX_RETRIES) {
      throw new Error(`Scryfall request failed (${response.status})`);
    }

    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1_000
      : 250 * (2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  throw new Error('Scryfall request retry loop exhausted');
}

function isResolvedScryfallCard(card: ScryfallCard | null): card is ScryfallCard {
  return Boolean(card && !isScryfallError(card));
}

const fetchCardByNamePersistent = unstable_cache(
  async (queryText: string) => {
    const exact = await fetchScryfallJson<ScryfallCard>(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(queryText)}`,
    );
    if (isResolvedScryfallCard(exact)) return exact;

    const fuzzy = await fetchScryfallJson<ScryfallCard>(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(queryText)}`,
    );
    return isResolvedScryfallCard(fuzzy) ? fuzzy : null;
  },
  ['scryfall-card-by-name-v7'],
  { revalidate: 30 * 24 * 60 * 60 },
);

export async function fetchCardByName(name: string): Promise<ScryfallCard | null> {
  const queryText = sanitizeCommanderQuery(name);
  if (!queryText) return null;
  return fetchCardByNamePersistent(queryText);
}

const fetchCommanderCardPersistent = unstable_cache(
  async (queryText: string) => {
    try {
      const named = await fetchCardByName(queryText);
      if (named) return named;

      const commanderSearch = await fetchScryfallJson<ScryfallSearchResponse>(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`is:commander name:"${queryText}"`)}&unique=cards`,
      );
      const commanderCard = commanderSearch?.data?.[0];
      if (commanderCard) return commanderCard;

      const broadSearch = await fetchScryfallJson<ScryfallSearchResponse>(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(queryText)}&unique=cards`,
      );
      return broadSearch?.data?.[0] || null;
    } catch (error) {
      console.error('fetchCommanderCard error for', queryText, error);
      return null;
    }
  },
  ['scryfall-commander-card-v7'],
  { revalidate: 30 * 24 * 60 * 60 },
);

export async function fetchCommanderCard(commanderName: string): Promise<ScryfallCard | null> {
  const queryText = sanitizeCommanderQuery(commanderName);
  if (!queryText || queryText === 'Unknown Commander') return null;
  return fetchCommanderCardPersistent(queryText);
}

export async function fetchCommanderCmc(commanderName: string): Promise<number | null> {
  const queryText = sanitizeCommanderQuery(commanderName);
  if (!queryText) return null;

  const card = await fetchCommanderCard(queryText);
  return resolveCommanderCmcFromCard(card, queryText);
}

export async function fetchCommanderImage(commanderName: string): Promise<string | null> {
  const queryText = sanitizeCommanderQuery(commanderName);
  if (!queryText || queryText === 'Unknown Commander') return null;

  try {
    const card = await fetchCommanderCard(queryText);
    return card ? extractScryfallImageForName(card, queryText) : null;
  } catch (error) {
    console.error('fetchCommanderImage error for', commanderName, error);
    return null;
  }
}

export type CommanderPartnerMode =
  | 'partner'
  | 'background'
  | 'background-owner'
  | 'friends'
  | 'father-son'
  | 'survivors'
  | 'character-select'
  | 'doctor'
  | 'doctor-companion'
  | `partner-with:${string}`
  | `partner-family:${string}`;

function partnerModeQuery(mode: CommanderPartnerMode | null) {
  if (mode === 'background') return 'is:commander t:background';
  if (mode === 'background-owner') return 'is:commander o:"choose a background"';
  if (mode === 'friends') return 'is:commander o:"friends forever"';
  if (mode === 'father-son') return 'is:commander o:"partner—father & son"';
  if (mode === 'survivors') return 'is:commander o:"partner—survivors"';
  if (mode === 'character-select') return 'is:commander o:"partner—character select"';
  if (mode === 'doctor') return 'is:commander t:doctor t:"time lord"';
  if (mode === 'doctor-companion') return 'is:commander o:"doctor\'s companion"';
  if (mode?.startsWith('partner-with:')) {
    const partnerName = sanitizeCommanderQuery(mode.slice('partner-with:'.length));
    return partnerName ? `is:commander !"${partnerName}"` : 'is:commander o:"partner with"';
  }
  if (mode?.startsWith('partner-family:')) {
    const familyName = sanitizeCommanderQuery(mode.slice('partner-family:'.length));
    return familyName ? `is:commander o:"partner—${familyName}"` : 'is:commander';
  }
  if (mode === 'partner') return 'is:commander o:partner -o:"partner with" -o:"partner—"';
  return 'is:commander';
}

function toCommanderSearchResult(card: ScryfallCard): CommanderSearchResult {
  return {
    id: card.id,
    name: card.name,
    imageUrl: extractScryfallImage(card),
    typeLine: card.type_line || '',
    colorIdentity: normalizeColorIdentity(card.color_identity),
    oracleText: card.oracle_text || '',
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
  };
}

const searchCommandersPersistent = unstable_cache(
  async (queryText: string, partnerMode: CommanderPartnerMode | null) => {
    const baseQuery = partnerModeQuery(partnerMode);
    const search = await fetchScryfallJson<ScryfallSearchResponse>(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${baseQuery} ${buildCommanderNameSearchClause(queryText)}`)}&order=edhrec&unique=cards`
    );
    return (search?.data || []).slice(0, 20).map(toCommanderSearchResult);
  },
  ['scryfall-commander-search-v7'],
  { revalidate: 7 * 24 * 60 * 60 },
);

export async function searchCommanders(query: string, partnerMode: CommanderPartnerMode | null = null): Promise<CommanderSearchResult[]> {
  const queryText = sanitizeCommanderQuery(query);
  if (queryText.length < 2) return [];

  try {
    return await searchCommandersPersistent(queryText, partnerMode);
  } catch (error) {
    console.error('searchCommanders error for', query, error);
    throw error;
  }
}

const fetchCommanderArtOptionsPersistent = unstable_cache(
  async (queryText: string) => {
    const search = await fetchScryfallJson<ScryfallSearchResponse>(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${queryText}"`)}&unique=art&order=released`
    );

    return (search?.data || [])
      .map((card) => {
        const imageUrl = extractScryfallImageForName(card, queryText);
        if (!imageUrl) return null;

        return {
          id: card.id,
          name: card.name,
          imageUrl,
          setName: (card as ScryfallCard & { set_name?: string }).set_name || '',
          collectorNumber: (card as ScryfallCard & { collector_number?: string }).collector_number || '',
          releasedAt: (card as ScryfallCard & { released_at?: string }).released_at || null,
        };
      })
      .filter((option): option is CommanderArtOption => Boolean(option));
  },
  ['scryfall-commander-arts-v7'],
  { revalidate: 365 * 24 * 60 * 60 },
);

export async function fetchCommanderArtOptions(commanderName: string): Promise<CommanderArtOption[]> {
  const queryText = sanitizeCommanderQuery(commanderName);
  if (queryText.length < 2) return [];
  const cacheKey = queryText.toLocaleLowerCase();
  const cached = artOptionsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.options;

  const inflight = artOptionsInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const options = await fetchCommanderArtOptionsPersistent(queryText);
    cacheArtOptions(cacheKey, options);
    return options;
  })();

  artOptionsInflight.set(cacheKey, request);
  try {
    return await request;
  } catch (error) {
    console.error('fetchCommanderArtOptions error for', commanderName, error);
    throw error;
  } finally {
    artOptionsInflight.delete(cacheKey);
  }
}
