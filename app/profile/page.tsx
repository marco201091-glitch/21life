'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MotionItem, MotionList, MotionPanel } from '@/components/ui/motion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AppLoader } from '@/components/ui/app-loader';
import { ManaLogo } from '@/components/ui/mana-logo';
import { AppProfileButton } from '@/components/navigation/app-profile-button';
import { DeckCollectionInsights } from '@/components/profile/deck-collection-insights';
import { DeckMasteryBadge } from '@/components/profile/deck-mastery-badge';
import { DeckImage } from '@/components/deck-image';
import { useLanguage } from '@/components/language-provider';
import { usePlatformAdmin } from '@/hooks/use-platform-admin';

import { RESERVED_USERNAMES } from '@/lib/reserved-usernames';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  buildDeckColorFields,
  deckHasColorIdentity,
  filterSelectableCommanderOptions,
  getCommanderOptions,
  getDeckDisplayColors,
  mergeDeckColorFields,
  normalizeDeckColorIdentity,
  resolveSelectedCommanderOption,
} from '@/lib/deck-metadata';
import { lookupCommanderCmcInBrowser } from '@/lib/commander-cmc-client';
import { buildCommanderNameSearchClause } from '@/lib/commander-search-aliases';
import {
  getCommanderPartnerCopy as getManualPartnerCopy,
  getCommanderPartnerMode as getManualPartnerMode,
} from '@/lib/commander-partners';
import type { CommanderPartnerMode } from '@/lib/scryfall';
import {
  buildArchidektBatchCommanderSelections,
  deckDataToColorFields,
  getDefaultImportedCommanderOption,
  isImportedCommanderOptionSelected,
  isImportedDeckSource,
  repairImportedCommanderOptions,
  resolveImportedCommanderAfterArtsLoad,
  resolveImportedDeckCommanderImage,
} from '@/lib/deck-importers';
import {
  buildDeckCommanderCmcFromCmcs,
  deckNeedsCommanderCmc,
  resolveDeckCommanderCmc,
} from '@/lib/deck-commander-cmc';
import { collectUniqueCommanderNames } from '@/lib/deck-collection-analytics';
import { DeckExternalLinkChip } from '@/components/deck/deck-external-link-chip';
import { BracketBadge } from '@/components/deck/bracket-badge';
import { EdhrecDeckInsights, hasFreshEdhrecBadge, prefetchEdhrecStats } from '@/components/deck/edhrec-badge';
import { delay, runTasksWithConcurrency } from '@/lib/async-utils';
import { runWhenIdle } from '@/lib/idle-work';
import { type DeckWinRateSnapshot } from '@/lib/personal-analytics';
import { MANA_COLOR_LABELS, MANA_COLOR_ORDER } from '@/lib/mana-colors';
import { getProfileDisplayName } from '@/lib/profile-display';
import { getSupabaseErrorMessage } from '@/lib/supabase-errors';
import { ManaColorPills } from '@/components/ui/mana-color-pills';
import { ModalCard, ModalOverlay } from '@/components/ui/modal-shell';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  buildDeckPerformanceStats,
  type DeckPerformanceInputRow,
  type DeckPerformanceStats,
} from '@/lib/deck-performance-analytics';
import { formatGameDuration } from '@/lib/live-game-duration';
import { getDeckMastery } from '@/lib/deck-mastery';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PasswordRequirements, isPasswordPolicyValid } from '@/components/auth/password-requirements';
import { isGoogleAuthUser } from '@/lib/oauth-profile';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ExternalLink,
  Swords,
  Trophy,
  Crown,
  Loader2,
  Search,
  Mail,
  User as UserIcon,
  Calendar,
  RefreshCw,
  Save,
  X,
  Check,
  Image as ImageIcon,
  Lock,
  BarChart3,
  Crosshair,
  Shield,
  ChevronRight,
  Skull,
  Link2,
  Star,
  Archive,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { formatMatchRecord } from '@/lib/win-rate';

interface Deck {
  id: string;
  user_id: string;
  group_id: string | null;
  name: string;
  commander: string;
  commander_image: string | null;
  source_url: string | null;
  source_type: string | null;
  bracket: string | null;
  color_identity: string[] | null;
  commander_options: ImportedCommanderOption[] | null;
  commander_cmc: number | null;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string | null;
  profiles?: {
    username: string;
    display_name: string | null;
  } | null;
}

const PROFILE_DECK_COLUMNS = 'id, user_id, group_id, name, commander, commander_image, source_url, source_type, bracket, color_identity, commander_options, commander_cmc, is_favorite, is_archived, created_at, updated_at';

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  archidekt_username: string | null;
  archidekt_auto_import: boolean;
  archidekt_last_sync_at: string | null;
}

interface CommanderSearchResult {
  id: string;
  name: string;
  imageUrl: string | null;
  typeLine: string;
  colorIdentity: string[];
  oracleText: string;
  keywords: string[];
}

interface ImportedCommanderOption {
  name: string;
  imageUrl: string | null;
  colorIdentity?: string[];
}

interface ImportedDeckPreview {
  id?: string;
  name: string;
  commander: string;
  commanderImageUrl: string | null;
  commanderOptions?: ImportedCommanderOption[];
  colorIdentity?: string[];
  bracket: string | null;
  sourceUrl: string;
  sourceType: string;
  error?: string;
  warning?: string;
}

interface CommanderArtOption {
  id: string;
  name: string;
  imageUrl: string;
  setName: string;
  collectorNumber: string;
  releasedAt: string | null;
}

type AddDeckMode = 'choose' | 'import-url' | 'archidekt-user' | 'manual';
type ManualPartnerMode = CommanderPartnerMode;

interface ScryfallBrowserCard {
  id: string;
  name: string;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  color_identity?: string[];
  set_name?: string;
  collector_number?: string;
  released_at?: string;
  image_uris?: {
    art_crop?: string;
    large?: string;
    normal?: string;
  };
  card_faces?: Array<{
    name: string;
    image_uris?: {
      art_crop?: string;
      large?: string;
      normal?: string;
    };
  }>;
}

interface ScryfallBrowserSearchResponse {
  data?: ScryfallBrowserCard[];
}

function expandDeckCommanderNames(commander: string) {
  return Array.from(new Set(
    commander
      .split('//')
      .flatMap((part) => part.split('/').map((name) => name.trim()))
      .filter(Boolean)
  ));
}

const SCRYFALL_REQUEST_GAP_MS = 120;
const commanderSearchCache = new Map<string, CommanderSearchResult[]>();
const COMMANDER_ART_CACHE_MS = 30 * 24 * 60 * 60 * 1_000;
const COMMANDER_ART_STORAGE_KEY = 'phyrexian-arena:commander-art-options:v7';
const commanderArtCache = new Map<string, { expiresAt: number; options: CommanderArtOption[] }>();
const commanderArtInflight = new Map<string, Promise<CommanderArtOption[]>>();
let commanderArtCacheHydrated = false;

function hydrateCommanderArtCache() {
  if (commanderArtCacheHydrated) return;
  commanderArtCacheHydrated = true;
  try {
    const raw = window.localStorage.getItem(COMMANDER_ART_STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Record<string, { expiresAt: number; options: CommanderArtOption[] }>;
    const now = Date.now();
    Object.entries(stored).forEach(([key, entry]) => {
      if (entry.expiresAt > now && Array.isArray(entry.options)) {
        commanderArtCache.set(key, entry);
      }
    });
  } catch {
    // Storage may be unavailable; memory cache still works.
  }
}

function rememberCommanderArts(key: string, options: CommanderArtOption[]) {
  commanderArtCache.set(key, {
    expiresAt: Date.now() + COMMANDER_ART_CACHE_MS,
    options,
  });
  try {
    window.localStorage.setItem(
      COMMANDER_ART_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(commanderArtCache)),
    );
  } catch {
    // Storage quota/private mode: memory cache still works.
  }
}

async function lookupCommanderImageFromBrowser(name: string): Promise<string | null> {
  const match = await lookupCommanderFromBrowser(name);
  return match?.imageUrl?.trim() || null;
}

async function normalizeImportedDeckPreview(deck: ImportedDeckPreview): Promise<ImportedDeckPreview> {
  const options = deck.commanderOptions || [];
  let repairedOptions = options;

  if (options.length > 1) {
    repairedOptions = await repairImportedCommanderOptions(options, lookupCommanderImageFromBrowser);
  } else if (options.length === 1 && !options[0]?.imageUrl?.trim()) {
    const imageUrl = await lookupCommanderImageFromBrowser(options[0].name);
    if (imageUrl) {
      repairedOptions = [{ ...options[0], imageUrl }];
    }
  } else if (options.length === 0 && !deck.commanderImageUrl?.trim()) {
    const imageUrl = await lookupCommanderImageFromBrowser(deck.commander);
    if (imageUrl) {
      return {
        ...deck,
        commanderImageUrl: imageUrl,
        commanderOptions: [{
          name: deck.commander,
          imageUrl,
          colorIdentity: deck.colorIdentity || [],
        }],
      };
    }
    return deck;
  }

  const defaultCommander = getDefaultImportedCommanderOption({
    ...deck,
    commanderOptions: repairedOptions,
  });

  return {
    ...deck,
    commanderOptions: repairedOptions,
    commanderImageUrl: defaultCommander.imageUrl || deck.commanderImageUrl,
  };
}

async function resolveImportedDeckCommanderImageForSave(
  selectedCommander: ImportedCommanderOption,
  deck: ImportedDeckPreview,
  preserveImage?: string | null,
): Promise<string | null> {
  let imageUrl = resolveImportedDeckCommanderImage(selectedCommander, deck, { preserveImage });
  if (!imageUrl) {
    imageUrl = await lookupCommanderImageFromBrowser(selectedCommander.name);
    await delay(SCRYFALL_REQUEST_GAP_MS);
  }

  return imageUrl;
}

function getCommanderSearchCacheKey(query: string, partnerMode: ManualPartnerMode | null = null) {
  return `${partnerMode || 'any'}:${query.trim().toLowerCase()}`;
}

async function lookupCommanderFromBrowser(name: string, signal?: AbortSignal): Promise<CommanderSearchResult | null> {
  const queryText = sanitizeScryfallQuery(name);
  if (!queryText) return null;

  const request = (path: string) => fetch(`https://api.scryfall.com/cards/named?${path}=${encodeURIComponent(queryText)}`, {
    headers: { Accept: 'application/json' },
    signal,
  });

  const exactResponse = await request('exact');
  if (exactResponse.ok) {
    return toCommanderSearchResult(await exactResponse.json() as ScryfallBrowserCard);
  }

  const fuzzyResponse = await request('fuzzy');
  if (fuzzyResponse.ok) {
    return toCommanderSearchResult(await fuzzyResponse.json() as ScryfallBrowserCard);
  }

  return null;
}

async function resolveCommanderColorOptions(
  commander: string,
  existingOptions: ImportedCommanderOption[] = []
): Promise<ImportedCommanderOption[]> {
  const commanderNames = expandDeckCommanderNames(commander);
  const resolved: ImportedCommanderOption[] = [];

  for (const name of commanderNames) {
    const existing = existingOptions.find((option) => option.name.toLowerCase() === name.toLowerCase());
    if (existing?.colorIdentity && existing.colorIdentity.length > 0) {
      resolved.push(existing);
      continue;
    }

    const match = await lookupCommanderFromBrowser(name);
    resolved.push(match ? {
      name: match.name,
      imageUrl: existing?.imageUrl ?? match.imageUrl,
      colorIdentity: normalizeDeckColorIdentity(match.colorIdentity),
    } : (existing || { name, imageUrl: null, colorIdentity: [] }));

    await delay(SCRYFALL_REQUEST_GAP_MS);
  }

  return uniqueCommanderOptions(resolved.filter((option) => option.name));
}

function getProfileInitials(profile: Pick<Profile, 'username' | 'display_name'> | null | undefined) {
  const displayName = getProfileDisplayName(profile);
  if (!displayName) return '?';
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return displayName.slice(0, 2).toUpperCase();
}

function sanitizeScryfallQuery(query: string) {
  return query.trim().replace(/"/g, '');
}

function extractBrowserScryfallImage(card: ScryfallBrowserCard, preferredName?: string): string | null {
  if (preferredName) {
    const normalizedName = preferredName.toLowerCase();
    const matchingFace = card.card_faces?.find((face) => face.name.toLowerCase() === normalizedName);
    if (matchingFace?.image_uris?.art_crop) return matchingFace.image_uris.art_crop;
    if (matchingFace?.image_uris?.large) return matchingFace.image_uris.large;
    if (matchingFace?.image_uris?.normal) return matchingFace.image_uris.normal;
  }

  if (card.image_uris?.art_crop) return card.image_uris.art_crop;
  if (card.card_faces?.[0]?.image_uris?.art_crop) return card.card_faces[0].image_uris.art_crop;
  if (card.image_uris?.large) return card.image_uris.large;
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris?.large) return card.card_faces[0].image_uris.large;
  if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal;
  return null;
}

function scryfallPartnerModeQuery(mode: ManualPartnerMode | null) {
  if (mode === 'background') return 'is:commander t:background';
  if (mode === 'background-owner') return 'is:commander o:"choose a background"';
  if (mode === 'friends') return 'is:commander o:"friends forever"';
  if (mode === 'father-son') return 'is:commander o:"partner—father & son"';
  if (mode === 'survivors') return 'is:commander o:"partner—survivors"';
  if (mode === 'character-select') return 'is:commander o:"partner—character select"';
  if (mode === 'doctor') return 'is:commander t:doctor t:"time lord"';
  if (mode === 'doctor-companion') return 'is:commander o:"doctor\'s companion"';
  if (mode?.startsWith('partner-with:')) {
    const partnerName = sanitizeScryfallQuery(mode.slice('partner-with:'.length));
    return partnerName ? `is:commander !"${partnerName}"` : 'is:commander o:"partner with"';
  }
  if (mode?.startsWith('partner-family:')) {
    const familyName = sanitizeScryfallQuery(mode.slice('partner-family:'.length));
    return familyName ? `is:commander o:"partner—${familyName}"` : 'is:commander';
  }
  if (mode === 'partner') return 'is:commander o:partner -o:"partner with" -o:"partner—"';
  return 'is:commander';
}

function toCommanderSearchResult(card: ScryfallBrowserCard): CommanderSearchResult {
  return {
    id: card.id,
    name: card.name,
    imageUrl: extractBrowserScryfallImage(card),
    typeLine: card.type_line || '',
    colorIdentity: normalizeDeckColorIdentity(card.color_identity),
    oracleText: card.oracle_text || '',
    keywords: Array.isArray(card.keywords) ? card.keywords : [],
  };
}

async function fetchScryfallCommandersFromBrowser(
  query: string,
  partnerMode: ManualPartnerMode | null = null,
  signal?: AbortSignal
) {
  const queryText = sanitizeScryfallQuery(query);
  if (queryText.length < 2) return [];

  const baseQuery = scryfallPartnerModeQuery(partnerMode);
  const response = await fetch(
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${baseQuery} ${buildCommanderNameSearchClause(queryText)}`)}&order=edhrec&unique=cards`,
    { headers: { Accept: 'application/json' }, signal }
  );

  if (response.status === 404) return [];
  if (!response.ok) throw new Error('Scryfall search failed');

  const data = await response.json() as ScryfallBrowserSearchResponse;
  return (data.data || []).slice(0, 20).map(toCommanderSearchResult);
}

async function fetchCommanderSearchResults(
  query: string,
  partnerMode: ManualPartnerMode | null = null,
  signal?: AbortSignal
) {
  const cacheKey = getCommanderSearchCacheKey(query, partnerMode);
  const cached = commanderSearchCache.get(cacheKey);
  if (cached) return cached;

  let results: CommanderSearchResult[] = [];

  try {
    results = await fetchScryfallCommandersFromBrowser(query, partnerMode, signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    results = [];
  }

  if (results.length === 0) {
    const params = new URLSearchParams({ q: query });
    if (partnerMode) params.set('partnerMode', partnerMode);
    const response = await authenticatedFetch(`/api/scryfall-commanders?${params.toString()}`, { signal });
    if (response.ok) {
      const data = await response.json();
      results = Array.isArray(data.data) ? data.data as CommanderSearchResult[] : [];
    }
  }

  commanderSearchCache.set(cacheKey, results);
  return results;
}

async function fetchScryfallArtOptionsFromBrowser(commanderName: string) {
  const queryText = sanitizeScryfallQuery(commanderName);
  if (queryText.length < 2) return [];
  hydrateCommanderArtCache();
  const cacheKey = queryText.toLocaleLowerCase();
  const cached = commanderArtCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.options;

  const inflight = commanderArtInflight.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    const response = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${queryText}"`)}&unique=art&order=released`,
      { headers: { Accept: 'application/json' } }
    );

    if (response.status === 404) return [];
    if (!response.ok) throw new Error('Scryfall art search failed');

    const data = await response.json() as ScryfallBrowserSearchResponse;
    const options = (data.data || [])
      .map((card) => {
        const imageUrl = extractBrowserScryfallImage(card, queryText);
        if (!imageUrl) return null;

        return {
          id: card.id,
          name: card.name,
          imageUrl,
          setName: card.set_name || '',
          collectorNumber: card.collector_number || '',
          releasedAt: card.released_at || null,
        };
      })
      .filter((option): option is CommanderArtOption => Boolean(option));

    rememberCommanderArts(cacheKey, options);
    return options;
  })();

  commanderArtInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    commanderArtInflight.delete(cacheKey);
  }
}

