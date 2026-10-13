import { resolveArchidektFaceIndex } from '@/lib/archidekt-commander-images';
import { finalizeDeckColorIdentity } from '@/lib/deck-metadata';
import {
  type DeckData,
  type DeckSource,
} from '@/lib/deck-importers';

const ARCHIDEKT_USER_AGENT = process.env.ARCHIDEKT_USER_AGENT
  || '21Life/9.0 (https://app.phyrexianarena.dpdns.org)';
import {
  buildMoxfieldApiUrls,
  buildMoxfieldHeaders,
  MOXFIELD_USER_AGENT,
  moxfieldHttpsGet,
} from '@/lib/moxfield-http';
import { fetchCommanderImage } from '@/lib/scryfall';
import { unstable_cache } from 'next/cache';

interface ArchidektOracleFace {
  name?: string;
  uid?: string;
}

interface ArchidektCardData {
  uid?: string;
  displayName?: string | null;
  name?: string | null;
  collectorNumber?: string;
  edition?: {
    editioncode?: string;
  } | null;
  oracleCard?: {
    name?: string;
    colors?: string[];
    colorIdentity?: string[];
    color_identity?: string[];
    types?: string[];
    subTypes?: string[];
    layout?: string;
    faces?: ArchidektOracleFace[];
    cmc?: number;
    [key: string]: unknown;
  } | null;
  categories?: string[];
}

interface ArchidektCard {
  card: ArchidektCardData;
  isCommander?: boolean;
  categories?: string[];
  flippedDefault?: boolean | null;
  companion?: boolean | null;
}

function archidektCardCategories(card: ArchidektCard) {
  return [
    ...(card.categories || []),
    ...(card.card?.categories || []),
  ];
}

function isArchidektCommanderCard(card: ArchidektCard) {
  return (
    card.isCommander === true ||
    archidektCardCategories(card).some((cat) => typeof cat === 'string' && cat.toLowerCase().includes('commander'))
  );
}

function expandCommanderNames(names: string[]) {
  const expanded = names.flatMap((name) => {
    const splitNames = name.split('//').map((part) => part.trim()).filter(Boolean);
    return splitNames.length > 1 ? splitNames : [name];
  });

  return Array.from(new Set(expanded));
}

function normalizeBracket(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') {
    const bracket = String(value).trim();
    return bracket || null;
  }
  if (typeof value === 'object') {
    const candidate = value as { name?: unknown; label?: unknown; bracket?: unknown; id?: unknown };
    const bracket = candidate.name ?? candidate.label ?? candidate.bracket ?? candidate.id;
    return normalizeBracket(bracket);
  }
  return null;
}

function normalizeColorIdentity(value: unknown): string[] {
  const colors = Array.isArray(value) ? value : [];
  const colorMap: Record<string, string> = {
    WHITE: 'W',
    BLUE: 'U',
    BLACK: 'B',
    RED: 'R',
    GREEN: 'G',
  };

  return Array.from(new Set(colors
    .map((color) => String(color).trim().toUpperCase())
    .map((color) => colorMap[color] || color)
    .filter((color) => ['W', 'U', 'B', 'R', 'G'].includes(color))));
}

function mergeColorIdentities(...values: unknown[]) {
  return normalizeColorIdentity(values.flatMap((value) => Array.isArray(value) ? value : []));
}

function archidektCardColorIdentity(card: ArchidektCard) {
  return mergeColorIdentities(
    card.card?.oracleCard?.colorIdentity,
    card.card?.oracleCard?.color_identity,
    card.card?.oracleCard?.colors
  );
}

function archidektCardNames(card: ArchidektCard) {
  return [
    card.card?.oracleCard?.name,
    card.card?.displayName,
    card.card?.name,
    ...(card.card?.oracleCard?.faces || []).map((face) => face.name),
  ].filter((name): name is string => Boolean(name));
}

function findArchidektCommanderCardForName(cards: ArchidektCard[], commanderName: string) {
  const normalized = commanderName.toLowerCase();
  return cards.find((card) => archidektCardNames(card).some((name) =>
    name.toLowerCase() === normalized ||
    name.split('//').map((part) => part.trim().toLowerCase()).includes(normalized)
  ));
}

