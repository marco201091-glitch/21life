import { fetchCardByName } from '@/lib/scryfall';

const EDHREC_JSON_BASE = 'https://json.edhrec.com/pages/commanders';
const EDHREC_SITE_BASE = 'https://edhrec.com/commanders';

export interface EdhrecCommanderStats {
  commander: string;
  slug: string;
  numDecks: number | null;
  rank: number | null;
  bracketCounts: Record<string, number> | null;
}

const APOSTROPHE_LIKE = /[''`´\u2018\u2019\u201A\u201B]/g;

export const EDHREC_STATS_TTL_MS = 24 * 60 * 60 * 1000;

export function parseCommanderParts(commander: string) {
  return commander
    .split('//')
    .map((part) => part.trim())
    .filter(Boolean);
}

function slugifyCommanderName(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugifyCommanderNameCompact(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(APOSTROPHE_LIKE, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildEdhrecSlugFromParts(parts: string[]) {
  return parts
    .map((part) => slugifyCommanderNameCompact(part))
    .filter(Boolean)
    .join('-');
}

export function buildCommanderSlug(commander: string) {
  const parts = parseCommanderParts(commander);
  if (parts.length > 1) {
    return buildEdhrecSlugFromParts(parts);
  }
  return slugifyCommanderNameCompact(parts[0] || commander);
}

function isDoubleFacedCommander(card: Awaited<ReturnType<typeof fetchCardByName>>, parts: string[]) {
  if (!card?.card_faces || card.card_faces.length < 2) return false;

  const faceNames = card.card_faces.map((face) => face.name.trim().toLowerCase());
  return parts.length === card.card_faces.length
    && parts.every((part) => faceNames.includes(part.trim().toLowerCase()));
}

async function resolveSingleEdhrecIndexName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const card = await fetchCardByName(trimmed);
  if (!card) return trimmed;

  const normalized = trimmed.toLowerCase();
  const faces = card.card_faces || [];
  if (faces.length > 0) {
    const matchedFaceIndex = faces.findIndex((face) => face.name.trim().toLowerCase() === normalized);
    if (matchedFaceIndex > 0) {
      return faces[0].name;
    }
  }

  return card.name.includes('//') ? (faces[0]?.name || card.name.split('//')[0].trim()) : card.name;
}

export async function resolveEdhrecCommanderIndexParts(commander: string) {
  const rawParts = parseCommanderParts(commander);
  if (rawParts.length === 0) return [];

  if (rawParts.length === 1) {
    return [await resolveSingleEdhrecIndexName(rawParts[0])];
  }

  const combinedLookup = await fetchCardByName(rawParts.join(' // '))
    || await fetchCardByName(commander)
    || await fetchCardByName(rawParts[0]);

  if (isDoubleFacedCommander(combinedLookup, rawParts)) {
    return [combinedLookup!.card_faces![0].name];
  }

  return Promise.all(rawParts.map((part) => resolveSingleEdhrecIndexName(part)));
}

export async function resolveEdhrecCommanderSlug(commander: string) {
  const parts = await resolveEdhrecCommanderIndexParts(commander);
  return buildEdhrecSlugFromParts(parts);
}

function expandCommanderSlugCandidates(commander: string, resolvedParts?: string[]) {
  const parts = resolvedParts?.length
    ? resolvedParts
    : parseCommanderParts(commander);

  const candidates: string[] = [];

  if (parts.length > 1) {
    candidates.push(buildEdhrecSlugFromParts(parts));
    candidates.push(slugifyCommanderNameCompact(parts[0]));
  } else if (parts.length === 1) {
    candidates.push(slugifyCommanderNameCompact(parts[0]));
    candidates.push(slugifyCommanderName(parts[0]));
  }

  candidates.push(slugifyCommanderNameCompact(commander));
  candidates.push(slugifyCommanderName(commander));

  return Array.from(new Set(candidates.filter(Boolean)));
}

function readNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function extractBracketCounts(...sources: unknown[]): Record<string, number> | null {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;

    const counts = (source as Record<string, unknown>).bracket_counts;
    if (!counts || typeof counts !== 'object') continue;

    const normalized = Object.entries(counts as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        acc[key] = value;
      }
      return acc;
    }, {});

    if (Object.keys(normalized).length > 0) {
      return normalized;
    }
  }

  return null;
}

function extractStats(payload: unknown, commander: string, slug: string): EdhrecCommanderStats | null {
  if (!payload || typeof payload !== 'object') return null;

  const root = payload as Record<string, unknown>;
  const container = (root.container && typeof root.container === 'object')
    ? root.container as Record<string, unknown>
    : root;
  const jsonDict = (container.json_dict && typeof container.json_dict === 'object')
    ? container.json_dict as Record<string, unknown>
    : null;

  const card = (jsonDict?.card && typeof jsonDict.card === 'object')
    ? jsonDict.card as Record<string, unknown>
    : null;

  const resolvedName = typeof card?.name === 'string' ? card.name : commander;
  const numDecks = readNumber(
    card?.num_decks,
    container.num_decks,
    jsonDict?.num_decks,
  );
  const rank = readNumber(
    card?.rank,
    container.emerald_rank,
    jsonDict?.emerald_rank,
  );

  const bracketCounts = extractBracketCounts(root, container, jsonDict);

  if (numDecks === null && rank === null && bracketCounts === null) return null;

  return {
    commander: resolvedName,
    slug,
    numDecks,
    rank,
    bracketCounts,
  };
}

export function buildEdhrecCommanderUrl(slug: string) {
  return `${EDHREC_SITE_BASE}/${slug}`;
}

export async function fetchEdhrecCommanderStats(commander: string): Promise<EdhrecCommanderStats | null> {
  const resolvedParts = await resolveEdhrecCommanderIndexParts(commander);
  const candidates = expandCommanderSlugCandidates(commander, resolvedParts);
  if (candidates.length === 0) return null;

  for (const slug of candidates) {
    try {
      const response = await fetch(`${EDHREC_JSON_BASE}/${slug}.json`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': '21Life/9.1 (https://app.21life.win)',
        },
        next: { revalidate: 86400 },
      });

      if (!response.ok) continue;
      const payload = await response.json();
      const stats = extractStats(payload, commander, slug);
      if (stats) return stats;
    } catch {
      // Try next slug candidate.
    }
  }

  return null;
}