function manualDeckColorFields(commander: CommanderSearchResult, partnerCommander?: CommanderSearchResult | null) {
  const commanderOptions = uniqueCommanderOptions([
    {
      name: commander.name,
      imageUrl: commander.imageUrl,
      colorIdentity: normalizeDeckColorIdentity(commander.colorIdentity),
    },
    ...(partnerCommander ? [{
      name: partnerCommander.name,
      imageUrl: partnerCommander.imageUrl,
      colorIdentity: normalizeDeckColorIdentity(partnerCommander.colorIdentity),
    }] : []),
  ]);
  return buildDeckColorFields(commanderOptions);
}

function uniqueCommanderOptions(options: ImportedCommanderOption[]) {
  return options.filter((option, index, allOptions) =>
    option.name &&
    allOptions.findIndex((candidate) => candidate.name.toLowerCase() === option.name.toLowerCase()) === index
  );
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { copy: t } = useLanguage();
  const { adminMode } = usePlatformAdmin();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<AddDeckMode>('choose');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedTargetProfileId, setSelectedTargetProfileId] = useState<string>('');
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [exportingAccount, setExportingAccount] = useState(false);
  const [activeAccountPanel, setActiveAccountPanel] = useState<'nickname' | 'password' | null>(null);
  const [profileDisplayNameDrafts, setProfileDisplayNameDrafts] = useState<Record<string, string>>({});
  const [savingProfileDisplayNameIds, setSavingProfileDisplayNameIds] = useState<string[]>([]);
  const commanderSearchAbortRef = useRef<AbortController | null>(null);
  const partnerSearchAbortRef = useRef<AbortController | null>(null);
  const deckMetadataSyncAbortRef = useRef(false);
  const deckMetadataSyncInFlightRef = useRef(false);
  const commanderCmcSyncInFlightRef = useRef(false);
  const decksRef = useRef<Deck[]>([]);
  const [commanderCmcSyncInProgress, setCommanderCmcSyncInProgress] = useState(false);

  // URL import state (Archidekt + Moxfield)
  const [importDeckUrl, setImportDeckUrl] = useState('');
  const [importingDeck, setImportingDeck] = useState(false);
  const [importedDeck, setImportedDeck] = useState<ImportedDeckPreview | null>(null);
  const [selectedImportedCommander, setSelectedImportedCommander] = useState<ImportedCommanderOption | null>(null);
  const [importedCommanderArts, setImportedCommanderArts] = useState<CommanderArtOption[]>([]);
  const [loadingImportedCommanderArts, setLoadingImportedCommanderArts] = useState(false);
  const [archidektUsername, setArchidektUsername] = useState('');
  const [archidektSettingsUsername, setArchidektSettingsUsername] = useState('');
  const [archidektAutoImport, setArchidektAutoImport] = useState(false);
  const [savingArchidektSettings, setSavingArchidektSettings] = useState(false);
  const archidektAutoImportStartedRef = useRef(false);
  const [importingUserDecks, setImportingUserDecks] = useState(false);
  const [importedUserDecks, setImportedUserDecks] = useState<ImportedDeckPreview[]>([]);
  const [selectedUserDeckCommanders, setSelectedUserDeckCommanders] = useState<Record<string, ImportedCommanderOption>>({});
  const [selectedUserDeckUrls, setSelectedUserDeckUrls] = useState<string[]>([]);
  const [savingUserDecks, setSavingUserDecks] = useState(false);
  const [overwriteConfirm, setOverwriteConfirm] = useState<
    | { kind: 'single' }
    | { kind: 'bulk'; count: number }
    | null
  >(null);
  const overwriteResolver = useRef<((value: boolean | 'overwrite' | 'skip' | 'cancel') => void) | null>(null);

  // Manual deck state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CommanderSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCommander, setSelectedCommander] = useState<CommanderSearchResult | null>(null);
  const [partnerSearchQuery, setPartnerSearchQuery] = useState('');
  const [partnerSearchResults, setPartnerSearchResults] = useState<CommanderSearchResult[]>([]);
  const [searchingPartner, setSearchingPartner] = useState(false);
  const [selectedPartnerCommander, setSelectedPartnerCommander] = useState<CommanderSearchResult | null>(null);
  const [manualCommanderArts, setManualCommanderArts] = useState<CommanderArtOption[]>([]);
  const [loadingManualCommanderArts, setLoadingManualCommanderArts] = useState(false);
  const [customDeckName, setCustomDeckName] = useState('');
  const [savingDeck, setSavingDeck] = useState(false);
  const [refreshingDecks, setRefreshingDecks] = useState(false);
  const [refreshingDeckIds, setRefreshingDeckIds] = useState<string[]>([]);
  const [editingArtDeck, setEditingArtDeck] = useState<Deck | null>(null);
  const [deckCommanderOptions, setDeckCommanderOptions] = useState<ImportedCommanderOption[]>([]);
  const [selectedDeckCommander, setSelectedDeckCommander] = useState<ImportedCommanderOption | null>(null);
  const [deckArtOptions, setDeckArtOptions] = useState<CommanderArtOption[]>([]);
  const [loadingDeckArtOptions, setLoadingDeckArtOptions] = useState(false);
  const [savingDeckArt, setSavingDeckArt] = useState(false);
  const [linkingDeck, setLinkingDeck] = useState<Deck | null>(null);
  const [linkDeckUrl, setLinkDeckUrl] = useState('');
  const [savingDeckLink, setSavingDeckLink] = useState(false);
  const [deckSearchQuery, setDeckSearchQuery] = useState('');
  const [deckColorFilter, setDeckColorFilter] = useState<string[]>([]);
  const [deckPlayerFilter, setDeckPlayerFilter] = useState('all');
  const [deckWinRates, setDeckWinRates] = useState<Map<string, DeckWinRateSnapshot>>(new Map());
  const [deckPerformance, setDeckPerformance] = useState<Map<string, DeckPerformanceStats>>(new Map());
  const [deckSort, setDeckSort] = useState<'recent' | 'winRate' | 'gamesPlayed' | 'damage' | 'eliminations' | 'fastest'>('recent');
  const [detailsDeck, setDetailsDeck] = useState<Deck | null>(null);
  const currentProfile = user ? profiles.find((profile) => profile.id === user.id) || null : null;
  const targetProfiles = profiles.filter((profile) => !RESERVED_USERNAMES.has(profile.username.toLowerCase()));
  const manualPartnerMode = selectedCommander ? getManualPartnerMode(selectedCommander) : null;
  const manualPartnerCopy = manualPartnerMode ? getManualPartnerCopy(manualPartnerMode, t) : null;

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!adminMode || selectedTargetProfileId || targetProfiles.length === 0) return;
    const firstPlayer = targetProfiles.find((profile) => profile.id !== user?.id) || targetProfiles[0];
    setSelectedTargetProfileId(firstPlayer.id);
  }, [adminMode, targetProfiles, selectedTargetProfileId, user?.id]);

  useEffect(() => {
    if (!currentProfile) return;
    setDisplayNameDraft(currentProfile.display_name || '');
  }, [currentProfile]);

  useEffect(() => {
    decksRef.current = decks;
  }, [decks]);

  const syncMissingDeckMetadata = useCallback(async (loadedDecks: Deck[]) => {
    if (deckMetadataSyncInFlightRef.current) return;

    const MAX_AUTO_SYNC_DECKS = 3;
    const decksToSync = loadedDecks.filter((deck) => {
      const needsColors = !deckHasColorIdentity(deck);
      const needsBracket = isImportedDeckSource(deck.source_type) && !!deck.source_url && !deck.bracket;
      return needsColors || needsBracket;
    }).slice(0, MAX_AUTO_SYNC_DECKS);

    if (decksToSync.length === 0) return;

    deckMetadataSyncInFlightRef.current = true;
    deckMetadataSyncAbortRef.current = false;

    try {
      await delay(4000);
      if (deckMetadataSyncAbortRef.current) return;

      const successfulUpdates: Array<Partial<Deck> & { id: string }> = [];

      for (const deck of decksToSync) {
        if (deckMetadataSyncAbortRef.current) break;

        try {
          const updatePayload: Partial<Deck> = {};
          const needsColors = !deckHasColorIdentity(deck);
          const needsBracket = isImportedDeckSource(deck.source_type) && !!deck.source_url && !deck.bracket;

          if (needsColors || needsBracket) {
            if (isImportedDeckSource(deck.source_type) && deck.source_url) {
              const response = await authenticatedFetch('/api/deck-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: deck.source_url }),
              });

              if (response.ok) {
                const imported = await response.json() as ImportedDeckPreview & { colorIdentity?: string[] };
                const bracket = typeof imported.bracket === 'string' ? imported.bracket : null;
                const colorFields = deckDataToColorFields({
                  commanderOptions: imported.commanderOptions || [],
                  colorIdentity: imported.colorIdentity || [],
                });

                if (!deck.bracket && bracket) updatePayload.bracket = bracket;
                if (needsColors && deckHasColorIdentity(colorFields)) {
                  updatePayload.color_identity = colorFields.color_identity ?? null;
                  updatePayload.commander_options = colorFields.commander_options ?? null;
                }
              }
            } else if (needsColors && deck.commander.trim()) {
              const commanderOptions = await resolveCommanderColorOptions(
                deck.commander,
                getCommanderOptions(deck)
              );
              const colorFields = buildDeckColorFields(commanderOptions);
              if (deckHasColorIdentity(colorFields)) {
                updatePayload.color_identity = colorFields.color_identity ?? null;
                updatePayload.commander_options = colorFields.commander_options ?? null;
              }
            }
          }

          if (Object.keys(updatePayload).length === 0) continue;

          const { error } = await supabase
            .from('decks')
            .update(updatePayload)
            .eq('id', deck.id);

          if (!error) {
            successfulUpdates.push({ id: deck.id, ...updatePayload });
          }
        } catch {
          // Keep syncing the remaining decks.
        }

        await delay(SCRYFALL_REQUEST_GAP_MS);
      }

      if (!deckMetadataSyncAbortRef.current && successfulUpdates.length > 0) {
        setDecks((currentDecks) => currentDecks.map((deck) => {
          const update = successfulUpdates.find((item) => item.id === deck.id);
          return update ? { ...deck, ...update } : deck;
        }));
      }
    } finally {
      deckMetadataSyncInFlightRef.current = false;
    }
  }, []);

  const syncMissingCommanderCmc = useCallback(async () => {
    if (commanderCmcSyncInFlightRef.current || deckMetadataSyncAbortRef.current) return;

    const MAX_BATCH_DECKS = 6;
    const MAX_ROUNDS = 24;

    commanderCmcSyncInFlightRef.current = true;
    setCommanderCmcSyncInProgress(true);

    try {
      let stalledRounds = 0;

      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        if (deckMetadataSyncAbortRef.current) break;

        const decksNeedingCmc = decksRef.current.filter((deck) => deckNeedsCommanderCmc(deck));
        if (decksNeedingCmc.length === 0) break;

        const batch = decksNeedingCmc.slice(0, MAX_BATCH_DECKS);
        const commanderNames = collectUniqueCommanderNames(batch);
        if (commanderNames.length === 0) break;

        const response = await authenticatedFetch('/api/scryfall-commander-cmc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: commanderNames }),
        });

        if (!response.ok) {
          stalledRounds += 1;
          if (stalledRounds >= 2) break;
          await delay(600);
          continue;
        }

        const payload = await response.json() as { cmcs?: Record<string, number | null> };
        const commanderCmcs = payload.cmcs || {};
        const successfulUpdates: Array<{ id: string; commander_cmc: number }> = [];

        for (const deck of batch) {
          const commanderCmc = buildDeckCommanderCmcFromCmcs(deck, commanderCmcs);
          if (commanderCmc == null) continue;

          const { error } = await supabase
            .from('decks')
            .update({ commander_cmc: commanderCmc })
            .eq('id', deck.id);

          if (!error) {
            successfulUpdates.push({ id: deck.id, commander_cmc: commanderCmc });
          } else {
            console.error('Failed to persist commander_cmc for deck', deck.id, error);
          }
        }

        if (successfulUpdates.length === 0) {
          stalledRounds += 1;
          if (stalledRounds >= 2) break;
          await delay(600);
          continue;
        }

        stalledRounds = 0;
        setDecks((currentDecks) => currentDecks.map((deck) => {
          const update = successfulUpdates.find((item) => item.id === deck.id);
          return update ? { ...deck, commander_cmc: update.commander_cmc } : deck;
        }));

        await delay(SCRYFALL_REQUEST_GAP_MS);
      }
    } finally {
      commanderCmcSyncInFlightRef.current = false;
      setCommanderCmcSyncInProgress(false);
    }
  }, []);

  const fetchDeckWinRates = useCallback(async (loadedDecks: Deck[]) => {
    const deckIds = loadedDecks.map((deck) => deck.id).filter(Boolean);
    if (deckIds.length === 0) {
      setDeckWinRates(new Map());
      setDeckPerformance(new Map());
      return;
    }

    try {
      const { data, error } = await supabase
        .from('match_participants')
        .select(`
          is_winner,
          deck_id,
          placement,
          life_lost,
          life_gained,
          life_damage_dealt,
          commander_damage_dealt,
          infect_dealt,
          eliminations_caused,
          group_damage_dealt,
          group_damage_events,
          matches (is_draw, duration_seconds, tracking_version)
        `)
        .in('deck_id', deckIds);

      if (error) throw error;

      const decksById = new Map(loadedDecks.map((deck) => [deck.id, deck]));
      type PerformanceMatch = { is_draw?: boolean | null; duration_seconds?: number | null; tracking_version?: number | null };
      const performanceRows = ((data || []) as Array<{
        is_winner: boolean;
        deck_id: string;
        placement?: number | null;
        life_lost?: number;
        life_gained?: number;
        life_damage_dealt?: number;
        commander_damage_dealt?: number;
        infect_dealt?: number;
        eliminations_caused?: number;
        group_damage_dealt?: number;
        group_damage_events?: number;
        matches?: PerformanceMatch | PerformanceMatch[] | null;
      }>).map((row): DeckPerformanceInputRow => {
        const deck = decksById.get(row.deck_id);
        const match = Array.isArray(row.matches) ? row.matches[0] : row.matches;
        return {
          deck_id: row.deck_id,
          guest_deck_id: null,
          deck_name: deck?.name || null,
          guest_deck_name: null,
          deck_commander: deck?.commander || null,
          guest_deck_commander: null,
          deck_commander_image: deck?.commander_image || null,
          guest_deck_commander_image: null,
          is_winner: row.is_winner,
          is_draw: Boolean(match?.is_draw),
          placement: row.placement ?? null,
          duration_seconds: match?.duration_seconds ?? null,
          tracking_version: match?.tracking_version ?? null,
          life_lost: row.life_lost || 0,
          life_gained: row.life_gained || 0,
          life_damage_dealt: row.life_damage_dealt || 0,
          commander_damage_dealt: row.commander_damage_dealt || 0,
          infect_dealt: row.infect_dealt || 0,
          eliminations_caused: row.eliminations_caused || 0,
          group_damage_dealt: row.group_damage_dealt || 0,
          group_damage_events: row.group_damage_events || 0,
        };
      });
      const performance = buildDeckPerformanceStats(performanceRows);
      setDeckPerformance(new Map(performance.map((entry) => [entry.deckId, entry])));
      setDeckWinRates(new Map(performance.map((entry) => [entry.deckId, entry])));
    } catch (error) {
      console.error('Error fetching deck win rates:', error);
      setDeckWinRates(new Map());
      setDeckPerformance(new Map());
    }
  }, []);

  const fetchDecks = useCallback(async () => {
    if (!user) return;

    try {
      const query = adminMode
        ? supabase
            .from('decks')
            .select(`${PROFILE_DECK_COLUMNS}, profiles:user_id (username, display_name)`)
            .is('group_id', null)
            .order('created_at', { ascending: false })
        : supabase
            .from('decks')
            .select(PROFILE_DECK_COLUMNS)
            .is('group_id', null)
            .eq('user_id', user!.id)
            .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      const loadedDecks = (data || []) as Deck[];
      setDecks(loadedDecks);
      void fetchDeckWinRates(loadedDecks);
      runWhenIdle(() => {
        void syncMissingDeckMetadata(loadedDecks).finally(() => {
          void syncMissingCommanderCmc();
        });
      }, { timeoutMs: 6000 });
    } catch (error) {
      console.error('Error fetching decks:', error);
    } finally {
      setLoading(false);
    }
  }, [adminMode, fetchDeckWinRates, syncMissingCommanderCmc, syncMissingDeckMetadata, user]);

  const visibleDecks = useMemo(() => {
    const activeDecks = decks.filter((deck) => !deck.is_archived);
    if (!adminMode || deckPlayerFilter === 'all') {
      return activeDecks;
    }

    return activeDecks.filter((deck) => deck.user_id === deckPlayerFilter);
  }, [adminMode, deckPlayerFilter, decks]);

  const archivedDecks = useMemo(() => decks.filter((deck) => deck.is_archived && deck.user_id === user?.id), [decks, user?.id]);

  const setDeckArchived = useCallback(async (deck: Deck, archived: boolean) => {
    if (!user || deck.user_id !== user.id || deck.group_id !== null) return;
    const { error } = await supabase.from('decks').update({ is_archived: archived })
      .eq('id', deck.id).eq('user_id', user.id).is('group_id', null);
    if (error) throw error;
    setDecks((current) => current.map((entry) => entry.id === deck.id ? { ...entry, is_archived: archived } : entry));
    toast({ title: t(archived ? { it: 'Mazzo archiviato', en: 'Deck archived' } : { it: 'Mazzo ripristinato', en: 'Deck restored' }) });
  }, [t, toast, user]);

  const filteredDecks = useMemo(() => {
    const normalizedQuery = deckSearchQuery.trim().toLowerCase();

    const matching = visibleDecks.filter((deck) => {
      if (deckColorFilter.length) {
        const colors = getDeckDisplayColors(deck);
        if (!deckColorFilter.every((color) => colors.includes(color))) {
          return false;
        }
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = `${deck.name} ${deck.commander}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    return matching.sort((left, right) => {
      const favoriteOrder = Number(right.is_favorite) - Number(left.is_favorite);
      if (favoriteOrder !== 0) return favoriteOrder;
      const a = deckPerformance.get(left.id);
      const b = deckPerformance.get(right.id);
      if (deckSort === 'winRate') return (b?.winRate || 0) - (a?.winRate || 0) || (b?.gamesPlayed || 0) - (a?.gamesPlayed || 0);
      if (deckSort === 'gamesPlayed') return (b?.gamesPlayed || 0) - (a?.gamesPlayed || 0);
      if (deckSort === 'damage') return (b?.totalDamageDealt || 0) - (a?.totalDamageDealt || 0);
      if (deckSort === 'eliminations') return (b?.eliminations || 0) - (a?.eliminations || 0);
      if (deckSort === 'fastest') {
        return (a?.medianWinningDurationSeconds ?? Number.MAX_SAFE_INTEGER)
          - (b?.medianWinningDurationSeconds ?? Number.MAX_SAFE_INTEGER);
      }
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  }, [deckColorFilter, deckPerformance, deckSearchQuery, deckSort, visibleDecks]);

  const personalSnapshot = useMemo(() => {
    const performances = visibleDecks.map((deck) => deckPerformance.get(deck.id)).filter((entry): entry is DeckPerformanceStats => Boolean(entry));
    const games = performances.reduce((total, entry) => total + entry.gamesPlayed, 0);
    const wins = performances.reduce((total, entry) => total + entry.wins, 0);
    const favorite = visibleDecks.find((deck) => deck.is_favorite) || visibleDecks[0];
    const mostPlayed = [...visibleDecks].sort((a, b) => (deckPerformance.get(b.id)?.gamesPlayed || 0) - (deckPerformance.get(a.id)?.gamesPlayed || 0))[0];
    return { games, wins, winRate: games ? Math.round((wins / games) * 100) : 0, favorite, mostPlayed };
  }, [deckPerformance, visibleDecks]);

  const toggleDeckFavorite = useCallback(async (deck: Deck) => {
    if (!user || deck.user_id !== user.id) return;
    const next = !deck.is_favorite;
    setDecks((current) => current.map((entry) => entry.id === deck.id ? { ...entry, is_favorite: next } : entry));
    const { error } = await supabase
      .from('decks')
      .update({ is_favorite: next })
      .eq('id', deck.id)
      .eq('user_id', user.id);
    if (error) {
      setDecks((current) => current.map((entry) => entry.id === deck.id ? { ...entry, is_favorite: !next } : entry));
      toast({
        title: t({ it: 'Preferito non aggiornato', en: 'Favorite not updated' }),
        variant: 'destructive',
      });
    }
  }, [t, toast, user]);

  const fetchProfiles = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, archidekt_username, archidekt_auto_import, archidekt_last_sync_at')
        .order('username', { ascending: true });

      if (error) throw error;
      const loadedProfiles = data || [];
      setProfiles(loadedProfiles);
      setProfileDisplayNameDrafts(loadedProfiles.reduce((drafts: Record<string, string>, profile) => {
        drafts[profile.id] = profile.display_name || '';
        return drafts;
      }, {}));
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Impossibile caricare i giocatori', en: 'Failed to load players' }),
        variant: 'destructive',
      });
    }
  }, [t, toast]);

  useEffect(() => {
    if (user) {
      fetchDecks();
      fetchProfiles();
    }
  }, [user, fetchDecks, fetchProfiles]);

  useEffect(() => {
    if (!currentProfile) return;
    const savedArchidektUsername = currentProfile.archidekt_username || '';
    setArchidektSettingsUsername(savedArchidektUsername);
    setArchidektUsername(savedArchidektUsername);
    setArchidektAutoImport(Boolean(currentProfile.archidekt_auto_import));
  }, [currentProfile]);

  const getTargetProfileId = () => {
    if (!user) return null;
    return adminMode ? selectedTargetProfileId || null : user.id;
  };

  const getTargetProfileName = () => {
    if (!adminMode) return null;
    return getProfileDisplayName(profiles.find((profile) => profile.id === selectedTargetProfileId));
  };

  const saveProfileDisplayName = async (profileId: string, nextDisplayName: string): Promise<boolean> => {
    const displayName = nextDisplayName.trim() || null;
    setSavingProfileDisplayNameIds((ids) => [...ids, profileId]);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', profileId);

      if (error) throw error;

      setProfiles((currentProfiles) => currentProfiles.map((profile) =>
        profile.id === profileId ? { ...profile, display_name: displayName } : profile
      ));
      setProfileDisplayNameDrafts((drafts) => ({ ...drafts, [profileId]: displayName || '' }));
      toast({ title: t({ it: 'Nick aggiornato', en: 'Nickname updated' }) });
      return true;
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: getSupabaseErrorMessage(error, t({ it: 'Impossibile salvare il nick', en: 'Failed to save nickname' })),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSavingProfileDisplayNameIds((ids) => ids.filter((id) => id !== profileId));
    }
  };

  const handleSaveOwnDisplayName = async () => {
    if (!user) return;
    setSavingDisplayName(true);
    try {
      const saved = await saveProfileDisplayName(user.id, displayNameDraft);
      if (saved) {
        setActiveAccountPanel(null);
      }
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleSaveArchidektSettings = async () => {
    if (!user) return;
    const username = archidektSettingsUsername.trim() || null;
    if (archidektAutoImport && !username) {
      toast({
        title: t({ it: 'Username richiesto', en: 'Username required' }),
        description: t({ it: 'Inserisci il tuo username Archidekt per abilitare il controllo automatico.', en: 'Enter your Archidekt username to enable automatic checks.' }),
        variant: 'destructive',
      });
      return;
    }

    setSavingArchidektSettings(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          archidekt_username: username,
          archidekt_auto_import: archidektAutoImport,
        })
        .eq('id', user.id);
      if (error) throw error;

      setProfiles((current) => current.map((profile) => profile.id === user.id ? {
        ...profile,
        archidekt_username: username,
        archidekt_auto_import: archidektAutoImport,
      } : profile));
      setArchidektUsername(username || '');
      toast({ title: t({ it: 'Archidekt configurato', en: 'Archidekt configured' }) });
    } catch (error) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: getSupabaseErrorMessage(error, t({ it: 'Impossibile salvare le impostazioni Archidekt.', en: 'Unable to save Archidekt settings.' })),
        variant: 'destructive',
      });
    } finally {
      setSavingArchidektSettings(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Email account non disponibile.', en: 'Account email is unavailable.' }),
        variant: 'destructive',
      });
      return;
    }

    if (!isPasswordPolicyValid(newPassword)) {
      toast({
        title: t({ it: 'Password troppo debole', en: 'Password too weak' }),
        description: t({
          it: 'La nuova password non rispetta i requisiti di sicurezza.',
          en: 'The new password does not meet the security requirements.',
        }),
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Le password non coincidono.', en: 'Passwords do not match.' }),
        variant: 'destructive',
      });
      return;
    }

    setSavingPassword(true);

    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (verifyError) {
        throw new Error(t({ it: 'Password attuale non corretta.', en: 'Current password is incorrect.' }));
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        throw updateError;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');

      toast({
        title: t({ it: 'Password aggiornata', en: 'Password updated' }),
        description: t({
          it: 'La tua password è stata cambiata con successo.',
          en: 'Your password was changed successfully.',
        }),
      });
      setActiveAccountPanel(null);
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error
          ? error.message
          : t({ it: 'Impossibile aggiornare la password.', en: 'Unable to update password.' }),
        variant: 'destructive',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const exportAccountData = async () => {
    setExportingAccount(true);
    try {
      const response = await authenticatedFetch('/api/auth/export-account');
      if (!response.ok) throw new Error(t({ it: 'Export non riuscito.', en: 'Export failed.' }));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mtg-tracker-account-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: t({ it: 'Dati account esportati', en: 'Account data exported' }) });
    } catch (error) {
      toast({ title: t({ it: 'Errore', en: 'Error' }), description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setExportingAccount(false);
    }
  };

  const refreshImportedDeck = async (deck: Deck) => {
    if (deck.source_type === 'manual' || !deck.source_url) return null;

    const response = await authenticatedFetch('/api/deck-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: deck.source_url, fresh: true }),
    });

    if (!response.ok) return null;

    const imported = await response.json() as ImportedDeckPreview;
    const importedCommanderOptions = imported.commanderOptions || [];
    const currentCommanderStillAvailable = importedCommanderOptions.some((option) =>
      option.name.toLowerCase() === deck.commander.toLowerCase()
    );
    const refreshedCommander = currentCommanderStillAvailable
      ? deck.commander
      : imported.commander || deck.commander;
    const refreshedCommanderOption = importedCommanderOptions.find((option) =>
      option.name.toLowerCase() === refreshedCommander.toLowerCase()
    );
    const colorFields = deckDataToColorFields({
      commanderOptions: importedCommanderOptions,
      colorIdentity: imported.colorIdentity || [],
    });
    const commanderCmc = await resolveDeckCommanderCmc(
      {
        commander: refreshedCommander,
        commander_options: colorFields.commander_options,
      },
      lookupCommanderCmcInBrowser,
    );
    const refreshedDeck = {
      name: imported.name || deck.name,
      commander: refreshedCommander,
      commander_image: currentCommanderStillAvailable
        ? deck.commander_image || refreshedCommanderOption?.imageUrl || imported.commanderImageUrl || null
        : refreshedCommanderOption?.imageUrl || imported.commanderImageUrl || deck.commander_image,
      bracket: typeof imported.bracket === 'string' ? imported.bracket : null,
      commander_cmc: commanderCmc ?? deck.commander_cmc,
      ...colorFields,
    };

    const { error } = await supabase
      .from('decks')
      .update(refreshedDeck)
      .eq('id', deck.id);

    if (error) return null;
    return { id: deck.id, ...refreshedDeck };
  };

  const handleRefreshImportedDeck = async (deck: Deck) => {
    setRefreshingDeckIds((ids) => [...ids, deck.id]);
    try {
      const update = await refreshImportedDeck(deck);
      if (!update) {
        toast({
          title: t({ it: 'Mazzo non aggiornato', en: 'Deck not refreshed' }),
          description: t({ it: 'La fonte non ha restituito dati aggiornati.', en: 'The source did not return updated data.' }),
        });
        return;
      }

      setDecks((currentDecks) => currentDecks.map((currentDeck) =>
        currentDeck.id === deck.id ? { ...currentDeck, ...update } : currentDeck
      ));
      toast({
        title: t({ it: 'Mazzo aggiornato', en: 'Deck refreshed' }),
        description: update.name,
      });
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error ? error.message : t({ it: 'Aggiornamento mazzo non riuscito', en: 'Failed to refresh deck' }),
        variant: 'destructive',
      });
    } finally {
      setRefreshingDeckIds((ids) => ids.filter((id) => id !== deck.id));
    }
  };

  const handleLinkDeckToExternalSource = async () => {
    if (!linkingDeck || !linkDeckUrl.trim()) return;
    setSavingDeckLink(true);
    try {
      const response = await authenticatedFetch('/api/deck-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkDeckUrl }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || t({ it: 'Link non valido.', en: 'Invalid link.' }));
      }

      const imported = await response.json() as ImportedDeckPreview;
      if (!isImportedDeckSource(imported.sourceType) || !imported.sourceUrl) {
        throw new Error(t({ it: 'Sono supportati solo Archidekt e Moxfield.', en: 'Only Archidekt and Moxfield are supported.' }));
      }
      const duplicate = decks.find((deck) =>
        deck.id !== linkingDeck.id
        && deck.user_id === linkingDeck.user_id
        && deck.source_url === imported.sourceUrl,
      );
      if (duplicate) {
        throw new Error(t({ it: 'Questa lista e gia collegata a un altro tuo mazzo.', en: 'This list is already linked to another one of your decks.' }));
      }

      const colorFields = deckDataToColorFields({
        commanderOptions: imported.commanderOptions || [],
        colorIdentity: imported.colorIdentity || [],
      });
      const commanderCmc = await resolveDeckCommanderCmc(
        { commander: linkingDeck.commander, commander_options: colorFields.commander_options },
        lookupCommanderCmcInBrowser,
      );
      const update = {
        source_url: imported.sourceUrl,
        source_type: imported.sourceType,
        bracket: imported.bracket,
        commander_cmc: commanderCmc ?? linkingDeck.commander_cmc,
        ...colorFields,
      };
      const { error } = await supabase.from('decks').update(update).eq('id', linkingDeck.id);
      if (error) throw error;

      setDecks((current) => current.map((deck) => deck.id === linkingDeck.id ? { ...deck, ...update } : deck));
      setLinkingDeck(null);
      setLinkDeckUrl('');
      toast({
        title: t({ it: 'Lista collegata', en: 'List linked' }),
        description: t({ it: 'Il mazzo manterra comandante e nome; da ora puo aggiornarsi dalla sorgente.', en: 'The deck keeps its commander and name; it can now refresh from its source.' }),
      });
    } catch (error) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: getSupabaseErrorMessage(error, t({ it: 'Impossibile collegare la lista.', en: 'Unable to link the list.' })),
        variant: 'destructive',
      });
    } finally {
      setSavingDeckLink(false);
    }
  };

  const deckNeedsRefreshWork = useCallback((deck: Deck) => {
    const needsImportRefresh = isImportedDeckSource(deck.source_type) && Boolean(deck.source_url);
    const needsEdhrecRefresh = Boolean(deck.commander?.trim()) && !hasFreshEdhrecBadge(deck.commander);
    return needsImportRefresh || needsEdhrecRefresh;
  }, []);

  const consumeDeckRefreshBudget = useCallback(async () => {
    const response = await fetch('/api/profile/deck-refresh-budget', { method: 'POST' });
    return response.ok;
  }, []);

  const handleRefreshDecks = async () => {
    const decksToRefresh = visibleDecks.filter(deckNeedsRefreshWork);
    if (decksToRefresh.length === 0) {
      toast({
        title: t({ it: 'Nessun aggiornamento necessario', en: 'No refresh needed' }),
        description: t({
          it: 'Tutti i mazzi visibili hanno già dati import e badge EDHREC aggiornati.',
          en: 'All visible decks already have up-to-date import data and EDHREC badges.',
        }),
      });
      return;
    }

    setRefreshingDecks(true);
    setRefreshingDeckIds(decksToRefresh.map((deck) => deck.id));

    let importedUpdates = 0;
    let edhrecUpdates = 0;
    let rateLimited = false;

    try {
      const results = await runTasksWithConcurrency(decksToRefresh, 2, async (deck) => {
        const hasBudget = await consumeDeckRefreshBudget();
        if (!hasBudget) {
          rateLimited = true;
          return null;
        }

        let commander = deck.commander;
        let deckUpdate: Awaited<ReturnType<typeof refreshImportedDeck>> = null;
        let edhrecRefreshed = false;

        if (isImportedDeckSource(deck.source_type) && deck.source_url) {
          deckUpdate = await refreshImportedDeck(deck);
          if (deckUpdate?.commander) {
            commander = deckUpdate.commander;
          }
        }

        if (commander?.trim() && !hasFreshEdhrecBadge(commander)) {
          const stats = await prefetchEdhrecStats(commander);
          if (stats) {
            edhrecRefreshed = true;
          }
        }

        return {
          deckId: deck.id,
          update: deckUpdate,
          imported: Boolean(deckUpdate),
          edhrecRefreshed,
        };
      });

      const successfulResults = results.filter((result): result is NonNullable<typeof result> => Boolean(result));
      const successfulUpdates = successfulResults
        .map((result) => result.update)
        .filter((update): update is NonNullable<typeof update> => Boolean(update));

      importedUpdates = successfulResults.filter((result) => result.imported).length;
      edhrecUpdates = successfulResults.filter((result) => result.edhrecRefreshed).length;

      if (successfulUpdates.length > 0) {
        setDecks((currentDecks) => currentDecks.map((deck) => {
          const update = successfulUpdates.find((item) => item.id === deck.id);
          return update ? { ...deck, ...update } : deck;
        }));
      }

      if (importedUpdates === 0 && edhrecUpdates === 0) {
        toast({
          title: t({ it: 'Nessun mazzo aggiornato', en: 'No decks updated' }),
          description: rateLimited
            ? t({
              it: 'Limite raggiunto: massimo 200 mazzi ogni 10 minuti.',
              en: 'Rate limit reached: maximum 200 decks every 10 minutes.',
            })
            : t({ it: 'Le fonti non hanno restituito nuovi dati.', en: 'The sources did not return updated data.' }),
          variant: rateLimited ? 'destructive' : 'default',
        });
        return;
      }

      toast({
        title: t({ it: 'Aggiornamento completato', en: 'Refresh completed' }),
        description: t({
          it: `${importedUpdates} import, ${edhrecUpdates} EDHREC${rateLimited ? ' · limite 200/10 min raggiunto per i restanti' : ''}`,
          en: `${importedUpdates} imports, ${edhrecUpdates} EDHREC${rateLimited ? ' · 200/10 min limit reached for remaining decks' : ''}`,
        }),
      });
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error ? error.message : t({ it: 'Aggiornamento mazzi non riuscito', en: 'Failed to refresh decks' }),
        variant: 'destructive',
      });
    } finally {
      setRefreshingDecks(false);
      setRefreshingDeckIds([]);
    }
  };

  const handleUrlImport = async () => {
    if (!importDeckUrl.trim()) return;

    setImportingDeck(true);
    try {
      const response = await authenticatedFetch('/api/deck-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importDeckUrl }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t({ it: 'Importazione mazzo non riuscita', en: 'Failed to import deck' }));
      }

      const imported = await normalizeImportedDeckPreview(await response.json() as ImportedDeckPreview);
      const defaultCommander = getDefaultImportedCommanderOption(imported);
      setImportedDeck(imported);
      setSelectedImportedCommander(defaultCommander);
      void loadImportedCommanderArts(defaultCommander);
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error ? error.message : t({ it: 'Importazione mazzo non riuscita', en: 'Failed to import deck' }),
        variant: 'destructive',
      });
    } finally {
      setImportingDeck(false);
    }
  };

  const handleArchidektUserImport = async () => {
    if (!archidektUsername.trim()) return;

    setImportingUserDecks(true);
    try {
      const response = await authenticatedFetch('/api/archidekt-user-decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: archidektUsername }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t({ it: 'Importazione mazzi non riuscita', en: 'Failed to import decks' }));
      }

      const data = await response.json();
      const validDecks = await Promise.all(
        (Array.isArray(data.decks) ? data.decks : [])
          .filter((deck: ImportedDeckPreview) => Boolean(deck.sourceUrl && deck.sourceType))
          .map((deck: ImportedDeckPreview) => normalizeImportedDeckPreview(deck)),
      );
      const initialSelections = buildArchidektBatchCommanderSelections(validDecks);

      setImportedUserDecks(validDecks);
      setSelectedUserDeckCommanders(initialSelections);
      setSelectedUserDeckUrls(validDecks.map((deck: ImportedDeckPreview) => deck.sourceUrl));

      if (validDecks.length === 0) {
        toast({
          title: t({ it: 'Nessun mazzo pubblico trovato', en: 'No public decks found' }),
          description: t({ it: 'Archidekt non ha restituito mazzi Commander pubblici per questo utente.', en: 'Archidekt did not return public Commander decks for this user.' }),
        });
      }
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error ? error.message : t({ it: 'Importazione mazzi non riuscita', en: 'Failed to import decks' }),
        variant: 'destructive',
      });
    } finally {
      setImportingUserDecks(false);
    }
  };

  const searchCommanders = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    commanderSearchAbortRef.current?.abort();
    const controller = new AbortController();
    commanderSearchAbortRef.current = controller;

    setSearching(true);
    try {
      const results = await fetchCommanderSearchResults(query, null, controller.signal);
      if (controller.signal.aborted) return;
      setSearchResults(results);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Ricerca comandanti non riuscita', en: 'Failed to search commanders' }),
        variant: 'destructive',
      });
    } finally {
      if (commanderSearchAbortRef.current === controller) {
        setSearching(false);
      }
    }
  }, [t, toast]);

  const searchPartnerCommanders = useCallback(async (query: string, partnerMode: ManualPartnerMode | null, primaryCommander: CommanderSearchResult | null) => {
    if (query.length < 2 || !partnerMode || !primaryCommander) {
      setPartnerSearchResults([]);
      return;
    }

    partnerSearchAbortRef.current?.abort();
    const controller = new AbortController();
    partnerSearchAbortRef.current = controller;

    setSearchingPartner(true);
    try {
      const results = await fetchCommanderSearchResults(query, partnerMode, controller.signal);
      if (controller.signal.aborted) return;
      setPartnerSearchResults(results.filter((result) => result.name.toLowerCase() !== primaryCommander.name.toLowerCase()));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Ricerca secondo comandante non riuscita', en: 'Failed to search second commander' }),
        variant: 'destructive',
      });
    } finally {
      if (partnerSearchAbortRef.current === controller) {
        setSearchingPartner(false);
      }
    }
  }, [t, toast]);

  const fetchCommanderArts = async (commanderName: string) => {
    try {
      const arts = await fetchScryfallArtOptionsFromBrowser(commanderName);
      if (arts.length > 0) return arts;
    } catch {
      // Fall back to the server route below.
    }

    const response = await authenticatedFetch(`/api/scryfall-card-arts?name=${encodeURIComponent(commanderName)}`);
    if (!response.ok) throw new Error(t({ it: 'Ricerca art non riuscita', en: 'Art search failed' }));

    const data = await response.json();
    return Array.isArray(data.data) ? data.data as CommanderArtOption[] : [];
  };

  const loadManualCommanderArts = async (commanderName: string, fallbackImageUrl: string | null) => {
    setLoadingManualCommanderArts(true);
    try {
      const arts = await fetchCommanderArts(commanderName);
      setManualCommanderArts(arts);
      const firstArt = arts[0];
      if (firstArt) {
        setSelectedCommander((current) => current ? { ...current, imageUrl: firstArt.imageUrl } : current);
      } else if (fallbackImageUrl) {
        setManualCommanderArts([{
          id: 'current',
          name: commanderName,
          imageUrl: fallbackImageUrl,
          setName: t({ it: 'Art corrente', en: 'Current art' }),
          collectorNumber: '',
          releasedAt: null,
        }]);
      }
    } catch {
      setManualCommanderArts(fallbackImageUrl ? [{
        id: 'current',
        name: commanderName,
        imageUrl: fallbackImageUrl,
        setName: t({ it: 'Art corrente', en: 'Current art' }),
        collectorNumber: '',
        releasedAt: null,
      }] : []);
    } finally {
      setLoadingManualCommanderArts(false);
    }
  };

  const loadImportedCommanderArts = async (commander: ImportedCommanderOption) => {
    setLoadingImportedCommanderArts(true);
    try {
      const arts = await fetchCommanderArts(commander.name);
      setImportedCommanderArts(arts);
      setSelectedImportedCommander(resolveImportedCommanderAfterArtsLoad(commander, arts));
    } catch {
      setImportedCommanderArts(commander.imageUrl ? [{
        id: 'current',
        name: commander.name,
        imageUrl: commander.imageUrl,
        setName: t({ it: 'Art corrente', en: 'Current art' }),
        collectorNumber: '',
        releasedAt: null,
      }] : []);
      setSelectedImportedCommander(commander);
    } finally {
      setLoadingImportedCommanderArts(false);
    }
  };

  useEffect(() => {
    deckMetadataSyncAbortRef.current = showAddModal;
    if (showAddModal) {
      commanderSearchAbortRef.current?.abort();
      partnerSearchAbortRef.current?.abort();
    }
  }, [showAddModal]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchCommanders(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, searchCommanders]);

  useEffect(() => {
    const partnerMode = selectedCommander ? getManualPartnerMode(selectedCommander) : null;
    const timer = setTimeout(() => {
      if (selectedPartnerCommander && partnerSearchQuery === selectedPartnerCommander.name) {
        setPartnerSearchResults([]);
        return;
      }

      if (partnerSearchQuery) {
        searchPartnerCommanders(partnerSearchQuery, partnerMode, selectedCommander);
      } else {
        setPartnerSearchResults([]);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [partnerSearchQuery, selectedCommander, selectedPartnerCommander, searchPartnerCommanders]);

  const handleSelectCommander = (commander: CommanderSearchResult) => {
    setSelectedCommander(commander);
    setCustomDeckName(commander.name);
    setPartnerSearchQuery('');
    setPartnerSearchResults([]);
    setSelectedPartnerCommander(null);
    setManualCommanderArts([]);
    void loadManualCommanderArts(commander.name, commander.imageUrl);
  };

  const loadDeckCommanderArts = async (commanderName: string, fallbackImageUrl: string | null) => {
    setDeckArtOptions([]);
    setLoadingDeckArtOptions(true);
    try {
      const arts = await fetchCommanderArts(commanderName);
      const currentArt = fallbackImageUrl
        ? [{
            id: 'current',
            name: commanderName,
            imageUrl: fallbackImageUrl,
            setName: t({ it: 'Art corrente', en: 'Current art' }),
            collectorNumber: '',
            releasedAt: null,
          }]
        : [];
      const uniqueArts = [...currentArt, ...arts].filter((art, index, allArts) =>
        allArts.findIndex((candidate) => candidate.imageUrl === art.imageUrl) === index
      );
      setDeckArtOptions(uniqueArts);
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error ? error.message : t({ it: 'Impossibile caricare le art', en: 'Failed to load arts' }),
        variant: 'destructive',
      });
    } finally {
      setLoadingDeckArtOptions(false);
    }
  };

  const openDeckArtEditor = async (deck: Deck) => {
    const currentCommander = { name: deck.commander, imageUrl: deck.commander_image };
    setEditingArtDeck(deck);

    let loadedOptions = [currentCommander];
    const storedOptions = getCommanderOptions(deck);
    if (storedOptions.length > 0) {
      loadedOptions = uniqueCommanderOptions([currentCommander, ...storedOptions]);
    } else if (isImportedDeckSource(deck.source_type) && deck.source_url) {
      try {
        const response = await authenticatedFetch('/api/deck-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: deck.source_url }),
        });

        if (response.ok) {
          const imported = await response.json() as ImportedDeckPreview;
          const importedOptions = imported.commanderOptions || [];
          if (importedOptions.length > 0) {
            loadedOptions = uniqueCommanderOptions([currentCommander, ...importedOptions]);
          }
        }
      } catch {
        loadedOptions = [currentCommander];
      }
    }

    const selectableOptions = filterSelectableCommanderOptions(loadedOptions);
    const selectedCommander = resolveSelectedCommanderOption(
      selectableOptions,
      deck.commander,
      deck.commander_image,
    ) || currentCommander;

    setDeckCommanderOptions(selectableOptions);
    setSelectedDeckCommander(selectedCommander);
    void loadDeckCommanderArts(selectedCommander.name, selectedCommander.imageUrl);
  };

  const saveDeckCommanderPresentation = async (commanderName: string, imageUrl: string | null) => {
    if (!editingArtDeck) return;

    setSavingDeckArt(true);
    try {
      const colorFields = mergeDeckColorFields(editingArtDeck, deckCommanderOptions);
      const commanderCmc = await resolveDeckCommanderCmc(
        { commander: commanderName, commander_options: colorFields.commander_options },
        lookupCommanderCmcInBrowser,
      );
      const { error } = await supabase
        .from('decks')
        .update({
          commander: commanderName,
          commander_image: imageUrl,
          commander_cmc: commanderCmc,
          ...colorFields,
        })
        .eq('id', editingArtDeck.id);

      if (error) throw error;

      setDecks((currentDecks) => currentDecks.map((deck) =>
        deck.id === editingArtDeck.id
          ? {
              ...deck,
              commander: commanderName,
              commander_image: imageUrl,
              commander_cmc: commanderCmc,
              ...colorFields,
            }
          : deck
      ));
      setEditingArtDeck(null);
      setSelectedDeckCommander(null);
      setDeckCommanderOptions([]);
      setDeckArtOptions([]);
      toast({ title: t({ it: 'Comandante aggiornato', en: 'Commander updated' }) });
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: getSupabaseErrorMessage(error, t({ it: 'Impossibile salvare il comandante', en: 'Failed to save commander' })),
        variant: 'destructive',
      });
    } finally {
      setSavingDeckArt(false);
    }
  };

  const closeOverwriteConfirm = (value: boolean | 'overwrite' | 'skip' | 'cancel') => {
    overwriteResolver.current?.(value);
    overwriteResolver.current = null;
    setOverwriteConfirm(null);
  };

  const confirmOverwriteSingle = () => new Promise<boolean>((resolve) => {
    overwriteResolver.current = (value) => resolve(value === true);
    setOverwriteConfirm({ kind: 'single' });
  });

  const confirmOverwriteBulk = (count: number) => new Promise<'overwrite' | 'skip' | 'cancel'>((resolve) => {
    overwriteResolver.current = (value) => {
      if (value === 'overwrite' || value === 'skip' || value === 'cancel') {
        resolve(value);
        return;
      }
      resolve('cancel');
    };
    setOverwriteConfirm({ kind: 'bulk', count });
  });

  const saveArchidektDeck = async () => {
    const targetProfileId = getTargetProfileId();
    if (!importedDeck || !targetProfileId) return;

    const existingDeck = decks.find((deck) =>
      deck.user_id === targetProfileId && deck.source_url === importedDeck.sourceUrl
    );

    if (existingDeck) {
      const overwrite = await confirmOverwriteSingle();
      if (!overwrite) return;
    }

    setSavingDeck(true);
    try {
      const colorFields = deckDataToColorFields({
        commanderOptions: importedDeck.commanderOptions || [],
        colorIdentity: importedDeck.colorIdentity || [],
      });
      const selectedCommander = selectedImportedCommander || getDefaultImportedCommanderOption(importedDeck);
      const commander = selectedCommander.name || importedDeck.commander;
      const commanderCmc = await resolveDeckCommanderCmc(
        { commander, commander_options: colorFields.commander_options },
        lookupCommanderCmcInBrowser,
      );
      const commanderImage = await resolveImportedDeckCommanderImageForSave(
        selectedCommander,
        importedDeck,
        existingDeck?.commander_image,
      );
      const payload = {
        name: importedDeck.name,
        commander,
        commander_image: commanderImage,
        source_url: importedDeck.sourceUrl,
        source_type: importedDeck.sourceType,
        bracket: importedDeck.bracket,
        commander_cmc: commanderCmc,
        ...colorFields,
      };

      const { error } = existingDeck
        ? await supabase.from('decks').update(payload).eq('id', existingDeck.id)
        : await supabase.from('decks').insert({
          user_id: targetProfileId,
          group_id: null,
          ...payload,
        });

      if (error) throw error;

      toast({
        title: t({ it: existingDeck ? 'Mazzo aggiornato!' : 'Mazzo aggiunto!', en: existingDeck ? 'Deck updated!' : 'Deck added!' }),
        description: adminMode && getTargetProfileName()
          ? `${importedDeck.name} - ${getTargetProfileName()}`
          : importedDeck.name,
      });
      closeAddModal();
      fetchDecks();
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: getSupabaseErrorMessage(error, t({ it: 'Salvataggio mazzo non riuscito', en: 'Failed to save deck' })),
        variant: 'destructive',
      });
    } finally {
      setSavingDeck(false);
    }
  };

  const saveArchidektUserDecks = async () => {
    const targetProfileId = getTargetProfileId();
    if (!targetProfileId || importedUserDecks.length === 0) return;

    const existingByUrl = new Map(
      decks
        .filter((deck) => deck.user_id === targetProfileId && deck.source_url)
        .map((deck) => [deck.source_url as string, deck]),
    );
    const selectedDecks = importedUserDecks.filter((deck) => selectedUserDeckUrls.includes(deck.sourceUrl));
    const duplicateCount = selectedDecks.filter((deck) => existingByUrl.has(deck.sourceUrl)).length;
    let overwriteExisting = false;

    if (duplicateCount > 0) {
      const choice = await confirmOverwriteBulk(duplicateCount);
      if (choice === 'cancel') return;
      overwriteExisting = choice === 'overwrite';
    }

    const decksToInsert = [];
    const decksToUpdate: Array<{ id: string; payload: Record<string, unknown> }> = [];

    for (const deck of selectedDecks) {
      const selectedCommander = selectedUserDeckCommanders[deck.sourceUrl] || getDefaultImportedCommanderOption(deck);
      const colorFields = deckDataToColorFields({
        commanderOptions: deck.commanderOptions || [],
        colorIdentity: deck.colorIdentity || [],
      });
      const commanderCmc = await resolveDeckCommanderCmc(
        { commander: selectedCommander.name, commander_options: colorFields.commander_options },
        lookupCommanderCmcInBrowser,
      );
      const existingDeck = existingByUrl.get(deck.sourceUrl);
      const commanderImage = await resolveImportedDeckCommanderImageForSave(
        selectedCommander,
        deck,
        existingDeck?.commander_image,
      );
      const payload = {
        name: deck.name,
        commander: selectedCommander.name,
        commander_image: commanderImage,
        source_url: deck.sourceUrl,
        source_type: deck.sourceType,
        bracket: deck.bracket,
        commander_cmc: commanderCmc,
        ...colorFields,
      };
      if (existingDeck) {
        if (overwriteExisting) {
          decksToUpdate.push({ id: existingDeck.id, payload });
        }
      } else {
        decksToInsert.push({
          user_id: targetProfileId,
          group_id: null,
          ...payload,
        });
      }

      await delay(SCRYFALL_REQUEST_GAP_MS);
    }

    if (decksToInsert.length === 0 && decksToUpdate.length === 0) {
      toast({
        title: t({ it: 'Nessun nuovo mazzo', en: 'No new decks' }),
        description: t({ it: 'I mazzi pubblici trovati sono gia presenti in quel profilo.', en: 'The public decks found are already saved in that profile.' }),
      });
      return;
    }

    setSavingUserDecks(true);
    try {
      if (targetProfileId === user?.id) {
        const { error } = await supabase.rpc('sync_archidekt_decks', {
          p_decks: [
            ...decksToInsert,
            ...decksToUpdate.map((entry) => entry.payload),
          ],
        });
        if (error) throw error;
      } else {
        if (decksToInsert.length > 0) {
          const { error } = await supabase.from('decks').insert(decksToInsert);
          if (error) throw error;
        }
        for (const deckUpdate of decksToUpdate) {
          const { error } = await supabase.from('decks').update(deckUpdate.payload).eq('id', deckUpdate.id);
          if (error) throw error;
        }
      }

      toast({
        title: t({ it: 'Mazzi importati!', en: 'Decks imported!' }),
        description: t({
          it: decksToUpdate.length > 0
            ? `${decksToInsert.length} aggiunti · ${decksToUpdate.length} aggiornati`
            : `${decksToInsert.length} ${decksToInsert.length === 1 ? 'mazzo aggiunto' : 'mazzi aggiunti'} al profilo.`,
          en: decksToUpdate.length > 0
            ? `${decksToInsert.length} added · ${decksToUpdate.length} updated`
            : `${decksToInsert.length} ${decksToInsert.length === 1 ? 'deck added' : 'decks added'} to your profile.`,
        }),
      });
      closeAddModal();
      fetchDecks();
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: getSupabaseErrorMessage(error, t({ it: 'Salvataggio mazzi non riuscito', en: 'Failed to save decks' })),
        variant: 'destructive',
      });
    } finally {
      setSavingUserDecks(false);
    }
  };

  const autoImportArchidektDecks = useCallback(async (username: string) => {
    if (!user) return;
    try {
      const response = await authenticatedFetch('/api/archidekt-user-decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!response.ok) return;

      const payload = await response.json() as { decks?: ImportedDeckPreview[] };
      const candidates = (payload.decks || []).filter((deck) =>
        deck.sourceType === 'archidekt'
        && deck.sourceUrl
        && !deck.warning
        && !deck.error
        && Boolean(deck.commander?.trim()),
      );
      const rows = [];
      for (const rawDeck of candidates) {
        const deck = await normalizeImportedDeckPreview(rawDeck);
        const commander = getDefaultImportedCommanderOption(deck);
        const colorFields = deckDataToColorFields({
          commanderOptions: deck.commanderOptions || [],
          colorIdentity: deck.colorIdentity || [],
        });
        const commanderCmc = await resolveDeckCommanderCmc(
          { commander: commander.name, commander_options: colorFields.commander_options },
          lookupCommanderCmcInBrowser,
        );
        const commanderImage = await resolveImportedDeckCommanderImageForSave(commander, deck);
        rows.push({
          user_id: user.id,
          group_id: null,
          name: deck.name,
          commander: commander.name,
          commander_image: commanderImage,
          source_url: deck.sourceUrl,
          source_type: 'archidekt',
          bracket: deck.bracket,
          commander_cmc: commanderCmc,
          ...colorFields,
        });
        await delay(SCRYFALL_REQUEST_GAP_MS);
      }
      if (rows.length > 0) {
        const { error } = await supabase.rpc('sync_archidekt_decks', { p_decks: rows });
        if (error) throw error;
        await fetchDecks();
      }
    } catch {
      // Background sync must not interrupt profile use.
    }
  }, [fetchDecks, user]);

  useEffect(() => {
    const username = currentProfile?.archidekt_username?.trim();
    if (!user || !currentProfile?.archidekt_auto_import || !username || archidektAutoImportStartedRef.current) return;
    archidektAutoImportStartedRef.current = true;
    void autoImportArchidektDecks(username);
  }, [autoImportArchidektDecks, currentProfile?.archidekt_auto_import, currentProfile?.archidekt_username, user]);

  const saveManualDeck = async () => {
    const targetProfileId = getTargetProfileId();
    if (!selectedCommander || !targetProfileId) return;

    setSavingDeck(true);
    try {
      const commanderDisplayName = selectedPartnerCommander
        ? `${selectedCommander.name} // ${selectedPartnerCommander.name}`
        : selectedCommander.name;
      const colorFields = manualDeckColorFields(selectedCommander, selectedPartnerCommander);
      const commanderCmc = await resolveDeckCommanderCmc(
        { commander: commanderDisplayName, commander_options: colorFields.commander_options },
        lookupCommanderCmcInBrowser,
      );
      const { error } = await supabase.from('decks').insert({
        user_id: targetProfileId,
        group_id: null,
        name: customDeckName || commanderDisplayName,
        commander: commanderDisplayName,
        commander_image: selectedCommander.imageUrl,
        source_url: null,
        source_type: 'manual',
        bracket: null,
        commander_cmc: commanderCmc,
        ...colorFields,
      });

      if (error) throw error;

      toast({
        title: t({ it: 'Mazzo creato!', en: 'Deck created!' }),
        description: adminMode && getTargetProfileName()
          ? `${customDeckName || commanderDisplayName} - ${getTargetProfileName()}`
          : customDeckName || commanderDisplayName,
      });
      closeAddModal();
      fetchDecks();
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: getSupabaseErrorMessage(error, t({ it: 'Salvataggio mazzo non riuscito', en: 'Failed to save deck' })),
        variant: 'destructive',
      });
    } finally {
      setSavingDeck(false);
    }
  };

  const handleDeleteDeck = async (deckId: string, deckName: string) => {
    if (!confirm(t({
      it: `Eliminare "${deckName}"?`,
      en: `Are you sure you want to delete "${deckName}"?`,
    }))) return;

    try {
      const { error } = await supabase.from('decks').delete().eq('id', deckId);
      if (error) throw error;

      toast({ title: t({ it: 'Mazzo eliminato', en: 'Deck deleted' }) });
      fetchDecks();
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error ? error.message : t({ it: 'Eliminazione mazzo non riuscita', en: 'Failed to delete deck' }),
        variant: 'destructive',
      });
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddMode('choose');
    setImportDeckUrl('');
    setImportedDeck(null);
    setSelectedImportedCommander(null);
    setImportedCommanderArts([]);
    setLoadingImportedCommanderArts(false);
    setArchidektUsername(currentProfile?.archidekt_username || '');
    setImportedUserDecks([]);
    setSelectedUserDeckCommanders({});
    setSelectedUserDeckUrls([]);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedCommander(null);
    setPartnerSearchQuery('');
    setPartnerSearchResults([]);
    setSelectedPartnerCommander(null);
    setSearchingPartner(false);
    setManualCommanderArts([]);
    setLoadingManualCommanderArts(false);
    setCustomDeckName('');
  };

  const getSourceBadge = (sourceType: string | null) => {
    if (sourceType === 'archidekt') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
          Archidekt
        </span>
      );
    }
    if (sourceType === 'moxfield') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/20 px-2 py-0.5 text-xs text-teal-300">
          Moxfield
        </span>
      );
    }
    return null;
  };

  const getSourceLinkLabel = (sourceType: string | null) => {
    if (sourceType === 'moxfield') return t({ it: 'Vedi su Moxfield', en: 'View on Moxfield' });
    if (sourceType === 'archidekt') return t({ it: 'Vedi su Archidekt', en: 'View on Archidekt' });
    return t({ it: 'Vedi sorgente', en: 'View source' });
  };

  const getDeckWinRateBadge = (deckId: string) => {
    const stats = deckWinRates.get(deckId);
    if (!stats || stats.gamesPlayed === 0) return null;

    return (
      <span
        title={t({
          it: `${stats.wins} vittorie su ${stats.gamesPlayed} partite`,
          en: `${stats.wins} wins in ${stats.gamesPlayed} games`,
        })}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200"
      >
        <Trophy className="h-3 w-3" />
        {stats.winRate}%
        <span className="opacity-75">· {formatMatchRecord(stats)}</span>
      </span>
    );
  };

  const renderCommanderArtPicker = (
    arts: CommanderArtOption[],
    selectedImageUrl: string | null | undefined,
    onSelect: (art: CommanderArtOption) => void,
    loadingArts: boolean
  ) => (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        {t({ it: 'Scegli art comandante', en: 'Choose commander art' })}
      </p>
      {loadingArts ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/35 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t({ it: 'Caricamento art...', en: 'Loading arts...' })}
        </div>
      ) : arts.length > 0 ? (
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-flow-col auto-cols-[132px] gap-3">
            {arts.map((art) => {
              const selected = selectedImageUrl === art.imageUrl;
              return (
                <button
                  key={`${art.id}-${art.imageUrl}`}
                  type="button"
                  onClick={() => onSelect(art)}
                  className={`rounded-lg border p-2 text-left transition-colors ${
                    selected ? 'border-emerald-500 bg-emerald-500/10' : 'border-border bg-background/25 hover:border-emerald-500/50'
                  }`}
                >
                  <DeckImage
                    src={art.imageUrl}
                    alt={art.name}
                    className="h-24 w-full rounded object-cover object-top"
                  />
                  <p className="mt-2 truncate text-xs font-medium text-foreground">
                    {art.setName || t({ it: 'Stampa', en: 'Printing' })}
                  </p>
                  {(art.collectorNumber || art.releasedAt) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {[art.collectorNumber, art.releasedAt].filter(Boolean).join(' - ')}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-border/70 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
          {t({ it: 'Nessuna art alternativa trovata su Scryfall.', en: 'No alternate art found on Scryfall.' })}
        </p>
      )}
    </div>
  );

  if (authLoading || loading) {
    return <AppLoader label={t({ it: 'Caricamento profilo...', en: 'Loading profile...' })} />;
  }

  if (!user) return null;

  const canChangePassword = !isGoogleAuthUser(user);

  const toggleAccountPanel = (panel: 'nickname' | 'password') => {
    setActiveAccountPanel((current) => (current === panel ? null : panel));
  };

  const accountActionButtonClass = (active: boolean) => (
    active
      ? 'flex w-full items-center gap-2.5 rounded-lg bg-emerald-500/25 px-3 py-2.5 text-sm font-medium text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-emerald-400/40 transition-all'
      : 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-emerald-200/80 transition-all hover:bg-emerald-500/12 hover:text-emerald-50'
  );

  const accountPanelInputClass = 'border-emerald-500/25 bg-emerald-950/35 text-foreground placeholder:text-emerald-300/35 focus-visible:ring-emerald-400/35';

  return (
    <div className="min-h-screen">
      <header className="phyrexian-divider safe-top sticky top-0 z-10 border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/dashboard')}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <ManaLogo size="sm" showText />
          </div>
          <AppProfileButton />
        </div>
      </header>

      <main className="mx-auto max-w-[92rem] px-3 py-5 sm:px-4 sm:py-8">
        {/* Profile Info */}
        <MotionPanel>
          <Card className="phyrexian-panel-strong mb-8 overflow-hidden">
            <CardContent className="relative pt-6">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-red-700" />
              <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl" />
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex shrink-0 flex-col items-center gap-4 sm:w-48 sm:items-stretch sm:border-r sm:border-emerald-400/15 sm:pr-6">
                <div className="flex justify-center" aria-hidden="true">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-emerald-400/35 sm:h-20 sm:w-20">
                    <UserIcon className="h-10 w-10 sm:h-12 sm:w-12" />
                  </div>
                </div>

                <div className="w-full space-y-1 rounded-xl border border-emerald-400/20 bg-emerald-950/20 p-1.5 backdrop-blur-sm">
                  <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/45">
                    {t({ it: 'Account', en: 'Account' })}
                  </p>
                  <button
                    type="button"
                    className={accountActionButtonClass(activeAccountPanel === 'nickname')}
                    onClick={() => toggleAccountPanel('nickname')}
                  >
                    <UserIcon className="h-4 w-4 shrink-0 text-emerald-300/90" />
                    {t({ it: 'Nick', en: 'Nickname' })}
                  </button>
                  {canChangePassword ? (
                    <button
                      type="button"
                      className={accountActionButtonClass(activeAccountPanel === 'password')}
                      onClick={() => toggleAccountPanel('password')}
                    >
                      <Lock className="h-4 w-4 shrink-0 text-emerald-300/90" />
                      {t({ it: 'Password', en: 'Password' })}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="min-w-0 flex-1 sm:pt-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {adminMode && (
                    <span className="rounded border border-teal-400/30 bg-teal-400/10 px-2 py-0.5 text-xs uppercase tracking-[0.18em] text-teal-200">
                      Admin
                    </span>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2 break-words">
                  {getProfileDisplayName(currentProfile) || user.user_metadata?.username || user.email?.split('@')[0] || t({ it: 'Giocatore', en: 'Planeswalker' })}
                </h2>
                {currentProfile && currentProfile.display_name && (
                  <p className="mb-2 text-sm text-muted-foreground">
                    @{currentProfile.username}
                  </p>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-muted-foreground">
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{t({ it: 'Dal', en: 'Joined' })} {format(new Date(user.created_at || new Date()), 'MMMM yyyy')}</span>
                  </div>
                </div>
              </div>
              </div>

              {activeAccountPanel === 'nickname' ? (
                <div className="mt-6 overflow-hidden rounded-xl border border-emerald-400/20 bg-emerald-950/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                  <p className="mb-3 text-sm text-emerald-200/70">
                    {t({
                      it: 'Questo nome viene mostrato nelle classifiche e nelle partite. Lo username resta invariato.',
                      en: 'This name is shown in rankings and battles. Your username stays unchanged.',
                    })}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <Input
                      value={displayNameDraft}
                      onChange={(event) => setDisplayNameDraft(event.target.value)}
                      placeholder={currentProfile?.username || t({ it: 'Nick visualizzato', en: 'Display nickname' })}
                      className={accountPanelInputClass}
                    />
                    <Button
                      onClick={handleSaveOwnDisplayName}
                      disabled={savingDisplayName || !currentProfile || displayNameDraft.trim() === (currentProfile.display_name || '')}
                      className="bg-gradient-to-r from-emerald-600 to-teal-700 shadow-[0_8px_24px_rgba(124,58,237,0.28)] hover:from-emerald-500 hover:to-teal-600"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {savingDisplayName ? t({ it: 'Salvataggio...', en: 'Saving...' }) : t({ it: 'Salva nick', en: 'Save nickname' })}
                    </Button>
                  </div>
                </div>
              ) : null}

              {activeAccountPanel === 'password' && canChangePassword ? (
                <div className="mt-6 overflow-hidden rounded-xl border border-emerald-400/20 bg-emerald-950/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                  <p className="mb-3 text-sm text-emerald-200/70">
                    {t({
                      it: 'Aggiorna la password del tuo account senza usare la email.',
                      en: 'Update your account password without using email.',
                    })}
                  </p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="currentPassword" className="text-sm font-medium text-emerald-100/90">
                        {t({ it: 'Password attuale', en: 'Current password' })}
                      </label>
                      <Input
                        id="currentPassword"
                        name="currentPassword"
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        autoComplete="current-password"
                        autoCapitalize="none"
                        spellCheck={false}
                        className={accountPanelInputClass}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="newPassword" className="text-sm font-medium text-emerald-100/90">
                        {t({ it: 'Nuova password', en: 'New password' })}
                      </label>
                      <Input
                        id="newPassword"
                        name="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        autoComplete="new-password"
                        autoCapitalize="none"
                        spellCheck={false}
                        className={accountPanelInputClass}
                      />
                      <PasswordRequirements password={newPassword} />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="confirmNewPassword" className="text-sm font-medium text-emerald-100/90">
                        {t({ it: 'Conferma nuova password', en: 'Confirm new password' })}
                      </label>
                      <Input
                        id="confirmNewPassword"
                        name="confirmNewPassword"
                        type="password"
                        value={confirmNewPassword}
                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                        autoComplete="new-password"
                        autoCapitalize="none"
                        spellCheck={false}
                        className={accountPanelInputClass}
                      />
                      {confirmNewPassword.length > 0 && confirmNewPassword !== newPassword ? (
                        <p className="text-xs text-red-300/90">
                          {t({ it: 'Le password non coincidono.', en: 'Passwords do not match.' })}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      onClick={handleChangePassword}
                      disabled={
                        savingPassword
                        || !currentPassword
                        || !isPasswordPolicyValid(newPassword)
                        || newPassword !== confirmNewPassword
                      }
                      className="bg-gradient-to-r from-emerald-600 to-teal-700 shadow-[0_8px_24px_rgba(124,58,237,0.28)] hover:from-emerald-500 hover:to-teal-600"
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      {savingPassword
                        ? t({ it: 'Aggiornamento...', en: 'Updating...' })
                        : t({ it: 'Aggiorna password', en: 'Update password' })}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 overflow-hidden rounded-xl border border-emerald-400/30 bg-emerald-950/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-emerald-300" />
                    <h3 className="font-semibold text-emerald-50">{t({ it: 'Sincronizzazione Archidekt', en: 'Archidekt sync' })}</h3>
                  </div>
                  <p className="mb-3 text-sm text-emerald-200/70">
                    {t({
                      it: 'Collega il tuo profilo pubblico Archidekt. Se attivi il controllo automatico, i nuovi mazzi Commander pubblici vengono aggiunti in background senza modificare quelli esistenti.',
                      en: 'Connect your public Archidekt profile. When automatic checks are enabled, new public Commander decks are added in the background without changing existing decks.',
                    })}
                  </p>
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-emerald-100/90">
                      {t({ it: 'Il tuo username Archidekt', en: 'Your Archidekt username' })}
                    </label>
                    <Input
                      value={archidektSettingsUsername}
                      onChange={(event) => setArchidektSettingsUsername(event.target.value)}
                      placeholder={t({ it: 'Username Archidekt', en: 'Archidekt username' })}
                      className={accountPanelInputClass}
                    />
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-emerald-400/15 bg-black/15 p-3 text-sm text-emerald-100/90">
                      <input
                        type="checkbox"
                        checked={archidektAutoImport}
                        onChange={(event) => setArchidektAutoImport(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-emerald-500"
                      />
                      <span>
                        <span className="block font-medium">{t({ it: 'Importa automaticamente nuovi mazzi', en: 'Automatically import new decks' })}</span>
                        <span className="block text-xs text-emerald-200/65">{t({ it: 'Controllo una volta per apertura profilo, con limite API.', en: 'Checked once per profile opening, with API rate limiting.' })}</span>
                      </span>
                    </label>
                    <Button
                      onClick={handleSaveArchidektSettings}
                      disabled={savingArchidektSettings}
                      className="bg-gradient-to-r from-emerald-600 to-teal-700 shadow-[0_8px_24px_rgba(124,58,237,0.28)] hover:from-emerald-500 hover:to-teal-600"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {savingArchidektSettings ? t({ it: 'Salvataggio...', en: 'Saving...' }) : t({ it: 'Salva Archidekt', en: 'Save Archidekt' })}
                    </Button>
                  </div>
                </div>
            </CardContent>
          </Card>
        </MotionPanel>

        {adminMode && (
          <Card className="phyrexian-panel mb-8">
            <CardHeader>
              <CardTitle className="text-foreground">{t({ it: 'Nick giocatori', en: 'Player nicknames' })}</CardTitle>
              <CardDescription>
                {t({
                  it: 'L\'admin puo modificare il nome visualizzato di ogni account senza cambiare lo username.',
                  en: 'Admins can edit each account display name without changing usernames.',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {profiles.map((profile) => {
                  const savingProfile = savingProfileDisplayNameIds.includes(profile.id);
                  const draft = profileDisplayNameDrafts[profile.id] || '';
                  return (
                    <div key={profile.id} className="grid gap-2 rounded-lg border border-border/70 bg-background/30 p-3 md:grid-cols-[minmax(0,220px)_1fr_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{getProfileDisplayName(profile)}</p>
                        <p className="text-xs text-muted-foreground truncate">@{profile.username}</p>
                      </div>
                      <Input
                        value={draft}
                        onChange={(event) => setProfileDisplayNameDrafts((drafts) => ({ ...drafts, [profile.id]: event.target.value }))}
                        placeholder={profile.username}
                        className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="border-border text-foreground"
                        onClick={() => saveProfileDisplayName(profile.id, draft)}
                        disabled={savingProfile || draft.trim() === (profile.display_name || '')}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {savingProfile ? t({ it: 'Salvo...', en: 'Saving...' }) : t({ it: 'Salva', en: 'Save' })}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {!adminMode && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-950/45 via-background to-violet-950/35 p-4 shadow-[0_16px_42px_rgba(6,182,212,0.08)] sm:p-5" aria-label={t({ it: 'La tua scheda giocatore', en: 'Your player card' })}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/70">{t({ it: 'Scheda giocatore', en: 'Player card' })}</p><h2 className="mt-1 text-xl font-bold text-foreground">{t({ it: 'La tua Command Zone', en: 'Your Command Zone' })}</h2></div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/25 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-100"><Crown className="h-3.5 w-3.5 text-violet-300" />{personalSnapshot.games ? t({ it: 'Statistiche personali', en: 'Personal stats' }) : t({ it: 'Pronto a giocare', en: 'Ready to play' })}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: t({ it: 'Partite giocate', en: 'Matches played' }), value: personalSnapshot.games, tone: 'from-cyan-500/20 to-cyan-950/10', icon: Swords },
                { label: t({ it: 'Win rate', en: 'Win rate' }), value: `${personalSnapshot.winRate}%`, tone: 'from-emerald-500/20 to-emerald-950/10', icon: Trophy },
                { label: t({ it: 'Mazzi attivi', en: 'Active decks' }), value: visibleDecks.length, tone: 'from-violet-500/20 to-violet-950/10', icon: Star },
              ].map(({ label, value, tone, icon: Icon }) => <div key={label} className={`rounded-xl border border-white/10 bg-gradient-to-br ${tone} p-3`}><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4 text-white/70" /></div><p className="mt-2 text-2xl font-bold text-foreground">{value}</p></div>)}
            </div>
            {personalSnapshot.favorite || personalSnapshot.mostPlayed ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-amber-300/15 bg-amber-500/5 p-3"><p className="text-xs text-amber-200/70">{t({ it: 'Mazzo preferito', en: 'Favorite deck' })}</p><p className="mt-1 truncate font-semibold text-foreground">{personalSnapshot.favorite?.name || '—'}</p></div><div className="rounded-xl border border-cyan-300/15 bg-cyan-500/5 p-3"><p className="text-xs text-cyan-200/70">{t({ it: 'Più giocato', en: 'Most played' })}</p><p className="mt-1 truncate font-semibold text-foreground">{personalSnapshot.mostPlayed?.name || '—'}</p></div></div> : null}
          </section>
        )}

        {/* Decks Section */}
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border/70 bg-black/25 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-foreground">{t({ it: 'Arsenale mazzi', en: 'Deck Arsenal' })}</h2>
            <p className="text-sm text-muted-foreground">
              {filteredDecks.length}
              {filteredDecks.length !== visibleDecks.length
                ? ` / ${visibleDecks.length}`
                : ''}{' '}
              {t({
                it: visibleDecks.length === 1 ? 'mazzo nella collezione' : 'mazzi nella collezione',
                en: visibleDecks.length === 1 ? 'deck in your collection' : 'decks in your collection',
              })}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:flex gap-2">
            {user ? <Button asChild variant="outline" className="border-border text-foreground"><Link href="/profile/archived-decks"><Archive className="mr-2 h-4 w-4" />{t({ it: `Archiviati (${archivedDecks.length})`, en: `Archived (${archivedDecks.length})` })}</Link></Button> : null}
            <Button
              variant="outline"
              onClick={handleRefreshDecks}
              disabled={refreshingDecks || !visibleDecks.some(deckNeedsRefreshWork)}
              className="border-border text-foreground"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshingDecks ? 'animate-spin' : ''}`} />
              {t({ it: 'Aggiorna mazzi', en: 'Refresh Decks' })}
            </Button>
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t({ it: 'Aggiungi mazzo', en: 'Add Deck' })}
            </Button>
          </div>
        </div>

        {visibleDecks.length > 0 && (
          <div className="mb-6 grid gap-3 rounded-lg border border-border/70 bg-black/20 p-3 md:grid-cols-2 xl:grid-cols-4">
            {adminMode && (
              <Select
                value={deckPlayerFilter}
                onValueChange={setDeckPlayerFilter}
                disabled={targetProfiles.length === 0}
              >
                <SelectTrigger className="border-border bg-background/50 text-foreground md:col-span-2 xl:col-span-1">
                  <SelectValue placeholder={t({ it: 'Filtra per giocatore', en: 'Filter by player' })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t({ it: 'Tutti i giocatori', en: 'All players' })}
                  </SelectItem>
                  {targetProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {getProfileDisplayName(profile)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={deckSearchQuery}
                onChange={(event) => setDeckSearchQuery(event.target.value)}
                placeholder={t({ it: 'Cerca per nome o comandante...', en: 'Search by name or commander...' })}
                className="border-border bg-background/50 pl-9 text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex min-h-10 items-center gap-1 rounded-md border border-border bg-background/50 px-2" aria-label={t({ it: 'Filtra per colori', en: 'Filter by colors' })}>
              <button type="button" onClick={() => setDeckColorFilter([])} className={`rounded px-1.5 py-1 text-xs font-bold ${deckColorFilter.length === 0 ? 'bg-emerald-500/20 text-emerald-200' : 'text-muted-foreground'}`}>{t({ it: 'Tutti', en: 'All' })}</button>
              {MANA_COLOR_ORDER.map((color) => <button key={color} type="button" onClick={() => setDeckColorFilter((current) => current.includes(color) ? current.filter((item) => item !== color) : [...current, color])} className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${deckColorFilter.includes(color) ? 'bg-emerald-400 text-emerald-950' : 'bg-secondary text-muted-foreground'}`} title={t(MANA_COLOR_LABELS[color])}>{color}</button>)}
            </div>
            <Select value={deckSort} onValueChange={(value) => setDeckSort(value as typeof deckSort)}>
              <SelectTrigger className="border-border bg-background/50 text-foreground">
                <SelectValue placeholder={t({ it: 'Ordina per', en: 'Sort by' })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{t({ it: 'Aggiunti di recente', en: 'Recently added' })}</SelectItem>
                <SelectItem value="winRate">Win rate</SelectItem>
                <SelectItem value="gamesPlayed">{t({ it: 'Partite giocate', en: 'Games played' })}</SelectItem>
                <SelectItem value="damage">{t({ it: 'Danni inflitti', en: 'Damage dealt' })}</SelectItem>
                <SelectItem value="eliminations">KO</SelectItem>
                <SelectItem value="fastest">{t({ it: 'Vittoria più veloce', en: 'Fastest win' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {filteredDecks.length > 0 ? (
          <DeckCollectionInsights
            decks={filteredDecks}
            commanderCmcSyncInProgress={commanderCmcSyncInProgress}
          />
        ) : null}

        {visibleDecks.length === 0 ? (
          <Card className="phyrexian-panel">
            <CardContent className="py-12 text-center">
              {adminMode && deckPlayerFilter !== 'all' && decks.length > 0 ? (
                <>
                  <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-medium text-foreground">
                    {t({ it: 'Nessun mazzo per questo giocatore', en: 'No decks for this player' })}
                  </h3>
                  <p className="text-muted-foreground">
                    {t({ it: 'Prova a selezionare un altro giocatore dal filtro.', en: 'Try selecting another player from the filter.' })}
                  </p>
                </>
              ) : (
                <>
                  <Swords className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">{t({ it: 'Nessun mazzo', en: 'No decks yet' })}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t({ it: 'Aggiungi il primo mazzo per iniziare a tracciare le partite', en: 'Add your first deck to start tracking battles' })}
                  </p>
                  <Button
                    onClick={() => setShowAddModal(true)}
                    className="bg-gradient-to-r from-emerald-600 to-teal-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t({ it: 'Aggiungi il primo mazzo', en: 'Add Your First Deck' })}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : filteredDecks.length === 0 ? (
          <Card className="phyrexian-panel">
            <CardContent className="py-10 text-center">
              <Search className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium text-foreground">
                {t({ it: 'Nessun mazzo trovato', en: 'No decks found' })}
              </h3>
              <p className="text-muted-foreground">
                {t({ it: 'Prova a cambiare ricerca o filtro colore.', en: 'Try changing your search or color filter.' })}
              </p>
            </CardContent>
          </Card>
        ) : (
          <MotionList className="space-y-3 sm:space-y-4">
            {filteredDecks.map((deck) => {
              const performance = deckPerformance.get(deck.id);
              const gamesPlayed = performance?.gamesPlayed ?? 0;
              const wins = performance?.wins ?? 0;
              const mastery = getDeckMastery(gamesPlayed, wins);

              return (
                <MotionItem key={deck.id}>
                  <Card
                    className="phyrexian-panel group relative min-h-[15rem] cursor-pointer overflow-hidden border-2 transition-[border-color,box-shadow] hover:brightness-110"
                    style={gamesPlayed > 0 ? {
                      borderColor: mastery.color,
                      boxShadow: `0 0 24px ${mastery.color}26`,
                    } : undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailsDeck(deck)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setDetailsDeck(deck);
                    }}
                  >
                    <DeckImage
                      src={deck.commander_image}
                      alt={deck.commander}
                      className="absolute inset-0 h-full w-full rounded-none object-cover object-top"
                      fallbackClassName="absolute inset-0 h-full w-full rounded-none"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/45" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/35" />

                    <CardContent className="relative flex min-h-[15rem] flex-col gap-4 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-lg font-black leading-tight text-white sm:text-xl">
                            {deck.name}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-sm font-semibold text-white/75">{deck.commander}</p>
                        </div>
                        <ManaColorPills colors={getDeckDisplayColors(deck)} size="xs" gap="tight" className="shrink-0" />
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {getSourceBadge(deck.source_type)}
                        <BracketBadge bracket={deck.bracket} className="rounded-full border border-emerald-500/30 px-2" />
                        {getDeckWinRateBadge(deck.id)}
                        {adminMode && deck.profiles?.username ? (
                          <span className="rounded-full border border-white/15 bg-black/35 px-2 py-1 text-[10px] text-white/70">
                            {getProfileDisplayName(deck.profiles)}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        {deck.source_url ? (
                          <DeckExternalLinkChip
                            href={deck.source_url}
                            label={getSourceLinkLabel(deck.source_type)}
                            tone={deck.source_type === 'moxfield' ? 'blue' : deck.source_type === 'archidekt' ? 'teal' : 'emerald'}
                          />
                        ) : null}
                        <EdhrecDeckInsights
                          commander={deck.commander}
                          localBracket={deck.bracket}
                          showBadge={false}
                          showBracketComparison={false}
                          linkVariant="chip"
                        />
                      </div>

                      <div className="mt-auto flex flex-col gap-3 lg:flex-row lg:items-end">
                        <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-7">
                          <DeckMasteryBadge gamesPlayed={gamesPlayed} wins={wins} />
                          <div className="min-w-[4.75rem] text-center">
                            <p className="text-2xl font-black text-white">{performance?.winRate ?? 0}%</p>
                            <p className="text-xs text-white/60">Win rate</p>
                          </div>
                        </div>

                        <div
                          className="flex flex-wrap items-center justify-end gap-1 rounded-xl border border-white/10 bg-black/50 p-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {deck.user_id === user?.id ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-pressed={deck.is_favorite}
                              className={`h-11 w-11 ${deck.is_favorite ? 'text-amber-300 hover:text-amber-200' : 'text-white/60 hover:text-amber-300'}`}
                              onClick={() => void toggleDeckFavorite(deck)}
                              title={t({
                                it: deck.is_favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti',
                                en: deck.is_favorite ? 'Remove from favorites' : 'Add to favorites',
                              })}
                            >
                              <Star className={`h-4 w-4 ${deck.is_favorite ? 'fill-current' : ''}`} />
                            </Button>
                          ) : null}
                          {deck.user_id === user?.id ? (
                            <Button variant="ghost" size="icon" className="h-11 w-11 text-white/60 hover:text-emerald-300" onClick={() => void setDeckArchived(deck, true).catch((error) => toast({ title: t({ it: 'Errore', en: 'Error' }), description: getSupabaseErrorMessage(error, t({ it: 'Archiviazione non riuscita', en: 'Failed to archive deck' })), variant: 'destructive' }))} title={t({ it: 'Archivia mazzo', en: 'Archive deck' })}>
                              <Archive className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="sm" className="min-h-11 gap-1 px-3 text-emerald-200" onClick={() => setDetailsDeck(deck)}>
                            {t({ it: 'Dettagli', en: 'Details' })} <ChevronRight className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-white/60 hover:text-emerald-300"
                            onClick={() => {
                              setLinkingDeck(deck);
                              setLinkDeckUrl(deck.source_url || '');
                            }}
                            title={t({ it: 'Collega lista Archidekt o Moxfield', en: 'Link an Archidekt or Moxfield list' })}
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          {isImportedDeckSource(deck.source_type) && deck.source_url ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-white/60 hover:text-emerald-300"
                              onClick={() => handleRefreshImportedDeck(deck)}
                              disabled={refreshingDeckIds.includes(deck.id)}
                              title={t({ it: 'Aggiorna da sorgente', en: 'Refresh from source' })}
                            >
                              <RefreshCw className={`h-4 w-4 ${refreshingDeckIds.includes(deck.id) ? 'animate-spin' : ''}`} />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-white/60 hover:text-white"
                            onClick={() => openDeckArtEditor(deck)}
                            title={t({ it: 'Modifica comandante', en: 'Edit commander' })}
                          >
                            <ImageIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-white/60 hover:text-destructive"
                            onClick={() => handleDeleteDeck(deck.id, deck.name)}
                            title={t({ it: 'Elimina mazzo', en: 'Delete deck' })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </MotionItem>
              );
            })}
          </MotionList>
        )}
      </main>

      <Sheet open={Boolean(detailsDeck)} onOpenChange={(open) => { if (!open) setDetailsDeck(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto border-border bg-card p-0 sm:max-w-xl">
          {detailsDeck ? (() => {
            const performance = deckPerformance.get(detailsDeck.id);
            const gamesPlayed = performance?.gamesPlayed ?? 0;
            const wins = performance?.wins ?? 0;
            const draws = performance?.draws ?? 0;
            const losses = performance?.losses ?? 0;
            const winRate = performance?.winRate ?? 0;
            return (
              <>
                <div className="relative overflow-hidden border-b border-border">
                  <DeckImage src={detailsDeck.commander_image} alt={detailsDeck.commander} className="h-52 w-full object-cover object-top opacity-45" />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/65 to-transparent" />
                  <SheetHeader className="absolute inset-x-0 bottom-0 p-5 text-left">
                    <SheetTitle className="pr-8 text-2xl">{detailsDeck.name}</SheetTitle>
                    <SheetDescription className="text-emerald-200">{detailsDeck.commander}</SheetDescription>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <BracketBadge bracket={detailsDeck.bracket} />
                      <ManaColorPills colors={getDeckDisplayColors(detailsDeck)} size="xs" gap="tight" />
                    </div>
                  </SheetHeader>
                </div>
                <div className="space-y-6 p-5">
                  <section>
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground"><BarChart3 className="h-4 w-4 text-emerald-300" />{t({ it: 'Impronta del mazzo', en: 'Deck fingerprint' })}</h3>
                    <div className="grid gap-3 rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-background/35 to-cyan-500/5 p-4 sm:grid-cols-[9rem_1fr]">
                      <div className="flex flex-col items-center justify-center">
                        <div className="grid h-28 w-28 place-items-center rounded-full" style={{ background: `conic-gradient(#34d399 ${winRate}%, #475569 ${winRate}% ${Math.max(winRate, winRate + (draws / Math.max(gamesPlayed, 1)) * 100)}%, #1e293b 0)` }}>
                          <div className="grid h-20 w-20 place-items-center rounded-full bg-card text-center shadow-inner">
                            <strong className="text-2xl text-emerald-300">{winRate}%</strong>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">win rate</span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{gamesPlayed} {t({ it: 'partite', en: 'games' })}</p>
                      </div>
                      <div className="space-y-3 self-center">
                        {[
                          [t({ it: 'Vittorie', en: 'Wins' }), wins, 'bg-emerald-400'],
                          [t({ it: 'Patte', en: 'Draws' }), draws, 'bg-cyan-400'],
                          [t({ it: 'Sconfitte', en: 'Losses' }), losses, 'bg-slate-500'],
                        ].map(([label, value, color]) => (
                          <div key={String(label)}>
                            <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-semibold text-foreground">{value}</span></div>
                            <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${color}`} style={{ width: `${(Number(value) / Math.max(gamesPlayed, 1)) * 100}%` }} /></div>
                          </div>
                        ))}
                        <div className="grid grid-cols-2 gap-2 pt-1 text-center">
                          <div className="rounded-lg bg-background/45 p-2"><p className="text-[10px] uppercase text-muted-foreground">{t({ it: 'Podî', en: 'Podiums' })}</p><p className="font-bold text-foreground">{wins + (performance?.secondPlaces ?? 0)}</p></div>
                          <div className="rounded-lg bg-background/45 p-2"><p className="text-[10px] uppercase text-muted-foreground">{t({ it: 'Vittoria tipica', en: 'Typical win' })}</p><p className="font-bold text-foreground">{performance?.medianWinningDurationSeconds != null ? formatGameDuration(performance.medianWinningDurationSeconds) : '—'}</p></div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground"><Crosshair className="h-4 w-4 text-rose-300" />{t({ it: 'Performance realtime', en: 'Realtime performance' })}</h3>
                    {performance?.trackedGames ? (
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          [t({ it: 'Danni inflitti', en: 'Damage dealt' }), performance.totalDamageDealt, Swords],
                          ['KO', performance.eliminations, Crosshair],
                          [t({ it: 'Danno commander', en: 'Commander damage' }), performance.commanderDamageDealt, Shield],
                          [t({ it: 'Infect inflitto', en: 'Infect dealt' }), performance.infectDealt, Skull],
                        ].map(([label, value, MetricIcon]) => {
                          const Icon = MetricIcon as typeof Swords;
                          return (
                            <div key={String(label)} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/25 p-3">
                              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div><p className="text-xs text-muted-foreground">{label as string}</p><p className="font-bold text-foreground">{value as number}</p></div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-border/70 bg-background/25 p-4 text-sm text-muted-foreground">
                        {t({ it: 'Nessuna partita realtime tracciata con questo mazzo.', en: 'No realtime-tracked games with this deck yet.' })}
                      </p>
                    )}
                  </section>

                  {performance?.gamesPlayed ? (
                    <div className="rounded-xl border border-border/60 bg-background/20 p-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t({ it: 'Copertura tracking', en: 'Tracking coverage' })}</span>
                        <span>{performance.trackedGames}/{performance.gamesPlayed} · {performance.trackingCoverage}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${performance.trackingCoverage}%` }} />
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            );
          })() : null}
        </SheetContent>
      </Sheet>

      {/* Add Deck Modal */}
      {showAddModal && (
        <ModalOverlay>
          <ModalCard size="lg">
            <CardHeader className="shrink-0 border-b border-border/70">
              <CardTitle className="text-foreground">{t({ it: 'Aggiungi mazzo', en: 'Add Deck' })}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {addMode === 'choose' && t({ it: 'Scegli come aggiungere il mazzo', en: 'Choose how to add your deck' })}
                {addMode === 'import-url' && t({ it: 'Importa da URL', en: 'Import from URL' })}
                {addMode === 'archidekt-user' && t({ it: 'Importa mazzi pubblici da Archidekt', en: 'Import public decks from Archidekt' })}
                {addMode === 'manual' && t({ it: 'Crea un mazzo con il tuo comandante', en: 'Create a deck with your commander' })}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto py-6">
              {adminMode && (
                <div className="mb-4 space-y-2 rounded-lg border border-border/70 bg-background/35 p-3">
                  <label className="text-sm font-medium text-foreground">
                    {t({ it: 'Giocatore destinatario', en: 'Target player' })}
                  </label>
                  <Select
                    value={selectedTargetProfileId}
                    onValueChange={setSelectedTargetProfileId}
                    disabled={targetProfiles.length === 0}
                  >
                    <SelectTrigger className="border-border bg-background/50 text-foreground">
                      <SelectValue placeholder={t({ it: 'Seleziona giocatore', en: 'Select player' })} />
                    </SelectTrigger>
                    <SelectContent>
                      {targetProfiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {getProfileDisplayName(profile)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {targetProfiles.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t({ it: 'Nessun altro giocatore registrato disponibile.', en: 'No other registered players available.' })}
                    </p>
                  )}
                </div>
              )}

              {addMode === 'choose' && (
                <div className="space-y-4">
                  <Button
                    variant="outline"
                    className="w-full h-24 flex flex-col items-center justify-center gap-2 border-border hover:border-emerald-500 hover:bg-emerald-500/10"
                    onClick={() => setAddMode('import-url')}
                  >
                    <ExternalLink className="w-6 h-6" />
                    <span>{t({ it: 'Importa da URL', en: 'Import from URL' })}</span>
                    <span className="text-xs text-muted-foreground">{t({ it: 'Archidekt o Moxfield (mazzi pubblici)', en: 'Archidekt or Moxfield (public decks)' })}</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-24 flex flex-col items-center justify-center gap-2 border-border hover:border-emerald-500 hover:bg-emerald-500/10"
                    onClick={() => setAddMode('manual')}
                  >
                    <Search className="w-6 h-6" />
                    <span>{t({ it: 'Aggiungi manualmente', en: 'Add manually' })}</span>
                    <span className="text-xs text-muted-foreground">{t({ it: 'Cerca un comandante', en: 'Search for a commander' })}</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-24 flex flex-col items-center justify-center gap-2 border-border hover:border-emerald-500 hover:bg-emerald-500/10"
                    onClick={() => {
                      setArchidektUsername(currentProfile?.archidekt_username || '');
                      setAddMode('archidekt-user');
                    }}
                  >
                    <UserIcon className="w-6 h-6" />
                    <span>{t({ it: 'Importa per username Archidekt', en: 'Import by Archidekt username' })}</span>
                    <span className="text-xs text-muted-foreground">{t({ it: 'Carica solo i mazzi pubblici', en: 'Load public decks only' })}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={closeAddModal}
                  >
                    {t({ it: 'Annulla', en: 'Cancel' })}
                  </Button>
                </div>
              )}

              {addMode === 'archidekt-user' && importedUserDecks.length === 0 && (
                <div className="space-y-4">
                  <Input
                    value={archidektUsername}
                    onChange={(e) => setArchidektUsername(e.target.value)}
                    placeholder={t({ it: 'Username Archidekt', en: 'Archidekt username' })}
                    className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t({
                      it: 'Precompilato dal profilo. Puoi modificarlo per questa importazione; Archidekt restituisce solo i mazzi pubblici.',
                      en: 'Pre-filled from your profile. You can change it for this import; Archidekt returns public decks only.',
                    })}
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 border-border text-foreground"
                      onClick={() => setAddMode('choose')}
                    >
                      {t({ it: 'Indietro', en: 'Back' })}
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700"
                      onClick={handleArchidektUserImport}
                      disabled={importingUserDecks || !archidektUsername.trim()}
                    >
                      {importingUserDecks ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t({ it: 'Caricamento...', en: 'Loading...' })}
                        </>
                      ) : (
                        t({ it: 'Carica mazzi', en: 'Load Decks' })
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {addMode === 'archidekt-user' && importedUserDecks.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {selectedUserDeckUrls.length}/{importedUserDecks.length} {t({ it: importedUserDecks.length === 1 ? 'mazzo selezionato' : 'mazzi selezionati', en: importedUserDecks.length === 1 ? 'deck selected' : 'decks selected' })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t({
                          it: 'Scegli quale comandante mostrare sui mazzi partner/DFC. Le art si cambiano dal profilo dopo l\'import.',
                          en: 'Choose which commander to display on partner/DFC decks. Change art from your profile after import.',
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedUserDeckUrls(importedUserDecks.map((deck) => deck.sourceUrl))}
                      >
                        {t({ it: 'Tutti', en: 'All' })}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedUserDeckUrls([])}
                      >
                        {t({ it: 'Nessuno', en: 'None' })}
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                    {importedUserDecks.map((deck) => {
                      const selectedCommander = selectedUserDeckCommanders[deck.sourceUrl] || getDefaultImportedCommanderOption(deck);
                      const alreadySaved = decks.some((savedDeck) =>
                        savedDeck.user_id === getTargetProfileId() &&
                        savedDeck.source_url === deck.sourceUrl
                      );
                      const selectedForImport = selectedUserDeckUrls.includes(deck.sourceUrl);

                      return (
                        <div key={deck.sourceUrl} className={`rounded-lg border p-3 transition-colors ${
                          selectedForImport ? 'border-border bg-background/40' : 'border-border/60 bg-background/20 opacity-70'
                        }`}>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                selectedForImport
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-border bg-background'
                              }`}
                              onClick={() => setSelectedUserDeckUrls((current) =>
                                selectedForImport
                                  ? current.filter((url) => url !== deck.sourceUrl)
                                  : [...current, deck.sourceUrl]
                              )}
                              aria-label={selectedForImport
                                ? t({ it: 'Escludi mazzo', en: 'Exclude deck' })
                                : t({ it: 'Includi mazzo', en: 'Include deck' })}
                            >
                              {selectedForImport && <Check className="h-3.5 w-3.5" />}
                            </button>
                            <DeckImage
                              src={selectedCommander.imageUrl}
                              alt={selectedCommander.name}
                              className="w-20 h-14 object-cover object-top rounded"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                {getSourceBadge(deck.sourceType)}
                                <BracketBadge
                                  bracket={deck.bracket}
                                  className="rounded-full border border-emerald-500/30 px-2"
                                />
                                {alreadySaved && (
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                                    {t({ it: 'Gia presente', en: 'Already saved' })}
                                  </span>
                                )}
                              </div>
                              <p className="font-semibold text-foreground truncate">{deck.name}</p>
                              <p className="text-sm text-emerald-400 truncate">{selectedCommander.name}</p>
                            </div>
                          </div>
                          {(deck.commanderOptions?.length || 0) > 1 && (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {deck.commanderOptions?.map((commander) => {
                                const selected = isImportedCommanderOptionSelected(selectedCommander, commander);
                                return (
                                  <button
                                    key={`${deck.sourceUrl}-${commander.name}`}
                                    type="button"
                                    onClick={() => setSelectedUserDeckCommanders((current) => ({
                                      ...current,
                                      [deck.sourceUrl]: commander,
                                    }))}
                                    className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                                      selected
                                        ? 'border-emerald-500 bg-emerald-500/10'
                                        : 'border-border hover:border-emerald-500/50'
                                    }`}
                                  >
                                    <DeckImage
                                      src={commander.imageUrl}
                                      alt={commander.name}
                                      className="h-12 w-16 rounded object-cover object-top"
                                    />
                                    <span className="min-w-0 flex-1 text-xs font-medium text-foreground">{commander.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 border-border text-foreground"
                      onClick={() => {
                      setImportedUserDecks([]);
                      setSelectedUserDeckCommanders({});
                      setSelectedUserDeckUrls([]);
                    }}
                  >
                      {t({ it: 'Indietro', en: 'Back' })}
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700"
                      onClick={saveArchidektUserDecks}
                      disabled={savingUserDecks || selectedUserDeckUrls.length === 0 || !getTargetProfileId()}
                    >
                      {savingUserDecks ? t({ it: 'Salvataggio...', en: 'Saving...' }) : t({ it: 'Salva mazzi', en: 'Save Decks' })}
                    </Button>
                  </div>
                </div>
              )}

              {addMode === 'import-url' && !importedDeck && (
                <div className="space-y-4">
                  <Input
                    value={importDeckUrl}
                    onChange={(e) => setImportDeckUrl(e.target.value)}
                    placeholder="https://archidekt.com/decks/123456 o https://www.moxfield.com/decks/..."
                    className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t({
                      it: 'Supporta link pubblici Archidekt e Moxfield. I mazzi privati non possono essere importati.',
                      en: 'Supports public Archidekt and Moxfield links. Private decks cannot be imported.',
                    })}
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 border-border text-foreground"
                      onClick={() => setAddMode('choose')}
                    >
                      {t({ it: 'Indietro', en: 'Back' })}
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700"
                      onClick={handleUrlImport}
                      disabled={importingDeck || !importDeckUrl.trim()}
                    >
                      {importingDeck ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t({ it: 'Analisi...', en: 'Importing...' })}
                        </>
                      ) : (
                        t({ it: 'Analizza mazzo', en: 'Import Deck' })
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {addMode === 'import-url' && importedDeck && (
                <div className="space-y-4">
                  <div className="flex gap-4 p-4 rounded-lg bg-background/50 border-border">
                    <DeckImage
                      src={selectedImportedCommander?.imageUrl || importedDeck.commanderImageUrl}
                      alt={selectedImportedCommander?.name || importedDeck.commander}
                      className="w-28 h-20 object-cover object-top rounded"
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {getSourceBadge(importedDeck.sourceType)}
                        <BracketBadge
                          bracket={importedDeck.bracket}
                          className="rounded-full border border-emerald-500/30 px-2"
                        />
                      </div>
                      <h4 className="font-semibold text-foreground line-clamp-1">
                        {importedDeck.name}
                      </h4>
                      <p className="text-sm text-emerald-400">{selectedImportedCommander?.name || importedDeck.commander}</p>
                      <EdhrecDeckInsights
                        commander={selectedImportedCommander?.name || importedDeck.commander}
                        localBracket={importedDeck.bracket}
                        showBracketComparison
                        layout="stacked"
                        linkVariant="chip"
                        linkClassName="w-full sm:w-auto"
                        className="mt-2"
                      />
                    </div>
                  </div>
                  {(importedDeck.commanderOptions?.length || 0) > 1 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        {t({ it: 'Scegli comandante da mostrare', en: 'Choose commander to display' })}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {importedDeck.commanderOptions?.map((commander) => {
                          const selected = isImportedCommanderOptionSelected(selectedImportedCommander, commander);
                          return (
                            <button
                              key={commander.name}
                              type="button"
                              onClick={() => {
                                setSelectedImportedCommander(commander);
                                void loadImportedCommanderArts(commander);
                              }}
                              className={`flex items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                                selected
                                  ? 'border-emerald-500 bg-emerald-500/10'
                                  : 'border-border hover:border-emerald-500/50'
                              }`}
                            >
                              <DeckImage
                                src={commander.imageUrl}
                                alt={commander.name}
                                className="h-14 w-20 rounded object-cover object-top"
                              />
                              <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{commander.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {selectedImportedCommander && renderCommanderArtPicker(
                    importedCommanderArts,
                    selectedImportedCommander.imageUrl,
                    (art) => setSelectedImportedCommander((current) => current ? { ...current, imageUrl: art.imageUrl } : current),
                    loadingImportedCommanderArts
                  )}
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 border-border text-foreground"
                      onClick={() => {
                        setImportedDeck(null);
                        setSelectedImportedCommander(null);
                        setImportDeckUrl('');
                      }}
                    >
                      {t({ it: 'Annulla', en: 'Cancel' })}
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700"
                      onClick={saveArchidektDeck}
                      disabled={savingDeck || !getTargetProfileId()}
                    >
                      {savingDeck ? t({ it: 'Salvataggio...', en: 'Saving...' }) : t({ it: 'Salva mazzo', en: 'Save Deck' })}
                    </Button>
                  </div>
                </div>
              )}

              {addMode === 'manual' && !selectedCommander && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t({ it: 'Cerca comandante per nome...', en: 'Search commander by name...' })}
                      className="pl-9 bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
                    />
                    {searching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="max-h-64 overflow-y-auto space-y-2 border border-border rounded-lg p-2">
                      {searchResults.map((result) => (
                        <button
                          key={result.id}
                          className="w-full flex items-center gap-3 p-2 rounded hover:bg-accent transition-colors text-left"
                          onClick={() => handleSelectCommander(result)}
                        >
                          {result.imageUrl ? (
                            <DeckImage
                              src={result.imageUrl}
                              alt={result.name}
                              className="w-12 h-16 rounded object-cover object-top"
                            />
                          ) : (
                            <div className="w-12 h-16 bg-secondary rounded flex items-center justify-center">
                              <Swords className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-foreground">{result.name}</p>
                            <p className="text-xs text-muted-foreground">{result.typeLine}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t({ it: 'Nessun comandante trovato per', en: 'No commanders found for' })} &quot;{searchQuery}&quot;
                    </p>
                  )}

                  <Button
                    variant="outline"
                    className="w-full border-border text-foreground"
                    onClick={() => {
                      setAddMode('choose');
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    {t({ it: 'Indietro', en: 'Back' })}
                  </Button>
                </div>
              )}

              {addMode === 'manual' && selectedCommander && (
                <div className="space-y-4">
                  <div className="flex gap-4 p-4 rounded-lg bg-background/50 border-border">
                    {selectedCommander.imageUrl ? (
                      <DeckImage
                        src={selectedCommander.imageUrl}
                        alt={selectedCommander.name}
                        className="w-20 h-28 object-cover object-top rounded"
                      />
                    ) : (
                      <div className="w-20 h-28 bg-secondary rounded flex items-center justify-center">
                        <Swords className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground mb-1">{t({ it: 'Comandante', en: 'Commander' })}</p>
                      <p className="font-semibold text-foreground">{selectedCommander.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedCommander.typeLine}</p>
                    </div>
                  </div>

                  {renderCommanderArtPicker(
                    manualCommanderArts,
                    selectedCommander.imageUrl,
                    (art) => setSelectedCommander((current) => current ? { ...current, imageUrl: art.imageUrl } : current),
                    loadingManualCommanderArts
                  )}

                  {manualPartnerMode && manualPartnerCopy && (
                    <div className="space-y-3 rounded-lg border border-border bg-background/35 p-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{manualPartnerCopy.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t({ it: 'Aggiungi un secondo comandante se vuoi salvare la coppia.', en: 'Add a second commander if you want to save the pair.' })}
                        </p>
                      </div>

                      {selectedPartnerCommander && (
                        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2">
                          {selectedPartnerCommander.imageUrl ? (
                            <DeckImage
                              src={selectedPartnerCommander.imageUrl}
                              alt={selectedPartnerCommander.name}
                              className="h-16 w-12 rounded object-cover object-top"
                            />
                          ) : (
                            <div className="h-16 w-12 rounded bg-secondary flex items-center justify-center">
                              <Swords className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">{selectedPartnerCommander.name}</p>
                            <p className="text-xs text-muted-foreground">{selectedPartnerCommander.typeLine}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0"
                            onClick={() => {
                              const combinedName = `${selectedCommander.name} // ${selectedPartnerCommander.name}`;
                              setSelectedPartnerCommander(null);
                              setPartnerSearchQuery('');
                              setPartnerSearchResults([]);
                              if (customDeckName === combinedName) setCustomDeckName(selectedCommander.name);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          value={partnerSearchQuery}
                          onChange={(e) => setPartnerSearchQuery(e.target.value)}
                          placeholder={manualPartnerCopy.placeholder}
                          className="pl-9 bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
                        />
                        {searchingPartner && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </div>

                      {partnerSearchResults.length > 0 && (
                        <div className="max-h-52 overflow-y-auto space-y-2 rounded-lg border border-border p-2">
                          {partnerSearchResults.map((result) => (
                            <button
                              key={result.id}
                              type="button"
                              className="w-full flex items-center gap-3 rounded p-2 text-left transition-colors hover:bg-accent"
                              onClick={() => {
                                setSelectedPartnerCommander(result);
                                setPartnerSearchQuery(result.name);
                                setPartnerSearchResults([]);
                                const combinedName = `${selectedCommander.name} // ${result.name}`;
                                if (!customDeckName || customDeckName === selectedCommander.name) setCustomDeckName(combinedName);
                              }}
                            >
                              {result.imageUrl ? (
                                <DeckImage
                                  src={result.imageUrl}
                                  alt={result.name}
                                  className="h-16 w-12 rounded object-cover object-top"
                                />
                              ) : (
                                <div className="h-16 w-12 rounded bg-secondary flex items-center justify-center">
                                  <Swords className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-foreground">{result.name}</p>
                                <p className="text-xs text-muted-foreground">{result.typeLine}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {partnerSearchQuery.length >= 2 && partnerSearchResults.length === 0 && !searchingPartner && !selectedPartnerCommander && (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          {manualPartnerCopy.empty}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">{t({ it: 'Nome mazzo', en: 'Deck Name' })}</label>
                    <Input
                      value={customDeckName}
                      onChange={(e) => setCustomDeckName(e.target.value)}
                      placeholder={`${selectedCommander.name}`}
                      className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 border-border text-foreground"
                      onClick={() => {
                        setSelectedCommander(null);
                        setPartnerSearchQuery('');
                        setPartnerSearchResults([]);
                        setSelectedPartnerCommander(null);
                        setCustomDeckName('');
                      }}
                    >
                      {t({ it: 'Indietro', en: 'Back' })}
                    </Button>
                    <Button
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700"
                      onClick={saveManualDeck}
                      disabled={savingDeck || !getTargetProfileId()}
                    >
                      {savingDeck ? t({ it: 'Salvataggio...', en: 'Saving...' }) : t({ it: 'Aggiungi mazzo', en: 'Add Deck' })}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </ModalCard>
        </ModalOverlay>
      )}

      {editingArtDeck && (
        <ModalOverlay>
          <ModalCard size="xl">
            <CardHeader className="shrink-0 border-b border-border/70">
              <CardTitle className="text-foreground">{t({ it: 'Modifica comandante', en: 'Edit commander' })}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {editingArtDeck.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto py-6">
              {deckCommanderOptions.length > 1 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    {t({ it: 'Comandante da mostrare', en: 'Commander to display' })}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {deckCommanderOptions.map((commander) => {
                      const selected = selectedDeckCommander?.name === commander.name;
                      return (
                        <button
                          key={commander.name}
                          type="button"
                          className={`flex min-w-0 items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                            selected ? 'border-emerald-500 bg-emerald-500/10' : 'border-border bg-background/30 hover:border-emerald-500/50'
                          }`}
                          onClick={() => {
                            setSelectedDeckCommander(commander);
                            void loadDeckCommanderArts(commander.name, commander.imageUrl);
                          }}
                        >
                          <DeckImage
                            src={commander.imageUrl}
                            alt={commander.name}
                            className="h-14 w-14 shrink-0 rounded-md object-cover object-top"
                            fallbackClassName="h-14 w-14 shrink-0 rounded-md"
                          />
                          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{commander.name}</span>
                          {selected && <Check className="h-4 w-4 shrink-0 text-emerald-300" />}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-border text-foreground"
                    disabled={
                      savingDeckArt ||
                      !selectedDeckCommander ||
                      (
                        selectedDeckCommander.name === editingArtDeck.commander &&
                        (selectedDeckCommander.imageUrl || null) === (editingArtDeck.commander_image || null)
                      )
                    }
                    onClick={() => selectedDeckCommander && void saveDeckCommanderPresentation(
                      selectedDeckCommander.name,
                      selectedDeckCommander.imageUrl || editingArtDeck.commander_image
                    )}
                  >
                    {t({ it: 'Salva comandante selezionato', en: 'Save selected commander' })}
                  </Button>
                </div>
              )}
              {renderCommanderArtPicker(
                deckArtOptions,
                selectedDeckCommander?.name === editingArtDeck.commander
                  ? editingArtDeck.commander_image
                  : selectedDeckCommander?.imageUrl,
                (art) => void saveDeckCommanderPresentation(
                  selectedDeckCommander?.name || editingArtDeck.commander,
                  art.imageUrl
                ),
                loadingDeckArtOptions || savingDeckArt
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="border-border text-foreground"
                  onClick={() => {
                    setEditingArtDeck(null);
                    setSelectedDeckCommander(null);
                    setDeckCommanderOptions([]);
                    setDeckArtOptions([]);
                  }}
                  disabled={savingDeckArt}
                >
                  {t({ it: 'Chiudi', en: 'Close' })}
                </Button>
              </div>
            </CardContent>
          </ModalCard>
        </ModalOverlay>
      )}

      {linkingDeck && (
        <ModalOverlay>
          <ModalCard size="md">
            <CardHeader className="shrink-0 border-b border-border/70">
              <CardTitle className="text-foreground">{t({ it: 'Collega lista esterna', en: 'Link external list' })}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {t({
                  it: 'Il nome e il comandante attuali restano invariati. Il link abilita aggiornamenti, bracket e metadati dalla lista.',
                  en: 'Your current name and commander stay unchanged. The link enables source refreshes, bracket and metadata.',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 py-6">
              <Input
                value={linkDeckUrl}
                onChange={(event) => setLinkDeckUrl(event.target.value)}
                placeholder="https://archidekt.com/decks/... oppure https://moxfield.com/decks/..."
                autoFocus
                className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-border text-foreground"
                  disabled={savingDeckLink}
                  onClick={() => {
                    setLinkingDeck(null);
                    setLinkDeckUrl('');
                  }}
                >
                  {t({ it: 'Annulla', en: 'Cancel' })}
                </Button>
                <Button
                  type="button"
                  disabled={savingDeckLink || !linkDeckUrl.trim()}
                  className="bg-gradient-to-r from-emerald-600 to-teal-700"
                  onClick={() => void handleLinkDeckToExternalSource()}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  {savingDeckLink ? t({ it: 'Collegamento...', en: 'Linking...' }) : t({ it: 'Collega lista', en: 'Link list' })}
                </Button>
              </div>
            </CardContent>
          </ModalCard>
        </ModalOverlay>
      )}

      <ConfirmDialog
        open={overwriteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeOverwriteConfirm(overwriteConfirm?.kind === 'bulk' ? 'cancel' : false);
          }
        }}
        title={
          overwriteConfirm?.kind === 'bulk'
            ? t({ it: 'Mazzi gia presenti', en: 'Decks already saved' })
            : t({ it: 'Mazzo gia presente', en: 'Deck already saved' })
        }
        message={
          overwriteConfirm?.kind === 'bulk'
            ? t({
              it: `${overwriteConfirm.count} mazzi selezionati sono gia nella tua collezione. Vuoi sostituirli con l'import aggiornato?`,
              en: `${overwriteConfirm.count} selected decks are already in your collection. Replace them with the latest import?`,
            })
            : t({
              it: 'Questo link e gia nella tua collezione. Vuoi sostituirlo con l\'import aggiornato?',
              en: 'This deck link is already in your collection. Replace it with the latest import?',
            })
        }
        actions={
          overwriteConfirm?.kind === 'bulk'
            ? [
                {
                  label: t({ it: 'Annulla', en: 'Cancel' }),
                  variant: 'outline',
                  onClick: () => closeOverwriteConfirm('cancel'),
                },
                {
                  label: t({ it: 'Solo nuovi', en: 'Import new only' }),
                  variant: 'outline',
                  onClick: () => closeOverwriteConfirm('skip'),
                },
                {
                  label: t({ it: 'Sostituisci', en: 'Replace' }),
                  variant: 'destructive',
                  onClick: () => closeOverwriteConfirm('overwrite'),
                },
              ]
            : [
                {
                  label: t({ it: 'Annulla', en: 'Cancel' }),
                  variant: 'outline',
                  onClick: () => closeOverwriteConfirm(false),
                },
                {
                  label: t({ it: 'Sostituisci', en: 'Replace' }),
                  variant: 'destructive',
                  onClick: () => closeOverwriteConfirm(true),
                },
              ]
        }
      />
    </div>
  );
}