function isArchidektBackgroundCard(card: ArchidektCard) {
  const subTypes = card.card?.oracleCard?.subTypes || [];
  if (subTypes.some((type) => String(type).toLowerCase() === 'background')) {
    return true;
  }

  return archidektCardCategories(card).some((category) =>
    typeof category === 'string' && category.toLowerCase().includes('background')
  );
}

function canUseArchidektFaceCrop(
  faces: ArchidektOracleFace[],
  faceIndex: number,
) {
  if (faces.length <= 1) return true;
  if (faces[faceIndex]?.uid) return true;
  return faceIndex === 0;
}

function buildArchidektCardImageUrl(cardData: ArchidektCardData, faceIndex = 0) {
  const editionCode = cardData.edition?.editioncode?.trim().toLowerCase();
  const faces = cardData.oracleCard?.faces || [];
  if (!canUseArchidektFaceCrop(faces, faceIndex)) return null;

  const faceUid = faces[faceIndex]?.uid;
  const uid = faceUid || cardData.uid;

  if (!editionCode || !uid) return null;
  return `https://storage.googleapis.com/archidekt-card-images/${editionCode}/${uid}_art_crop.jpg`;
}

function archidektCardImageUrl(card: ArchidektCard, commanderName?: string) {
  const cardData = card.card;
  if (!cardData) return null;

  const faces = cardData.oracleCard?.faces || [];
  if (commanderName) {
    const faceIndex = resolveArchidektFaceIndex(archidektCardNames(card), faces, commanderName);
    return buildArchidektCardImageUrl(cardData, faceIndex);
  }

  const layout = String(cardData.oracleCard?.layout || '').toLowerCase();
  const usesAlternateFace = Boolean(card.flippedDefault) && faces.length > 1;
  const faceIndex = usesAlternateFace || layout.includes('double') || layout === 'transform' || layout === 'modal_dfc'
    ? (card.flippedDefault ? 1 : 0)
    : 0;

  return buildArchidektCardImageUrl(cardData, faceIndex);
}

async function fetchArchidektPrintingImage(card: ArchidektCard, commanderName: string, signal?: AbortSignal): Promise<string | null> {
  const cardData = card.card;
  const faces = cardData?.oracleCard?.faces || [];
  const faceIndex = resolveArchidektFaceIndex(
    archidektCardNames(card),
    faces,
    commanderName,
  );

  const directImage = archidektCardImageUrl(card, commanderName);
  if (directImage) return directImage;

  const setCode = cardData?.edition?.editioncode?.trim().toLowerCase();
  const collectorNumber = cardData?.collectorNumber?.trim();
  if (!setCode || !collectorNumber) return null;

  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(collectorNumber)}`,
      { signal, headers: { Accept: 'application/json', 'User-Agent': '21Life/9.0 (https://app.phyrexianarena.dpdns.org)' } },
    );
    if (!response.ok) return null;

    const payload = await response.json() as {
      image_uris?: { art_crop?: string; large?: string; normal?: string };
      card_faces?: Array<{ image_uris?: { art_crop?: string; large?: string; normal?: string } }>;
    };

    const faceImages = payload.card_faces?.[faceIndex]?.image_uris;

    return faceImages?.art_crop
      || payload.image_uris?.art_crop
      || faceImages?.large
      || payload.image_uris?.large
      || faceImages?.normal
      || payload.image_uris?.normal
      || null;
  } catch {
    return null;
  }
}

async function resolveArchidektCommanderImage(
  card: ArchidektCard | undefined,
  commanderName: string,
  signal?: AbortSignal,
) {
  if (card) {
    const printingImage = await fetchArchidektPrintingImage(card, commanderName, signal);
    if (printingImage) return printingImage;
  }

  return fetchCommanderImage(commanderName);
}

function archidektDeckFeaturedImage(data: Record<string, unknown>) {
  const customFeatured = typeof data.customFeatured === 'string' ? data.customFeatured.trim() : '';
  if (customFeatured) return customFeatured;

  const featured = typeof data.featured === 'string' ? data.featured.trim() : '';
  return featured || null;
}

function extractBracketFromText(text: string): string | null {
  const patterns = [
    /Est(?:imated)?\s+Bracket:\s*[^()]*\((\d+)\)/i,
    /\b(?:Upgraded|Core|Exhibition|Optimized)\s*\((\d+)\)/i,
    /\bBracket:\s*[^()]*\((\d+)\)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function extractEstimatedBracketFromHtml(html: string): string | null {
  const rawMatch = extractBracketFromText(html);
  if (rawMatch) return rawMatch;

  const compactText = html
    .replace(/<!--\s*-->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');

  return extractBracketFromText(compactText);
}

async function fetchEstimatedArchidektBracket(deckId: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(`https://archidekt.com/decks/${deckId}/`, {
      signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': ARCHIDEKT_USER_AGENT,
      },
    });

    if (!response.ok) return null;
    return extractEstimatedBracketFromHtml(await response.text());
  } catch {
    return null;
  }
}

function buildArchidektHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent': ARCHIDEKT_USER_AGENT,
  };
}

interface MoxfieldCardEntry {
  quantity?: number;
  card?: {
    name?: string;
    color_identity?: string[];
    colors?: string[];
    type_line?: string;
    scryfall_id?: string;
  };
}

interface MoxfieldDeckResponse {
  name?: string;
  format?: string;
  visibility?: string;
  publicId?: string;
  bracket?: unknown;
  bracketType?: unknown;
  commanders?: Record<string, MoxfieldCardEntry>;
  companions?: Record<string, MoxfieldCardEntry>;
}

function normalizeMoxfieldCardEntry(entry: unknown): MoxfieldCardEntry | null {
  if (!entry || typeof entry !== 'object') return null;

  const record = entry as Record<string, unknown>;
  if (record.card && typeof record.card === 'object') {
    return record as MoxfieldCardEntry;
  }

  if (typeof record.name === 'string') {
    return {
      quantity: typeof record.quantity === 'number' ? record.quantity : 1,
      card: record as MoxfieldCardEntry['card'],
    };
  }

  return null;
}

function moxfieldBoardToRecord(board: unknown): Record<string, MoxfieldCardEntry> {
  if (!board || typeof board !== 'object') return {};

  const boardRecord = board as Record<string, unknown>;
  if (Array.isArray(board)) {
    return board.reduce<Record<string, MoxfieldCardEntry>>((result, entry, index) => {
      const normalized = normalizeMoxfieldCardEntry(entry);
      if (normalized) {
        const name = normalized.card?.name || `card-${index}`;
        result[name] = normalized;
      }
      return result;
    }, {});
  }

  const cardsSource = boardRecord.cards && typeof boardRecord.cards === 'object'
    ? boardRecord.cards
    : boardRecord;

  const result: Record<string, MoxfieldCardEntry> = {};
  for (const [key, entry] of Object.entries(cardsSource as Record<string, unknown>)) {
    const normalized = normalizeMoxfieldCardEntry(entry);
    if (normalized) result[key] = normalized;
  }

  return result;
}

function normalizeMoxfieldDeckResponse(raw: unknown): MoxfieldDeckResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid Moxfield deck response');
  }

  const payload = raw as Record<string, unknown>;
  const data = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : payload;

  const boardSource = data.boards && typeof data.boards === 'object'
    ? data.boards
    : data;

  const commanders = moxfieldBoardToRecord(
    (boardSource as Record<string, unknown>).commanders ?? payload.commanders
  );
  const companions = moxfieldBoardToRecord(
    (boardSource as Record<string, unknown>).companions ?? payload.companions
  );

  return {
    name: String(data.name ?? payload.name ?? ''),
    format: String(data.format ?? payload.format ?? ''),
    visibility: String(data.visibility ?? payload.visibility ?? ''),
    publicId: String(data.publicId ?? payload.publicId ?? ''),
    bracket: data.bracket ?? payload.bracket,
    bracketType: data.bracketType ?? payload.bracketType,
    commanders,
    companions,
  };
}

function moxfieldFetchError(status: number, body: string): string {
  if (status === 403) {
    return 'Moxfield blocked the import request (403). Make sure the deck is public and try again.';
  }
  if (status === 404) {
    return 'Moxfield deck not found (404). Check that the URL is correct.';
  }
  const detail = body && !body.startsWith('<!DOCTYPE') ? `: ${body.slice(0, 160)}` : '';
  return `Failed to fetch deck from Moxfield (${status}${detail})`;
}

async function tryFetchMoxfieldDeck(url: string, headers: Record<string, string>) {
  const response = await moxfieldHttpsGet(url, headers);

  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false as const,
      status: response.status,
      error: moxfieldFetchError(response.status, response.body),
    };
  }

  const raw = JSON.parse(response.body) as unknown;
  return {
    ok: true as const,
    data: normalizeMoxfieldDeckResponse(raw),
  };
}

function moxfieldEntryColorIdentity(entry: MoxfieldCardEntry | undefined) {
  if (!entry?.card) return [];
  return mergeColorIdentities(entry.card.color_identity, entry.card.colors);
}

function isMoxfieldBackgroundCard(entry: MoxfieldCardEntry) {
  const typeLine = entry.card?.type_line?.toLowerCase() || '';
  return typeLine.includes('background');
}

async function fetchMoxfieldDeckJson(publicId: string): Promise<MoxfieldDeckResponse> {
  const headers = buildMoxfieldHeaders();
  let lastError = 'Failed to fetch deck from Moxfield';

  for (const url of buildMoxfieldApiUrls(publicId)) {
    try {
      const result = await tryFetchMoxfieldDeck(url, headers);
      if (result.ok) return result.data;
      lastError = result.error;
      if (result.status === 404) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  throw new Error(lastError);
}

async function fetchEstimatedMoxfieldBracket(publicId: string): Promise<string | null> {
  try {
    const response = await moxfieldHttpsGet(
      `https://www.moxfield.com/decks/${encodeURIComponent(publicId)}`,
      {
        'User-Agent': MOXFIELD_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    );
    if (response.status < 200 || response.status >= 300) return null;
    return extractEstimatedBracketFromHtml(response.body);
  } catch {
    return null;
  }
}

async function fetchFromMoxfieldFresh(publicId: string): Promise<DeckData> {
  const data = await fetchMoxfieldDeckJson(publicId);

  if (data.visibility && data.visibility !== 'public') {
    throw new Error('This Moxfield deck is not public. Only public deck URLs can be imported.');
  }

  const storedBracket = normalizeBracket(data.bracket) || normalizeBracket(data.bracketType);
  const bracketPromise = storedBracket
    ? Promise.resolve(storedBracket)
    : fetchEstimatedMoxfieldBracket(publicId);

  const commanderEntries = Object.values(data.commanders || {});
  const companionEntries = Object.values(data.companions || {});
  const leaderEntries = commanderEntries.filter((entry) => !isMoxfieldBackgroundCard(entry));
  const backgroundEntries = [
    ...commanderEntries.filter((entry) => isMoxfieldBackgroundCard(entry)),
    ...companionEntries,
  ];

  const commanderNames = expandCommanderNames([
    ...leaderEntries.map((entry) => entry.card?.name).filter((name): name is string => Boolean(name)),
    ...backgroundEntries.map((entry) => entry.card?.name).filter((name): name is string => Boolean(name)),
  ]);

  const primaryCommanderName = leaderEntries[0]?.card?.name
    || commanderEntries[0]?.card?.name
    || 'Unknown Commander';

  const commander = commanderNames.length > 0
    ? commanderNames.join(' // ')
    : primaryCommanderName;

  const optionNames = commanderNames.length > 0 ? commanderNames : [commander];
  const commanderOptions = await Promise.all(optionNames.map(async (name) => {
    const leaderEntry = leaderEntries.find((entry) => entry.card?.name === name)
      || backgroundEntries.find((entry) => entry.card?.name === name)
      || commanderEntries.find((entry) => entry.card?.name === name);

    return {
      name,
      imageUrl: await fetchCommanderImage(name),
      colorIdentity: leaderEntry ? moxfieldEntryColorIdentity(leaderEntry) : [],
    };
  }));

  const deckColorIdentity = mergeColorIdentities(
    commanderOptions.flatMap((option) => option.colorIdentity || []),
    leaderEntries.flatMap(moxfieldEntryColorIdentity),
    backgroundEntries.flatMap(moxfieldEntryColorIdentity),
  );

  return {
    name: data.name || 'Untitled Deck',
    commander,
    commanderImageUrl: commanderOptions[0]?.imageUrl || await fetchCommanderImage(commander),
    commanderOptions,
    colorIdentity: finalizeDeckColorIdentity(deckColorIdentity),
    bracket: await bracketPromise,
  };
}

async function fetchFromArchidektFresh(deckId: string, signal?: AbortSignal): Promise<DeckData> {
  const response = await fetch(`https://archidekt.com/api/decks/${encodeURIComponent(deckId)}/`, {
    signal,
    cache: 'no-store',
    headers: buildArchidektHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch deck from Archidekt (${response.status})`);
  }

  const data = await response.json() as Record<string, unknown>;
  const cards = Array.isArray(data.cards) ? (data.cards as ArchidektCard[]) : [];
  const storedBracket = normalizeBracket(data.edhBracket);
  const bracketPromise = storedBracket
    ? Promise.resolve(storedBracket)
    : fetchEstimatedArchidektBracket(deckId, signal);

  const commanderCards = cards.filter(isArchidektCommanderCard);
  const leaderCards = commanderCards.filter((card) => !isArchidektBackgroundCard(card));
  const backgroundCards = commanderCards.filter(isArchidektBackgroundCard);
  const primaryLeaderCard = leaderCards[0] || commanderCards[0];

  const commanderNames = expandCommanderNames([
    ...(Array.isArray(data.commanders)
      ? data.commanders.map((commander) => (commander as { name?: string })?.name)
      : []),
    ...leaderCards.flatMap((card) => archidektCardNames(card)),
    ...backgroundCards.flatMap((card) => archidektCardNames(card)),
  ].filter((name): name is string => Boolean(name)));

  const uniqueCommanderNames = commanderNames.length > 0
    ? commanderNames
    : expandCommanderNames(primaryLeaderCard ? archidektCardNames(primaryLeaderCard) : []);

  const commander = uniqueCommanderNames.length > 0
    ? uniqueCommanderNames.join(' // ')
    : primaryLeaderCard?.card?.oracleCard?.name
      || primaryLeaderCard?.card?.displayName
      || primaryLeaderCard?.card?.name
      || 'Unknown Commander';

  const optionNames = uniqueCommanderNames.length > 0
    ? uniqueCommanderNames
    : expandCommanderNames([commander]);

  const commanderOptions = await Promise.all(optionNames.map(async (name) => {
    const matchingCommanderCard = findArchidektCommanderCardForName(commanderCards, name);
    return {
      name,
      imageUrl: await resolveArchidektCommanderImage(matchingCommanderCard, name, signal),
      colorIdentity: matchingCommanderCard ? archidektCardColorIdentity(matchingCommanderCard) : [],
    };
  }));

  const deckColorIdentity = mergeColorIdentities(
    data.deckColorIdentity,
    data.colorIdentity,
    commanderOptions.flatMap((option) => option.colorIdentity || []),
    commanderCards.flatMap(archidektCardColorIdentity),
    primaryLeaderCard ? archidektCardColorIdentity(primaryLeaderCard) : []
  );

  const colorIdentity = finalizeDeckColorIdentity(deckColorIdentity);
  const featuredImage = archidektDeckFeaturedImage(data);
  const primaryOptionName = optionNames[0]?.toLowerCase();
  const leaderImage = commanderOptions.find(
    (option) => option.name.toLowerCase() === primaryOptionName,
  )?.imageUrl || commanderOptions[0]?.imageUrl || null;

  return {
    name: String(data.name || 'Untitled Deck'),
    commander,
    commanderImageUrl: leaderImage || featuredImage || commanderOptions[0]?.imageUrl || await fetchCommanderImage(commander),
    commanderOptions,
    colorIdentity,
    bracket: await bracketPromise,
  };
}

const fetchFromMoxfieldPersistent = unstable_cache(
  fetchFromMoxfieldFresh,
  ['moxfield-deck-v7'],
  { revalidate: 5 * 60 },
);

const fetchFromArchidektPersistent = unstable_cache(
  fetchFromArchidektFresh,
  ['archidekt-deck-v7'],
  { revalidate: 5 * 60 },
);

export async function fetchFromMoxfield(publicId: string): Promise<DeckData> {
  return fetchFromMoxfieldPersistent(publicId);
}

export async function fetchFromArchidekt(deckId: string): Promise<DeckData> {
  return fetchFromArchidektPersistent(deckId);
}

export async function fetchDeckFromSource(
  source: DeckSource,
  deckId: string,
  options: { fresh?: boolean; signal?: AbortSignal } = {},
): Promise<DeckData> {
  if (source === 'moxfield') {
    return options.fresh ? fetchFromMoxfieldFresh(deckId) : fetchFromMoxfield(deckId);
  }
  return options.fresh ? fetchFromArchidektFresh(deckId, options.signal) : fetchFromArchidekt(deckId);
}
