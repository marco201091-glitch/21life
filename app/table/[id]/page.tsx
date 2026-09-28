'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { DeckImage } from '@/components/deck-image';
import { LiveGameRecapView } from '@/components/live-game/live-game-recap';
import { ArenaInviteQrDialog } from '@/components/arena/arena-invite-qr-dialog';
import { PreviousSeasonsPanel } from '@/components/arena/previous-seasons-panel';
import { useLanguage } from '@/components/language-provider';
import { usePlatformAdmin } from '@/hooks/use-platform-admin';

import { MANA_COLOR_LABELS } from '@/lib/mana-colors';
import { syncDeckCommanderColors, type DeckCommanderColorTarget } from '@/lib/deck-color-sync';
import { ManaColorPairs, ManaColorReport } from '@/components/arena/mana-color-charts';
import { ModalCard, ModalOverlay } from '@/components/ui/modal-shell';

import { PanelWithActions } from '@/components/ui/panel-with-actions';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FormattedMarkdown } from '@/components/ui/formatted-markdown';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { GuestCommanderPicker } from '@/components/arena/guest-commander-picker';
import { DirectArenaInvite } from '@/components/arena/direct-arena-invite';
import { MatchParticipantRow, toDeckOption } from '@/components/arena/match-participant-row';
import { BracketBadge } from '@/components/deck/bracket-badge';
import { EdhrecBadge } from '@/components/deck/edhrec-badge';
import { delay, runTasksWithConcurrency } from '@/lib/async-utils';
import { runWhenIdle } from '@/lib/idle-work';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { buildArenaShareText } from '@/lib/arena-share';
import {
  canKickArenaMember,
  canLeaveArena,
  isArenaMember,
} from '@/lib/arena-membership';
import { isDemoUser } from '@/lib/demo';
import {
  getLastDeckSelectionForParticipant,
  getParticipantDeckId,
  getParticipantDeckSnapshot,
  getParticipantDisplayName,
  getParticipantKey,
  resolveWinnerParticipantKey,
  type ArenaGuest,
  type ArenaGuestDeck,
  type MatchParticipantRecord,
} from '@/lib/arena-participants';
import { buildPairedCommanderColorFields, buildPairedCommanderName } from '@/lib/commander-partners';
import { getProfileDisplayName } from '@/lib/profile-display';
import { getSupabaseErrorMessage } from '@/lib/supabase-errors';
import type { ArenaDaySummary } from '@/lib/arena-day-fetch';
import {
  buildArenaAnalyticsBundle,
  fetchArenaAnalyticsPayload,
  type ArenaAnalyticsBundlePayload,
} from '@/lib/arena-analytics-bundle';
import { fetchMatchesForDay, fetchMatchesSince, fetchRecentArenaMatches } from '@/lib/arena-match-fetch';
import { fetchActiveLiveGame, fetchLiveGameByMatchId } from '@/lib/live-game-service';
import type { LiveGameRecord } from '@/lib/live-game';
import { formatGameDuration } from '@/lib/live-game-duration';
import { subscribeToArenaCatalog } from '@/lib/arena-catalog-realtime';
import { buildHistoricalLiveGameRecord } from '@/lib/live-game-recap';
import { buildArenaAwards, type ArenaAward as DeckArenaAward, type DeckPerformanceStats } from '@/lib/deck-performance-analytics';
import {
  countProvisionalDeckRankings,
  filterDeckRankings,
  isProvisionalDeckRanking,
} from '@/lib/deck-ranking-visibility';

import { formatDayGroupLabel, groupMatchesByDay } from '@/lib/arena-session';
import {
  buildArenaSessionExportText,
  type ArenaSessionExportMatch,
} from '@/lib/arena-session-export';
import { isLeaveArenaConfirmationValid } from '@/lib/leave-arena-confirm';
import {
  fetchArenaSeasonContext,
  formatArenaSeasonDate,
  formatArenaSeasonLabel,
  setArenaSeasonSettings,
  type ArenaSeasonContext,
} from '@/lib/arena-seasons';
import { ArenaSeasonSettings } from '@/components/arena-season-settings';
import { PlayerAwards } from '@/components/arena/player-awards';
import { buildPlayerAwards } from '@/lib/player-awards';
import {
  isoToMatchDateValue,
  matchDateToIso,
  toMatchDateValue,
} from '@/lib/match-datetime';
import {
  normalizeGuestName,
  parseParticipantKey,
  toGuestParticipantKey,
  toUserParticipantKey,
  type ParticipantKey,
} from '@/lib/participant-keys';
import type { CommanderSearchResult } from '@/lib/scryfall';
import { format, parse, subDays, isAfter, startOfDay } from 'date-fns';
import { enUS, it as itLocale } from 'date-fns/locale';
import {
  Swords,
  ArrowLeft,
  Users,
  Trophy,

  Plus,
  Trash2,
  Copy,
  Calendar,
  ChevronDown,
  Download,
  ExternalLink,
  User,
  UserPlus,
  Target,
  Skull,
  TrendingUp,
  Medal,
  BarChart3,
  Pencil,
  Search,
  Eye,
  EyeOff,
  Share2,
  Palette,
  Loader2,
  DoorOpen,
  UserMinus,
  Award,
  Gauge,
  Flame,
  Crosshair,
  Crown,
  Clock3,
  QrCode,
  Shield,
  Flag,
} from 'lucide-react';
import { formatMatchRecord, type MatchRecord } from '@/lib/win-rate';

const ARENA_DECK_PICKER_COLUMNS = `
  id,
  user_id,
  group_id,
  name,
  commander,
  commander_image,
  source_url,
  source_type,
  bracket,
  color_identity,
  is_favorite,
  created_at
`;

const ARENA_MEMBER_DECK_LIMIT = 120;
const ARENA_MEMBER_FETCH_CONCURRENCY = 4;

const ARENA_METADATA_SYNC_DELAY_MS = 2000;
const ARENA_METADATA_SYNC_GAP_MS = 200;
const MAX_ARENA_COLOR_SYNC_DECKS = 5;
const MAX_ARENA_IMAGE_REFRESH_DECKS = 3;
const DECK_IMPORT_CONCURRENCY = 2;

const MATCHES_SELECT = `
  *,
  winner:winner_id (id, username, display_name),
  winner_guest:arena_guests!matches_winner_guest_id_fkey (id, display_name),
  match_participants (
    id,
    user_id,
    guest_id,
    deck_id,
    guest_deck_id,
    is_winner,
    tracked_event_count,
    life_lost,
    life_gained,
    life_damage_dealt,
    unattributed_life_lost,
    commander_damage_taken,
    commander_damage_dealt,
    infect_received,
    infect_dealt,
    eliminations,
    eliminations_caused,
    revives,
    corrections,
    placement,
    eliminated_at,
    was_starting_player,
    group_damage_dealt,
    group_damage_events,
    participant_name_snapshot,
    deck_name_snapshot,
    commander_snapshot,
    commander_image_snapshot,
    deck_bracket_snapshot,
    color_identity_snapshot,
    final_life,
    final_infect,
    profiles (id, username, display_name),
    arena_guests (id, display_name),
    decks (name, commander, commander_image, bracket, color_identity, source_type),
    arena_guest_decks (name, commander, commander_image, bracket, color_identity)
  )
`;

function extractMatchDeckIds(matches: Match[]) {
  return Array.from(new Set(
    matches.flatMap((match) => match.match_participants.map((participant) => getParticipantDeckId(participant)).filter(Boolean))
  )) as string[];
}

async function fetchArenaMemberDecks(groupId: string, memberIds: string[]) {
  if (memberIds.length === 0) return [] as Deck[];

  const { data, error } = await supabase.rpc('get_arena_member_decks', {
    p_group_id: groupId,
    p_user_ids: memberIds,
    p_limit_per_user: ARENA_MEMBER_DECK_LIMIT,
  });
  if (!error) return (data || []) as Deck[];

  // Compatibility fallback while a new deployment is waiting for migrations.
  const decks: Deck[] = [];

  for (let index = 0; index < memberIds.length; index += ARENA_MEMBER_FETCH_CONCURRENCY) {
    const chunk = memberIds.slice(index, index + ARENA_MEMBER_FETCH_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(async (memberId) => {
      const { data, error } = await supabase
        .from('decks')
        .select(ARENA_DECK_PICKER_COLUMNS)
        .eq('user_id', memberId)
        .order('is_favorite', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(ARENA_MEMBER_DECK_LIMIT);

      if (error) {
        console.error('Error fetching member decks:', getSupabaseErrorMessage(error, 'Failed to fetch member decks'));
        return [] as Deck[];
      }

      return (data || []) as Deck[];
    }));

    decks.push(...chunkResults.flat());
  }

  return decks;
}

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
}

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
  is_favorite: boolean;
  created_at: string;
}

type MatchParticipant = MatchParticipantRecord;

interface Match {
  id: string;
  group_id: string;
  winner_id: string | null;
  winner_guest_id?: string | null;
  is_draw?: boolean;
  played_at: string;
  created_by: string;
  notes: string | null;
  starting_life?: number | null;
  duration_seconds?: number | null;
  live_game_log?: unknown[];
  win_condition?: 'last_standing' | 'combo' | 'concession' | 'alternate_card' | 'other' | null;
  tracking_version?: number | null;
  winner: Profile | null;
  winner_guest?: { id: string; display_name: string } | null;
  match_participants: MatchParticipant[];
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_by: string;
  created_at: string;
  is_public?: boolean;
  seasons_enabled?: boolean;
  season_reset_month?: number;
  profiles: Profile;
  group_members: Array<{
    user_id: string;
    profiles: Profile;
  }>;
}

interface PlayerStats extends MatchRecord {
  key: ParticipantKey;
  displayName: string;
  isGuest: boolean;
  profile: Profile | null;
}

function getPlayerRank(stats: PlayerStats[], index: number) {
  const entry = stats[index];
  if (!entry) return index + 1;

  for (let i = 0; i < index; i++) {
    const previous = stats[i];
    if (
      previous.winRate === entry.winRate &&
      previous.wins === entry.wins &&
      previous.gamesPlayed === entry.gamesPlayed
    ) {
      return getPlayerRank(stats, i);
    }
  }

  return index + 1;
}

function hasSameCommanderRank(
  a: DeckPerformanceStats,
  b: DeckPerformanceStats,
  deckStatsSort: 'winRate' | 'gamesPlayed'
) {
  if (deckStatsSort === 'gamesPlayed') {
    return a.gamesPlayed === b.gamesPlayed && a.wins === b.wins && a.winRate === b.winRate;
  }
  return a.winRate === b.winRate && a.wins === b.wins && a.gamesPlayed === b.gamesPlayed;
}

function getCommanderRank(
  stats: DeckPerformanceStats[],
  index: number,
  deckStatsSort: 'winRate' | 'gamesPlayed'
) {
  const entry = stats[index];
  if (!entry) return index + 1;

  for (let i = 0; i < index; i++) {
    if (hasSameCommanderRank(stats[i], entry, deckStatsSort)) {
      return getCommanderRank(stats, i, deckStatsSort);
    }
  }

  return index + 1;
}

function PlayerGuestDeleteButton({
  playerKey,
  guests,
  deletingGuestIds,
  onDeleteGuest,
  deleteLabel,
}: {
  playerKey: ParticipantKey;
  guests: ArenaGuest[];
  deletingGuestIds: string[];
  onDeleteGuest: (guest: ArenaGuest) => void;
  deleteLabel: string;
}) {
  const guestId = parseParticipantKey(playerKey)?.id;
  const guest = guests.find((entry) => entry.id === guestId);
  if (!guest) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
      onClick={() => onDeleteGuest(guest)}
      disabled={deletingGuestIds.includes(guest.id)}
      title={deleteLabel}
    >
      <Trash2 className={`h-4 w-4 ${deletingGuestIds.includes(guest.id) ? 'animate-pulse' : ''}`} />
    </Button>
  );
}

export default function TablePage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { copy: t, language } = useLanguage();
  const { adminMode } = usePlatformAdmin();
  const [group, setGroup] = useState<Group | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [daySummaries, setDaySummaries] = useState<ArenaDaySummary[]>([]);
  const [matchesByDay, setMatchesByDay] = useState<Record<string, Match[]>>({});


  const [decks, setDecks] = useState<Deck[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [guests, setGuests] = useState<ArenaGuest[]>([]);
  const [analyticsPayload, setAnalyticsPayload] = useState<ArenaAnalyticsBundlePayload>({});
  const [allTimeAwardsPayload, setAllTimeAwardsPayload] = useState<ArenaAnalyticsBundlePayload>({});
  const [seasonContext, setSeasonContext] = useState<ArenaSeasonContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [decksLoading, setDecksLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('matches');
  const [awardsView, setAwardsView] = useState<'players' | 'decks'>('decks');
  const [activeLiveGameId, setActiveLiveGameId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [bracketFilter, setBracketFilter] = useState('all');
  const [deckStatsSort, setDeckStatsSort] = useState<'winRate' | 'gamesPlayed'>('winRate');
  const [showProvisionalDecks, setShowProvisionalDecks] = useState(false);
  const [syncingDeckColors, setSyncingDeckColors] = useState(false);
  const [deckColorOverrides, setDeckColorOverrides] = useState<Record<string, string[]>>({});
  const colorSyncInFlightRef = useRef(false);
  const imageRefreshInFlightRef = useRef(false);
  const arenaMetadataSyncInFlightRef = useRef(false);
  const analyticsBundle = useMemo(
    () => buildArenaAnalyticsBundle(analyticsPayload, bracketFilter, deckStatsSort),
    [analyticsPayload, bracketFilter, deckStatsSort],
  );
  const playerStats = analyticsBundle.players as PlayerStats[];
  const deckStats = analyticsBundle.decks;
  const visibleDeckStats = useMemo(
    () => filterDeckRankings(deckStats, showProvisionalDecks),
    [deckStats, showProvisionalDecks],
  );
  const provisionalDeckCount = countProvisionalDeckRankings(deckStats);

  const [showMatchModal, setShowMatchModal] = useState(false);
  const [detailsMatch, setDetailsMatch] = useState<Match | null>(null);
  const [detailsLiveGame, setDetailsLiveGame] = useState<LiveGameRecord | null>(null);
  const [detailsRecapLoading, setDetailsRecapLoading] = useState(false);
  const [showInviteQr, setShowInviteQr] = useState(false);
  const [selectedParticipantKeys, setSelectedParticipantKeys] = useState<ParticipantKey[]>([]);
  const [participantDecks, setParticipantDecks] = useState<Record<string, string>>({});
  const [participantDeckSearches, setParticipantDeckSearches] = useState<Record<string, string>>({});
  const [hiddenParticipantDeckLists, setHiddenParticipantDeckLists] = useState<Record<string, boolean>>({});
  const [winnerKey, setWinnerKey] = useState<ParticipantKey | ''>('');
  const [matchIsDraw, setMatchIsDraw] = useState(false);
  const [matchWinCondition, setMatchWinCondition] = useState<NonNullable<Match['win_condition']>>('other');
  const [matchNotes, setMatchNotes] = useState('');
  const [matchPlayedAt, setMatchPlayedAt] = useState(() => toMatchDateValue());
  const [savingMatch, setSavingMatch] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestModalMode, setGuestModalMode] = useState<'pick-existing' | 'create' | 'add-deck'>('pick-existing');
  const [guestDeckTargetId, setGuestDeckTargetId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestDeckName, setGuestDeckName] = useState('');
  const [guestSelectedCommander, setGuestSelectedCommander] = useState<CommanderSearchResult | null>(null);
  const [guestSelectedPartnerCommander, setGuestSelectedPartnerCommander] = useState<CommanderSearchResult | null>(null);
  const [savingGuest, setSavingGuest] = useState(false);
  const [deletingGuestIds, setDeletingGuestIds] = useState<string[]>([]);

  // Edit arena modal state
  const [showEditArenaModal, setShowEditArenaModal] = useState(false);
  const [editArenaName, setEditArenaName] = useState('');
  const [editArenaDescription, setEditArenaDescription] = useState('');
  const [editArenaIsPublic, setEditArenaIsPublic] = useState(false);
  const [editArenaSeasonsEnabled, setEditArenaSeasonsEnabled] = useState(true);
  const [editArenaResetMonth, setEditArenaResetMonth] = useState(1);
  const [savingArena, setSavingArena] = useState(false);
  const [showDeleteArenaModal, setShowDeleteArenaModal] = useState(false);
  const [showLeaveArenaModal, setShowLeaveArenaModal] = useState(false);
  const [leaveArenaConfirmation, setLeaveArenaConfirmation] = useState('');
  const [deleteArenaConfirmation, setDeleteArenaConfirmation] = useState('');
  const [leavingArena, setLeavingArena] = useState(false);
  const [kickingMemberIds, setKickingMemberIds] = useState<string[]>([]);
  const [deletingArena, setDeletingArena] = useState(false);

  // Edit match modal state
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editMatchWinnerKey, setEditMatchWinnerKey] = useState<ParticipantKey | ''>('');
  const [editMatchIsDraw, setEditMatchIsDraw] = useState(false);
  const [editMatchWinCondition, setEditMatchWinCondition] = useState<NonNullable<Match['win_condition']>>('other');
  const [editMatchNotes, setEditMatchNotes] = useState('');
  const [editMatchPlayedAt, setEditMatchPlayedAt] = useState(() => toMatchDateValue());
  const [editMatchPlayerKeys, setEditMatchPlayerKeys] = useState<Record<string, ParticipantKey>>({});
  const [editMatchPlayerDecks, setEditMatchPlayerDecks] = useState<Record<string, string>>({});
  const [editMatchDeckSearches, setEditMatchDeckSearches] = useState<Record<string, string>>({});
  const [hiddenEditMatchDeckLists, setHiddenEditMatchDeckLists] = useState<Record<string, boolean>>({});
  const [savingEditMatch, setSavingEditMatch] = useState(false);
  const [expandedDayKeys, setExpandedDayKeys] = useState<Set<string>>(new Set());
  const [exportDayKey, setExportDayKey] = useState<string | null>(null);
  const [exportIntro, setExportIntro] = useState('');

  const groupId = params.id as string;
  const canManageGroup = Boolean(group && user && (group.created_by === user.id || adminMode));
  const currentUserIsMember = isArenaMember(members, user?.id);
  const canLeaveCurrentArena = canLeaveArena(members.length, currentUserIsMember);

  const editMatchPlayerOptions = useMemo(() => {
    const options = new Map<ParticipantKey, string>();
    members.forEach((member) => {
      options.set(toUserParticipantKey(member.id), member.display_name?.trim() || member.username);
    });
    guests.forEach((guest) => {
      options.set(toGuestParticipantKey(guest.id), guest.display_name);
    });
    editingMatch?.match_participants.forEach((participant) => {
      const key = getParticipantKey(participant);
      if (!key || options.has(key)) return;
      options.set(key, getParticipantDisplayName(participant));
    });
    return Array.from(options, ([key, label]) => ({ key, label }));
  }, [editingMatch, guests, members]);

  const playerRanksByIndex = useMemo(
    () => playerStats.map((_, index) => getPlayerRank(playerStats, index)),
    [playerStats]
  );

  const commanderRanksByIndex = useMemo(
    () => visibleDeckStats.map((_, index) => getCommanderRank(visibleDeckStats, index, deckStatsSort)),
    [visibleDeckStats, deckStatsSort]
  );

  const syncArenaDeckMetadata = useCallback(async (loadedDecks: Deck[]) => {
    if (!user || arenaMetadataSyncInFlightRef.current) return;

    const MAX_AUTO_SYNC_DECKS = 3;
    const decksToSync = loadedDecks.filter((deck) =>
      (adminMode || deck.user_id === user.id) &&
      (deck.source_type === 'archidekt' || deck.source_type === 'moxfield') &&
      deck.source_url &&
      (!deck.bracket || !deck.commander_image)
    ).slice(0, MAX_AUTO_SYNC_DECKS);

    if (decksToSync.length === 0) return;

    arenaMetadataSyncInFlightRef.current = true;

    try {
      await delay(ARENA_METADATA_SYNC_DELAY_MS * 2);

      const successfulUpdates: Array<Partial<Deck> & { id: string }> = [];

      for (const deck of decksToSync) {
      try {
        const response = await authenticatedFetch('/api/deck-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: deck.source_url }),
        });

        if (!response.ok) continue;

        const imported = await response.json();
        const bracket = typeof imported.bracket === 'string' ? imported.bracket : null;
        const updatePayload: Partial<Deck> = {};

        if (!deck.bracket && bracket) updatePayload.bracket = bracket;
        if (!deck.commander_image && imported.commanderImageUrl) {
          updatePayload.commander_image = imported.commanderImageUrl;
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

        await delay(ARENA_METADATA_SYNC_GAP_MS);
      }

      if (successfulUpdates.length === 0) return;

      setDecks((currentDecks) => currentDecks.map((deck) => {
        const update = successfulUpdates.find((item) => item.id === deck.id);
        return update ? { ...deck, ...update } : deck;
      }));

      setMatches((currentMatches) => currentMatches.map((match) => ({
        ...match,
        match_participants: match.match_participants.map((participant) => {
          const update = participant.deck_id
            ? successfulUpdates.find((item) => item.id === participant.deck_id)
            : null;

          return update && participant.decks
            ? {
                ...participant,
                decks: {
                  ...participant.decks,
                  commander_image: update.commander_image ?? participant.decks.commander_image,
                  bracket: update.bracket ?? participant.decks.bracket,
                },
              }
            : participant;
        }),
      })));
    } finally {
      arenaMetadataSyncInFlightRef.current = false;
    }
  }, [adminMode, user]);

  const buildArenaColorTargets = useCallback((deckIds: string[]) => {
    const deckById = new Map(decks.map((deck) => [deck.id, deck]));
    const targets: DeckCommanderColorTarget[] = [];
    const seen = new Set<string>();

    deckIds.forEach((deckId) => {
      if (!deckId || seen.has(deckId) || deckColorOverrides[deckId]?.length) return;

      const deck = deckById.get(deckId);
      if (deck && (deck.color_identity?.length || deck.commander?.trim())) {
        seen.add(deckId);
        targets.push({
          id: deck.id,
          commander: deck.commander,
          source_type: deck.source_type,
          source_url: deck.source_url,
          color_identity: deck.color_identity,
        });
        return;
      }

      for (const match of matches) {
        const participant = match.match_participants.find((entry) =>
          entry.deck_id === deckId || entry.guest_deck_id === deckId,
        );
        const deckSnapshot = participant?.decks || participant?.arena_guest_decks;
        if (!deckSnapshot?.commander?.trim()) continue;

        seen.add(deckId);
        targets.push({
          id: deckId,
          commander: deckSnapshot.commander,
          source_type: participant?.decks?.source_type ?? null,
          source_url: null,
          color_identity: deckSnapshot.color_identity,
        });
        break;
      }
    });

    return targets;
  }, [deckColorOverrides, decks, matches]);

  const ensureArenaDeckColors = useCallback(async (deckIds: string[]) => {
    if (!user || deckIds.length === 0 || colorSyncInFlightRef.current) return;

    const targets = buildArenaColorTargets(deckIds).slice(0, MAX_ARENA_COLOR_SYNC_DECKS);
    if (targets.length === 0) return;

    colorSyncInFlightRef.current = true;
    setSyncingDeckColors(true);
    try {
      const resolved = await syncDeckCommanderColors(
        targets,
        deckColorOverrides,
        MAX_ARENA_COLOR_SYNC_DECKS,
      );
      if (resolved.size === 0) return;

      setDeckColorOverrides((current) => {
        const next = { ...current };
        resolved.forEach((colors, deckId) => {
          next[deckId] = colors;
        });
        return next;
      });
    } finally {
      colorSyncInFlightRef.current = false;
      setSyncingDeckColors(false);
    }
  }, [buildArenaColorTargets, deckColorOverrides, user]);

  // Keep refreshMatches stable when loading matches changes the color-sync callback.
  const ensureArenaDeckColorsRef = useRef(ensureArenaDeckColors);
  useEffect(() => {
    if (!detailsMatch?.id || detailsMatch.tracking_version == null) {
      setDetailsLiveGame(null);
      setDetailsRecapLoading(false);
      return;
    }
    if (detailsMatch.tracking_version >= 3) {
      setDetailsLiveGame(null);
      setDetailsRecapLoading(false);
      return;
    }
    let active = true;
    setDetailsRecapLoading(true);
    void fetchLiveGameByMatchId(supabase, detailsMatch.id)
      .then((game) => { if (active) setDetailsLiveGame(game); })
      .catch(() => { if (active) setDetailsLiveGame(null); })
      .finally(() => { if (active) setDetailsRecapLoading(false); });
    return () => { active = false; };
  }, [detailsMatch?.id, detailsMatch?.tracking_version]);

  useEffect(() => {
    ensureArenaDeckColorsRef.current = ensureArenaDeckColors;
  }, [ensureArenaDeckColors]);

  const initializeMatchHistory = useCallback(async () => {
    try {
      const recentRows = await fetchRecentArenaMatches(supabase, groupId) as unknown as Match[];
      const seasonThreshold = seasonContext
        ? new Date(`${seasonContext.currentSeasonStart}T00:00:00Z`).getTime()
        : Number.NEGATIVE_INFINITY;
      const recent = recentRows.filter((match) => new Date(match.played_at).getTime() >= seasonThreshold);
      const grouped = groupMatchesByDay(recent);
      const summaries = grouped.map((group) => ({
        dayKey: group.dayKey,
        matchCount: group.matchCount,
        latestPlayedAt: group.matches[0]?.played_at ?? '',
      }));

      setDaySummaries(summaries);
      setMatchesByDay(Object.fromEntries(
        grouped.map((group) => [group.dayKey, group.matches as Match[]]),
      ));
      setMatches(recent);
      return recent;
    } catch (error) {
      console.error('Error fetching match history:', getSupabaseErrorMessage(error as Error, 'Failed to fetch matches'));
      return [] as Match[];
    }
  }, [groupId, seasonContext]);

  const loadArenaDecks = useCallback(async (memberIds: string[]) => {
    if (memberIds.length === 0) {
      setDecks([]);
      return;
    }

    setDecksLoading(true);
    try {
      const pickerDecks = await fetchArenaMemberDecks(groupId, memberIds);
      setDecks(pickerDecks);
      setDeckColorOverrides((current) => {
        const next = { ...current };
        pickerDecks.forEach((deck) => {
          if (deck.color_identity?.length) {
            next[deck.id] = deck.color_identity;
          }
        });
        return next;
      });
      runWhenIdle(() => syncArenaDeckMetadata(pickerDecks), { timeoutMs: 8000 });
    } finally {
      setDecksLoading(false);
    }
  }, [groupId, syncArenaDeckMetadata]);

  const ensureArenaMemberDecksLoaded = useCallback(() => {
    if (decksLoading || decks.length > 0 || members.length === 0) return;
    void loadArenaDecks(members.map((member) => member.id));
  }, [decks.length, decksLoading, loadArenaDecks, members]);

  const refreshActiveLiveGame = useCallback(async () => {
    if (!groupId || !user) {
      setActiveLiveGameId(null);
      return;
    }
    try {
      const game = await fetchActiveLiveGame(supabase, groupId, toUserParticipantKey(user.id));
      setActiveLiveGameId(game?.id ?? null);
    } catch (error) {
      console.error('Error fetching active live game:', getSupabaseErrorMessage(error as Error, 'Failed to fetch active game'));
      setActiveLiveGameId(null);
    }
  }, [groupId, user]);

  const getStatsSinceDate = useCallback(() => {
    const seasonStart = seasonContext
      ? new Date(`${seasonContext.currentSeasonStart}T00:00:00Z`)
      : null;
    if (dateFilter === 'all') return seasonStart;
    const now = new Date();
    const relativeStart = dateFilter === '7d'
      ? subDays(now, 7)
      : dateFilter === '30d'
        ? subDays(now, 30)
        : subDays(now, 90);
    return seasonStart && isAfter(seasonStart, relativeStart) ? seasonStart : relativeStart;
  }, [dateFilter, seasonContext]);

  const refreshMatches = useCallback(async () => {
    const loadedMatches = await initializeMatchHistory();

    const matchDeckIds = extractMatchDeckIds(loadedMatches);
    if (matchDeckIds.length > 0) {
      runWhenIdle(() => ensureArenaDeckColorsRef.current(matchDeckIds), { timeoutMs: 5000 });
    }

    try {
      const since = getStatsSinceDate();
      const currentRequest = fetchArenaAnalyticsPayload(supabase, groupId, since);
      const seasonStart = seasonContext
        ? new Date(`${seasonContext.currentSeasonStart}T00:00:00Z`)
        : null;
      const allTimeRequest = since && seasonStart && since.getTime() !== seasonStart.getTime()
        ? fetchArenaAnalyticsPayload(supabase, groupId, seasonStart)
        : currentRequest;
      const [currentPayload, allTimePayload] = await Promise.all([currentRequest, allTimeRequest]);
      setAnalyticsPayload(currentPayload);
      setAllTimeAwardsPayload(allTimePayload);
    } catch (error) {
      console.error('Error refreshing arena stats:', error);
    }
  }, [getStatsSinceDate, groupId, initializeMatchHistory, seasonContext]);

  const loadFilteredMatchHistory = useCallback(async (since: Date) => {
    try {
      const loaded = await fetchMatchesSince(supabase, groupId, startOfDay(since));
      const typed = loaded as unknown as Match[];
      const grouped = groupMatchesByDay(typed);
      const nextByDay: Record<string, Match[]> = {};
      grouped.forEach((group) => {
        nextByDay[group.dayKey] = group.matches as Match[];
      });
      setDaySummaries(grouped.map((group) => ({
        dayKey: group.dayKey,
        matchCount: group.matchCount,
        latestPlayedAt: group.matches[0]?.played_at || '',
      })));
      setMatchesByDay(nextByDay);
      setMatches(typed);
      setExpandedDayKeys(new Set(grouped.map((group) => group.dayKey)));
    } catch (error) {
      console.error('Error fetching filtered matches:', getSupabaseErrorMessage(error as Error, 'Failed to fetch matches'));
    }
  }, [groupId]);

  const dateFilterBootRef = useRef(true);
  useEffect(() => {
    if (!groupId || !user) return;
    if (dateFilterBootRef.current) {
      dateFilterBootRef.current = false;
      return;
    }
    if (dateFilter === 'all') {
      void refreshMatches();
      return;
    }
    const since = getStatsSinceDate();
    if (since) void loadFilteredMatchHistory(since);
  }, [dateFilter, getStatsSinceDate, groupId, loadFilteredMatchHistory, refreshMatches, user]);

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      const [{ data: groupData }, loadedMatches, guestResult] = await Promise.all([
        supabase
          .from('groups')
          .select(`
            *,
            profiles:created_by (id, username, display_name),
            group_members (
              user_id,
              profiles (id, username, display_name)
            )
          `)
          .eq('id', groupId)
          .maybeSingle(),
        initializeMatchHistory(),
        supabase
          .from('arena_guests')
          .select(`
            id,
            group_id,
            display_name,
            last_played_at,
            arena_guest_decks (
              id,
              guest_id,
              group_id,
              name,
              commander,
              commander_image,
              color_identity,
              bracket,
              created_at
            )
          `)
          .eq('group_id', groupId)
          .order('last_played_at', { ascending: false, nullsFirst: false }),
      ]);

      if (!groupData) {
        router.push('/dashboard');
        return;
      }

      setGroup(groupData as unknown as Group);
      setMembers((groupData as unknown as Group).group_members.map((gm) => gm.profiles));
      setMatches(loadedMatches);

      const { data: guestData, error: guestError } = guestResult;

      if (guestError) {
        console.error('Error fetching guests:', getSupabaseErrorMessage(guestError, 'Failed to fetch guests'));
        setGuests([]);
      } else {
        setGuests((guestData || []) as ArenaGuest[]);
        setDeckColorOverrides((current) => {
          const next = { ...current };
          (guestData || []).forEach((guest) => {
            guest.arena_guest_decks?.forEach((deck: ArenaGuestDeck) => {
              if (deck.color_identity?.length) next[deck.id] = deck.color_identity;
            });
          });
          return next;
        });
      }

      const memberIds = (groupData as unknown as Group).group_members.map((gm) => gm.user_id);
      runWhenIdle(() => {
        void loadArenaDecks(memberIds);
      }, { timeoutMs: 2500 });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId, initializeMatchHistory, loadArenaDecks, router, user]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  useEffect(() => {
    if (!user || !groupId) return;
    let active = true;
    void fetchArenaSeasonContext(supabase, groupId)
      .then((context) => { if (active) setSeasonContext(context); })
      .catch((error) => console.error('Error fetching Arena season:', error));
    return () => { active = false; };
  }, [groupId, user]);

  useEffect(() => {
    if (!user) return;
    void refreshActiveLiveGame();
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshActiveLiveGame();
      void fetchArenaSeasonContext(supabase, groupId)
        .then(setSeasonContext)
        .catch((error) => console.error('Error refreshing Arena season:', error));
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [groupId, refreshActiveLiveGame, user]);

  const getFilteredMatches = useCallback(() => {
    const seasonThreshold = seasonContext
      ? new Date(`${seasonContext.currentSeasonStart}T00:00:00Z`).getTime()
      : Number.NEGATIVE_INFINITY;
    if (dateFilter === 'all') {
      return matches.filter((match) => new Date(match.played_at).getTime() >= seasonThreshold);
    }

    const now = new Date();
    let startDate: Date;

    switch (dateFilter) {
      case '7d':
        startDate = subDays(now, 7);
        break;
      case '30d':
        startDate = subDays(now, 30);
        break;
      case '90d':
        startDate = subDays(now, 90);
        break;
      default:
        return matches;
    }

    const threshold = Math.max(startOfDay(startDate).getTime(), seasonThreshold);
    return matches.filter((match) => new Date(match.played_at).getTime() >= threshold);
  }, [matches, dateFilter, seasonContext]);

  const matchDayGroups = useMemo(() => {
    const dateLocale = language === 'it' ? itLocale : enUS;
    const singleLabel = (dayKey: string) =>
      format(parse(dayKey, 'yyyy-MM-dd', new Date()), 'd MMM yyyy', { locale: dateLocale });

    if (dateFilter === 'all') {
      return daySummaries.map((summary) => {
        const groupMatches = matchesByDay[summary.dayKey] || [];
        const calKeys = Array.from(new Set(groupMatches.map((m) => {
          const d = new Date(m.played_at);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        }))).sort();
        return {
          dayKey: summary.dayKey,
          label: formatDayGroupLabel(singleLabel(summary.dayKey), calKeys),
          matchCount: summary.matchCount,
          matches: groupMatches,
          calendarDayKeys: calKeys,
        };
      });
    }

    return groupMatchesByDay(getFilteredMatches(), { formatLabel: singleLabel });
  }, [dateFilter, daySummaries, getFilteredMatches, language, matchesByDay]);

  const latestDayKey = matchDayGroups[0]?.dayKey ?? null;

  useEffect(() => {
    if (!latestDayKey) {
      setExpandedDayKeys(new Set());
      return;
    }

    setExpandedDayKeys((current) => {
      if (current.size === 0) {
        return new Set([latestDayKey]);
      }

      const next = new Set(current);
      next.add(latestDayKey);
      return next;
    });

  }, [latestDayKey]);

  useEffect(() => {
    if (!editingMatch) return;

    const timer = window.setTimeout(() => {
      Object.entries(editMatchPlayerDecks).forEach(([playerId, deckId]) => {
        if (!deckId) return;

        const row = document.querySelector(`[data-edit-deck-row="${playerId}"]`);
        const selectedDeck = row?.querySelector(`[data-edit-deck-option="${deckId}"]`);
        selectedDeck?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [editingMatch, editMatchPlayerDecks]);

  const bracketOptions = useMemo(() => {
    return analyticsBundle.brackets;
  }, [analyticsBundle.brackets]);

  useEffect(() => {
    if (!user || loading) return;
    void (async () => {
      try {
        const since = getStatsSinceDate();
        const currentRequest = fetchArenaAnalyticsPayload(supabase, groupId, since);
        const seasonStart = seasonContext
          ? new Date(`${seasonContext.currentSeasonStart}T00:00:00Z`)
          : null;
        const allTimeRequest = since && seasonStart && since.getTime() !== seasonStart.getTime()
          ? fetchArenaAnalyticsPayload(supabase, groupId, seasonStart)
          : currentRequest;
        const [currentPayload, allTimePayload] = await Promise.all([currentRequest, allTimeRequest]);
        setAnalyticsPayload(currentPayload);
        setAllTimeAwardsPayload(allTimePayload);
      } catch (error) {
        console.error('Error fetching arena stats:', error);
      }
    })();
  }, [getStatsSinceDate, groupId, loading, seasonContext, user]);

  const deckIdsInMatches = useMemo(() => Array.from(new Set(
    getFilteredMatches().flatMap((match) =>
      match.match_participants.map((participant) => getParticipantDeckId(participant)).filter(Boolean)
    )
  )) as string[], [getFilteredMatches]);

  useEffect(() => {
    if (activeTab !== 'meta' || loading) return;
    runWhenIdle(() => ensureArenaDeckColors(deckIdsInMatches), { timeoutMs: 2000 });
  }, [activeTab, deckIdsInMatches, ensureArenaDeckColors, loading]);

  const colorAnalytics = analyticsBundle.colors;
  const deckPerformance = analyticsBundle.decks;
  const allTimeAwardsDeckPerformance = useMemo(
    () => buildArenaAnalyticsBundle(allTimeAwardsPayload, 'all', 'winRate').decks,
    [allTimeAwardsPayload],
  );
  const arenaAwards = useMemo(
    () => buildArenaAwards(allTimeAwardsDeckPerformance),
    [allTimeAwardsDeckPerformance],
  );
  const playerAwards = useMemo(() => buildPlayerAwards(matches), [matches]);
  const arenaAwardGroups = useMemo(() => {
    const groups = new Map<DeckArenaAward['kind'], DeckArenaAward[]>();
    arenaAwards.forEach((award) => {
      const entries = groups.get(award.kind) ?? [];
      entries.push(award);
      groups.set(award.kind, entries);
    });
    return Array.from(groups.values());
  }, [arenaAwards]);

  const copyInviteLink = () => {
    if (!group) return;
    navigator.clipboard.writeText(`${window.location.origin}/join/${group.invite_code}`);
    toast({
      title: t({ it: 'Copiato!', en: 'Copied!' }),
      description: t({ it: 'Link invito copiato negli appunti', en: 'Invite link copied to clipboard' }),
    });
  };

  const handleDeleteGroup = async () => {
    if (!group || !user || (!adminMode && group.created_by !== user.id)) return;
    if (deleteArenaConfirmation !== group.name) return;

    setDeletingArena(true);
    try {
      const { error } = await supabase.from('groups').delete().eq('id', group.id);
      if (error) throw error;
      toast({
        title: t({ it: 'Playgroup eliminato', en: 'Playgroup deleted' }),
        description: t({ it: 'Playgroup, partite e iscrizioni collegate sono stati rimossi.', en: 'The playgroup and all related battles have been removed.' }),
      });
      router.push('/dashboard');
    } catch (error: unknown) {
      toast({ title: t({ it: 'Errore', en: 'Error' }), description: error instanceof Error ? error.message : t({ it: 'Impossibile eliminare il playgroup', en: 'Failed to delete playgroup' }), variant: 'destructive' });
    } finally {
      setDeletingArena(false);
    }
  };

  const openDeleteArenaModal = () => {
    setDeleteArenaConfirmation('');
    setShowDeleteArenaModal(true);
  };

  const openLeaveArenaModal = () => {
    setLeaveArenaConfirmation('');
    setShowLeaveArenaModal(true);
  };

  const handleLeaveArena = async () => {
    if (!group || !user || !canLeaveCurrentArena) {
      toast({
        title: t({ it: 'Impossibile uscire', en: 'Unable to leave' }),
        description: t({
          it: 'Se sei l\'ultimo membro, elimina il playgroup con il pulsante esistente.',
          en: 'If you are the last member, delete the playgroup using the existing button.',
        }),
        variant: 'destructive',
      });
      return;
    }

    setLeavingArena(true);
    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: t({ it: 'Sei uscito dal playgroup', en: 'You left the playgroup' }),
        description: t({
          it: 'Non vedrai più questo playgroup nella dashboard.',
          en: 'This playgroup will no longer appear on your dashboard.',
        }),
      });
      setShowLeaveArenaModal(false);
      setLeaveArenaConfirmation('');
      router.push('/dashboard');
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error
          ? error.message
          : t({ it: 'Impossibile uscire dal playgroup', en: 'Failed to leave playgroup' }),
        variant: 'destructive',
      });
    } finally {
      setLeavingArena(false);
    }
  };

  const handleKickMember = async (member: Profile) => {
    if (!group || !user) return;

    if (!canKickArenaMember({
      actorId: user.id,
      targetId: member.id,
      group,
      isPlatformAdmin: adminMode,
    })) {
      return;
    }

    setKickingMemberIds((ids) => [...ids, member.id]);
    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', member.id);

      if (error) throw error;

      setMembers((current) => current.filter((entry) => entry.id !== member.id));
      toast({
        title: t({ it: 'Giocatore rimosso', en: 'Player removed' }),
        description: t({
          it: `${getProfileDisplayName(member)} non fa più parte del playgroup.`,
          en: `${getProfileDisplayName(member)} is no longer part of this playgroup.`,
        }),
      });
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: error instanceof Error
          ? error.message
          : t({ it: 'Impossibile rimuovere il giocatore', en: 'Failed to remove player' }),
        variant: 'destructive',
      });
    } finally {
      setKickingMemberIds((ids) => ids.filter((id) => id !== member.id));
    }
  };

  const getParticipantDeckOptions = (participantKey: ParticipantKey) => {
    const parsed = parseParticipantKey(participantKey);
    if (!parsed) return [] as Array<Deck | ArenaGuestDeck>;

    if (parsed.type === 'user') {
      return decks.filter((deck) => deck.user_id === parsed.id);
    }

    const guest = guests.find((entry) => entry.id === parsed.id);
    return guest?.arena_guest_decks || [];
  };

  const getFilteredParticipantDeckOptions = (
    participantKey: ParticipantKey,
    searchMap: Record<string, string>,
    searchKey = participantKey,
  ) => {
    const query = (searchMap[searchKey] || '').trim().toLowerCase();
    const deckList = getParticipantDeckOptions(participantKey);
    if (!query) return deckList;

    return deckList.filter((deck) => [
      deck.name,
      deck.commander,
      'source_type' in deck ? deck.source_type : 'guest',
      deck.bracket ? `bracket ${deck.bracket}` : null,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  };

  const getSelectedParticipantDeck = (participantKey: ParticipantKey) => {
    const deckId = participantDecks[participantKey];
    if (!deckId) return null;

    const parsed = parseParticipantKey(participantKey);
    if (!parsed) return null;

    if (parsed.type === 'user') {
      return decks.find((deck) => deck.id === deckId) || null;
    }

    const guest = guests.find((entry) => entry.id === parsed.id);
    return guest?.arena_guest_decks?.find((deck) => deck.id === deckId) || null;
  };

  const getFilteredEditMatchDeckOptions = (participantId: string, participantKey: ParticipantKey) => {
    const query = (editMatchDeckSearches[participantId] || '').trim().toLowerCase();
    const deckList = getParticipantDeckOptions(participantKey);
    if (!query) return deckList;
    return deckList.filter((deck) => [
      deck.name,
      deck.commander,
      'source_type' in deck ? deck.source_type : 'guest',
      deck.bracket ? `bracket ${deck.bracket}` : null,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  };

  const getSelectedEditMatchDeck = (participantId: string, participantKey: ParticipantKey) => {
    const deckId = editMatchPlayerDecks[participantId];
    if (!deckId) return null;
    const parsed = parseParticipantKey(participantKey);
    if (!parsed) return null;
    if (parsed.type === 'user') return decks.find((deck) => deck.id === deckId) || null;
    const guest = guests.find((entry) => entry.id === parsed.id);
    return guest?.arena_guest_decks?.find((deck) => deck.id === deckId) || null;
  };

  const toggleParticipantSelection = (participantKey: ParticipantKey) => {
    setSelectedParticipantKeys((prev) => {
      const selected = prev.includes(participantKey);
      if (selected) {
        setParticipantDecks((current) => {
          const next = { ...current };
          delete next[participantKey];
          return next;
        });
        setParticipantDeckSearches((current) => {
          const next = { ...current };
          delete next[participantKey];
          return next;
        });
        setHiddenParticipantDeckLists((current) => {
          const next = { ...current };
          delete next[participantKey];
          return next;
        });
        if (winnerKey === participantKey) setWinnerKey('');
        return prev.filter((key) => key !== participantKey);
      }

      const deckOptions = getParticipantDeckOptions(participantKey);
      const lastDeckId = getLastDeckSelectionForParticipant(participantKey, matches);
      const preferredDeckId = deckOptions.length === 1
        ? deckOptions[0].id
        : lastDeckId && deckOptions.some((deck) => deck.id === lastDeckId) ? lastDeckId : null;
      if (preferredDeckId) {
        setParticipantDecks((current) => ({ ...current, [participantKey]: preferredDeckId }));
      }

      return [...prev, participantKey];
    });
  };

  const reloadGuests = useCallback(async () => {
    const { data, error } = await supabase
      .from('arena_guests')
      .select(`
        id,
        group_id,
        display_name,
        last_played_at,
        arena_guest_decks (
          id,
          guest_id,
          group_id,
          name,
          commander,
          commander_image,
          color_identity,
          bracket,
          created_at
        )
      `)
      .eq('group_id', groupId)
      .order('last_played_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('Error reloading guests:', getSupabaseErrorMessage(error, 'Failed to reload guests'));
      return;
    }

    setGuests((data || []) as ArenaGuest[]);
  }, [groupId]);

  useEffect(() => {
    if (!user || !groupId) return;
    return subscribeToArenaCatalog(supabase, groupId, (event) => {
      if (event.entity === 'deck') {
        void loadArenaDecks(members.map((member) => member.id));
      } else if (event.entity === 'guest' || event.entity === 'guest_deck') {
        void reloadGuests();
      } else {
        void fetchData();
      }
    });
  }, [fetchData, groupId, loadArenaDecks, members, reloadGuests, user]);

  const resetGuestModal = () => {
    setShowGuestModal(false);
    setGuestName('');
    setGuestDeckName('');
    setGuestSelectedCommander(null);
    setGuestSelectedPartnerCommander(null);
    setGuestDeckTargetId(null);
    setGuestModalMode('pick-existing');
  };

  const addGuestDeck = async (
    guestId: string,
    commander: CommanderSearchResult,
    deckName?: string,
    partnerCommander?: CommanderSearchResult | null,
    options?: { addToMatch?: boolean },
  ) => {
    const commanderDisplayName = buildPairedCommanderName(commander, partnerCommander);
    const colorFields = buildPairedCommanderColorFields(commander, partnerCommander);

    const { data: createdDeck, error: deckError } = await supabase
      .from('arena_guest_decks')
      .insert({
        guest_id: guestId,
        group_id: groupId,
        name: deckName?.trim() || commanderDisplayName,
        commander: commanderDisplayName,
        commander_image: commander.imageUrl,
        ...colorFields,
        bracket: null,
      })
      .select('id, guest_id, group_id, name, commander, commander_image, color_identity, bracket, created_at')
      .single();

    if (deckError) throw deckError;

    await supabase
      .from('arena_guests')
      .update({ last_played_at: new Date().toISOString() })
      .eq('id', guestId);

    await reloadGuests();

    const participantKey = toGuestParticipantKey(guestId);
    if (options?.addToMatch !== false) {
      setSelectedParticipantKeys((prev) => prev.includes(participantKey) ? prev : [...prev, participantKey]);
      setParticipantDecks((prev) => ({ ...prev, [participantKey]: createdDeck.id }));
    }
    if (createdDeck.color_identity?.length) {
      setDeckColorOverrides((prev) => ({ ...prev, [createdDeck.id]: createdDeck.color_identity }));
    }

    return createdDeck;
  };

  const upsertGuestWithDeck = async (
    displayName: string,
    commander: CommanderSearchResult,
    deckName?: string,
    partnerCommander?: CommanderSearchResult | null,
  ) => {
    const normalized = normalizeGuestName(displayName);
    if (!normalized) throw new Error('Guest name is required');

    let guest = guests.find((entry) => normalizeGuestName(entry.display_name) === normalized) || null;

    if (!guest) {
      const { data: createdGuest, error: guestError } = await supabase
        .from('arena_guests')
        .insert({
          group_id: groupId,
          display_name: displayName.trim(),
          normalized_name: normalized,
        })
        .select('id, group_id, display_name, last_played_at')
        .single();

      if (guestError) throw guestError;
      guest = { ...createdGuest, arena_guest_decks: [] } as ArenaGuest;
    }

    const createdDeck = await addGuestDeck(guest.id, commander, deckName, partnerCommander);

    return {
      guestId: guest.id,
      deckId: createdDeck.id,
      participantKey: toGuestParticipantKey(guest.id),
    };
  };

  const openAddGuestDeckModal = (guest: ArenaGuest) => {
    setGuestDeckTargetId(guest.id);
    setGuestName(guest.display_name);
    setGuestDeckName('');
    setGuestSelectedCommander(null);
    setGuestSelectedPartnerCommander(null);
    setGuestModalMode('add-deck');
    setShowGuestModal(true);
  };

  const handleSaveGuestModal = async () => {
    if (guestModalMode === 'add-deck') {
      if (!guestDeckTargetId || !guestSelectedCommander) {
        toast({
          title: t({ it: 'Errore', en: 'Error' }),
          description: t({ it: 'Seleziona un comandante per il nuovo mazzo', en: 'Select a commander for the new deck' }),
          variant: 'destructive',
        });
        return;
      }

      setSavingGuest(true);
      try {
        await addGuestDeck(
          guestDeckTargetId,
          guestSelectedCommander,
          guestDeckName,
          guestSelectedPartnerCommander,
          { addToMatch: false },
        );
        resetGuestModal();
        toast({
          title: t({ it: 'Mazzo aggiunto', en: 'Deck added' }),
          description: t({ it: 'Il mazzo è stato aggiunto al guest', en: 'Deck added to guest' }),
        });
      } catch (error: unknown) {
        toast({
          title: t({ it: 'Errore', en: 'Error' }),
          description: getSupabaseErrorMessage(error, t({ it: 'Impossibile salvare il mazzo', en: 'Failed to save deck' })),
          variant: 'destructive',
        });
      } finally {
        setSavingGuest(false);
      }
      return;
    }

    if (!guestName.trim() || !guestSelectedCommander) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Inserisci nome guest e seleziona un comandante', en: 'Enter a guest name and select a commander' }),
        variant: 'destructive',
      });
      return;
    }

    setSavingGuest(true);
    try {
      await upsertGuestWithDeck(guestName, guestSelectedCommander, guestDeckName, guestSelectedPartnerCommander);
      resetGuestModal();
      toast({
        title: t({ it: 'Guest aggiunto', en: 'Guest added' }),
        description: t({ it: 'Il guest è stato aggiunto alla partita', en: 'Guest added to this battle' }),
      });
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: getSupabaseErrorMessage(error, t({ it: 'Impossibile salvare il guest', en: 'Failed to save guest' })),
        variant: 'destructive',
      });
    } finally {
      setSavingGuest(false);
    }
  };

  const addExistingGuestToMatch = (guest: ArenaGuest) => {
    const participantKey = toGuestParticipantKey(guest.id);
    toggleParticipantSelection(participantKey);
    setShowGuestModal(false);
  };

  const handleDeleteGuest = async (guest: ArenaGuest) => {
    if (!canManageGroup) return;

    const deckCount = guest.arena_guest_decks?.length || 0;
    const confirmed = confirm(t({
      it: `Eliminare il guest "${guest.display_name}"? Verranno rimossi anche ${deckCount} ${deckCount === 1 ? 'mazzo' : 'mazzi'} e le sue presenze nelle partite registrate.`,
      en: `Delete guest "${guest.display_name}"? This also removes ${deckCount} ${deckCount === 1 ? 'deck' : 'decks'} and their entries from recorded battles.`,
    }));
    if (!confirmed) return;

    setDeletingGuestIds((ids) => [...ids, guest.id]);
    try {
      const { error } = await supabase
        .from('arena_guests')
        .delete()
        .eq('id', guest.id)
        .eq('group_id', groupId);

      if (error) throw error;

      const guestParticipantKey = toGuestParticipantKey(guest.id);
      setSelectedParticipantKeys((keys) => keys.filter((key) => key !== guestParticipantKey));
      setParticipantDecks((current) => {
        const next = { ...current };
        delete next[guestParticipantKey];
        return next;
      });
      if (winnerKey === guestParticipantKey) setWinnerKey('');

      await reloadGuests();
      refreshMatches();
      toast({
        title: t({ it: 'Guest eliminato', en: 'Guest deleted' }),
        description: guest.display_name,
      });
    } catch (error: unknown) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: getSupabaseErrorMessage(error, t({ it: 'Impossibile eliminare il guest', en: 'Failed to delete guest' })),
        variant: 'destructive',
      });
    } finally {
      setDeletingGuestIds((ids) => ids.filter((id) => id !== guest.id));
    }
  };

  const refreshMissingImportedDeckImages = useCallback(async (deckIds: string[]) => {
    const uniqueDeckIds = Array.from(new Set(deckIds.filter(Boolean)));
    const demoAccount = isDemoUser(user);
    const decksToRefresh = uniqueDeckIds
      .map((deckId) => decks.find((deck) => deck.id === deckId))
      .filter((deck): deck is Deck => {
        if (deck === undefined || deck.commander_image || !deck.commander) return false;
        if ((deck.source_type === 'archidekt' || deck.source_type === 'moxfield') && deck.source_url) {
          return true;
        }
        return demoAccount;
      })
      .slice(0, MAX_ARENA_IMAGE_REFRESH_DECKS);

    if (decksToRefresh.length === 0) return;

    const updates = await runTasksWithConcurrency(
      decksToRefresh,
      DECK_IMPORT_CONCURRENCY,
      async (deck) => {
        try {
          let refreshedDeck: {
            name: string;
            commander: string;
            commander_image: string | null;
            bracket: string | null;
          };

          if ((deck.source_type === 'archidekt' || deck.source_type === 'moxfield') && deck.source_url) {
            const response = await authenticatedFetch('/api/deck-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: deck.source_url }),
            });

            if (!response.ok) return null;

            const imported = await response.json();
            refreshedDeck = {
              name: imported.name || deck.name,
              commander: imported.commander || deck.commander,
              commander_image: imported.commanderImageUrl || deck.commander_image,
              bracket: typeof imported.bracket === 'string' ? imported.bracket : deck.bracket,
            };
          } else {
            const response = await authenticatedFetch(
              `/api/scryfall-card-arts?name=${encodeURIComponent(deck.commander)}`,
            );
            if (!response.ok) return null;

            const payload = await response.json() as { data?: Array<{ imageUrl?: string }> };
            const imageUrl = payload.data?.[0]?.imageUrl ?? null;
            if (!imageUrl) return null;

            refreshedDeck = {
              name: deck.name,
              commander: deck.commander,
              commander_image: imageUrl,
              bracket: deck.bracket,
            };
          }

          if (!refreshedDeck.commander_image) return null;

          const { error } = await supabase
            .from('decks')
            .update(refreshedDeck)
            .eq('id', deck.id);

          if (error) return null;
          return { id: deck.id, ...refreshedDeck };
        } catch {
          return null;
        }
      },
    );

    const successfulUpdates = updates.filter((update): update is NonNullable<typeof update> => Boolean(update));
    if (successfulUpdates.length === 0) return;

    setDecks((currentDecks) => currentDecks.map((deck) => {
      const update = successfulUpdates.find((item) => item.id === deck.id);
      return update ? { ...deck, ...update } : deck;
    }));

    setMatches((currentMatches) => currentMatches.map((match) => ({
      ...match,
      match_participants: match.match_participants.map((participant) => {
        const update = participant.deck_id
          ? successfulUpdates.find((item) => item.id === participant.deck_id)
          : null;

        return update && participant.decks
          ? {
              ...participant,
              decks: {
                ...participant.decks,
                name: update.name,
                commander: update.commander,
                commander_image: update.commander_image,
                bracket: update.bracket,
              },
            }
          : participant;
      }),
    })));
  }, [decks, user]);

  useEffect(() => {
    if (imageRefreshInFlightRef.current) return;

    const demoAccount = isDemoUser(user);
    const missingImageDeckIds = decks
      .filter((deck) => {
        if (deck.commander_image || !deck.commander) return false;
        if ((deck.source_type === 'archidekt' || deck.source_type === 'moxfield') && deck.source_url) {
          return true;
        }
        return demoAccount;
      })
      .map((deck) => deck.id)
      .slice(0, MAX_ARENA_IMAGE_REFRESH_DECKS);

    if (missingImageDeckIds.length === 0) return;

    runWhenIdle(() => {
      if (imageRefreshInFlightRef.current) return;

      imageRefreshInFlightRef.current = true;
      void refreshMissingImportedDeckImages(missingImageDeckIds).finally(() => {
        imageRefreshInFlightRef.current = false;
      });
    }, { timeoutMs: 6000 });
  }, [decks, user, refreshMissingImportedDeckImages]);

  const resetMatchForm = () => {
    setShowMatchModal(false);
    setSelectedParticipantKeys([]);
    setParticipantDecks({});
    setParticipantDeckSearches({});
    setHiddenParticipantDeckLists({});
    setWinnerKey('');
    setMatchIsDraw(false);
    setMatchWinCondition('other');
    setMatchNotes('');
    setMatchPlayedAt(toMatchDateValue());
  };

  const handleCreateMatch = async () => {
    if (selectedParticipantKeys.length < 2) {
      toast({ title: t({ it: 'Errore', en: 'Error' }), description: t({ it: 'Seleziona almeno 2 giocatori', en: 'Select at least 2 players' }), variant: 'destructive' });
      return;
    }
    if (!matchIsDraw && !winnerKey) {
      toast({ title: t({ it: 'Errore', en: 'Error' }), description: t({ it: 'Seleziona un vincitore o segna come patta', en: 'Select a winner or mark as draw' }), variant: 'destructive' });
      return;
    }

    const participantMissingDeck = selectedParticipantKeys.find((participantKey) => {
      const deckOptions = getParticipantDeckOptions(participantKey);
      if (deckOptions.length === 0) return false;
      return !participantDecks[participantKey];
    });

    if (participantMissingDeck) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Seleziona un mazzo per ogni giocatore', en: 'Select a deck for each player' }),
        variant: 'destructive',
      });
      return;
    }

    const playedAtIso = matchDateToIso(matchPlayedAt);
    if (!playedAtIso) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Data della partita non valida.', en: 'Invalid battle date.' }),
        variant: 'destructive',
      });
      return;
    }

    setSavingMatch(true);
    try {
      const userDeckIds = selectedParticipantKeys
        .filter((key) => key.startsWith('user:'))
        .map((key) => participantDecks[key])
        .filter(Boolean);
      await refreshMissingImportedDeckImages(userDeckIds);

      const winnerParsed = matchIsDraw ? null : parseParticipantKey(winnerKey);
      const { data: match, error: matchError } = await supabase.from('matches').insert({
        group_id: groupId,
        is_draw: matchIsDraw,
        winner_id: !matchIsDraw && winnerParsed?.type === 'user' ? winnerParsed.id : null,
        winner_guest_id: !matchIsDraw && winnerParsed?.type === 'guest' ? winnerParsed.id : null,
        win_condition: matchIsDraw ? null : matchWinCondition,
        created_by: user!.id,
        notes: matchNotes || null,
        played_at: playedAtIso,
      }).select().single();
      if (matchError) throw matchError;

      const participants = selectedParticipantKeys.map((participantKey) => {
        const parsed = parseParticipantKey(participantKey);
        const deckId = participantDecks[participantKey] || null;
        const isGuest = parsed?.type === 'guest';

        return {
          match_id: match.id,
          user_id: isGuest ? null : parsed?.id,
          guest_id: isGuest ? parsed?.id : null,
          deck_id: isGuest ? null : deckId,
          guest_deck_id: isGuest ? deckId : null,
          is_winner: !matchIsDraw && participantKey === winnerKey,
        };
      });

      const { error: participantsError } = await supabase.from('match_participants').insert(participants);
      if (participantsError) {
        await supabase.from('matches').delete().eq('id', match.id);
        throw participantsError;
      }
      void authenticatedFetch('/api/notifications/match-completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.id }),
      });

      const guestIds = selectedParticipantKeys
        .map((key) => parseParticipantKey(key))
        .filter((parsed) => parsed?.type === 'guest')
        .map((parsed) => parsed!.id);

      if (guestIds.length > 0) {
        await supabase
          .from('arena_guests')
          .update({ last_played_at: new Date().toISOString() })
          .in('id', guestIds);
        await reloadGuests();
      }

      toast({
        title: t({ it: 'Partita registrata!', en: 'Battle recorded!' }),
        description: matchIsDraw
          ? t({ it: 'Esito registrato: patta', en: 'Result logged: draw' })
          : t({ it: 'La vittoria è stata salvata', en: 'Victory has been logged' }),
      });
      resetMatchForm();
      refreshMatches();
    } catch (error: unknown) {
      toast({ title: t({ it: 'Errore', en: 'Error' }), description: error instanceof Error ? error.message : t({ it: 'Impossibile salvare la partita', en: 'Failed to save match' }), variant: 'destructive' });
    } finally {
      setSavingMatch(false);
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!confirm(t({ it: 'Eliminare questa partita?', en: 'Are you sure you want to delete this battle record?' }))) return;
    try {
      const { error: participantsError } = await supabase.from('match_participants').delete().eq('match_id', matchId);
      if (participantsError) throw participantsError;
      const { data: deletedMatch, error: matchError } = await supabase.from('matches').delete().eq('id', matchId).select('id').maybeSingle();
      if (matchError) throw matchError;
      if (!deletedMatch) throw new Error(t({ it: 'Partita non eliminata: verifica di essere proprietario dell’arena o creatore della partita.', en: 'Match not deleted: verify that you own the arena or created the match.' }));
      const { data: remaining, error: verifyError } = await supabase
        .from('matches')
        .select('id')
        .eq('id', matchId)
        .maybeSingle();
      if (verifyError) throw verifyError;
      if (remaining) throw new Error(t({ it: 'La partita non è stata eliminata.', en: 'The match was not deleted.' }));
      toast({ title: t({ it: 'Partita eliminata', en: 'Battle deleted' }) });
      await refreshMatches();
    } catch (error: unknown) {
      toast({ title: t({ it: 'Errore', en: 'Error' }), description: error instanceof Error ? error.message : t({ it: 'Impossibile eliminare la partita', en: 'Failed to delete match' }), variant: 'destructive' });
    }
  };

  const getMatchWinnerName = (match: Match) => {
    if (match.winner_guest?.display_name) return match.winner_guest.display_name;
    return getProfileDisplayName(match.winner);
  };

  const getWinConditionLabel = (condition: Match['win_condition']) => {
    if (condition === 'last_standing') return t({ it: 'Ultimo in piedi', en: 'Last standing' });
    if (condition === 'combo') return 'Combo';
    if (condition === 'concession') return t({ it: 'Resa', en: 'Concession' });
    if (condition === 'alternate_card') return t({ it: 'Vittoria alternativa', en: 'Alternate card' });
    if (condition === 'other') return t({ it: 'Altro', en: 'Other' });
    return t({ it: 'Non indicata', en: 'Not specified' });
  };

  const buildMatchShareText = (match: Match) => {
    const participants = match.match_participants
      .map((participant) => {
        const playerName = getParticipantDisplayName(participant);
        const deck = getParticipantDeckSnapshot(participant);
        const deckName = deck?.name || t({ it: 'Mazzo non indicato', en: 'No deck selected' });
        const commanderName = deck?.commander ? ` (${deck.commander})` : '';
        return `- ${playerName}: ${deckName}${commanderName}`;
      })
      .join('\n');
    const winnerName = match.is_draw
      ? t({ it: 'Patta', en: 'Draw' })
      : getMatchWinnerName(match);
    const comment = match.notes?.trim() || t({ it: 'Nessun commento', en: 'No comment' });

    return [
      `${t({ it: 'Partita 21Life', en: '21Life match' })} - ${group?.name || ''}`,
      format(new Date(match.played_at), 'PPP'),
      match.duration_seconds != null
        ? `${t({ it: 'Durata', en: 'Duration' })}: ${formatGameDuration(match.duration_seconds)}`
        : null,
      match.win_condition
        ? `${t({ it: 'Condizione di vittoria', en: 'Win condition' })}: ${getWinConditionLabel(match.win_condition)}`
        : null,
      '',
      t({ it: 'Partecipanti e mazzi:', en: 'Players and decks:' }),
      participants,
      '',
      `${t({ it: 'Vincitore', en: 'Winner' })}: ${winnerName}`,
      '',
      `${t({ it: 'Commento', en: 'Comment' })}:`,
      comment,
      ...(match.tracking_version || match.duration_seconds != null ? [
        '',
        t({ it: 'Statistiche realtime:', en: 'Realtime stats:' }),
        ...match.match_participants.map((participant) => (
          `- ${getParticipantDisplayName(participant)}: ${participant.life_damage_dealt || 0} dmg · ${participant.eliminations_caused || 0} KO`
        )),
      ] : []),
    ].filter((line): line is string => line !== null).join('\n');
  };

  const getPeriodLabel = () => {
    if (dateFilter === '7d') return t({ it: 'Ultimi 7 giorni', en: 'Last 7 days' });
    if (dateFilter === '30d') return t({ it: 'Ultimi 30 giorni', en: 'Last 30 days' });
    if (dateFilter === '90d') return t({ it: 'Ultimi 90 giorni', en: 'Last 90 days' });
    return seasonContext
      ? formatArenaSeasonLabel(
          seasonContext.currentSeasonStart,
          seasonContext.currentSeasonEnd,
          language === 'it' ? 'it-IT' : 'en-US',
        )
      : t({ it: 'Tutto il periodo', en: 'All time' });
  };

  const handleShareArenaStats = async () => {
    if (!group) return;

    const filteredMatches = getFilteredMatches();
    const text = buildArenaShareText({
      arenaName: group.name,
      periodLabel: getPeriodLabel(),
      totalMatches: filteredMatches.length,
      topPlayers: playerStats.slice(0, 5).map((player) => ({
        displayName: player.displayName,
        gamesPlayed: player.gamesPlayed,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
        decisiveGames: player.decisiveGames,
        winRate: player.winRate,
      })),
      topDecks: deckStats.slice(0, 5).map((deck) => ({
        name: deck.name,
        commander: deck.commander,
        ownerDisplayName: deck.ownerDisplayName,
        gamesPlayed: deck.gamesPlayed,
        wins: deck.wins,
        losses: deck.losses,
        draws: deck.draws,
        decisiveGames: deck.decisiveGames,
        winRate: deck.winRate,
        bracket: deck.bracket,
      })),
      topColors: colorAnalytics.played.slice(0, 5).map((entry) => ({
        label: t(MANA_COLOR_LABELS[entry.color] || MANA_COLOR_LABELS.C),
        gamesPlayed: entry.appearances,
        percentage: entry.percentage,
      })),
      recentMatches: filteredMatches.slice(0, 3).map((match) => ({
        playedAt: match.played_at,
        notes: match.notes,
        winnerName: getMatchWinnerName(match),
        participants: match.match_participants.map((participant) => {
          const deck = getParticipantDeckSnapshot(participant);
          return {
            displayName: getParticipantDisplayName(participant),
            commander: deck?.commander || null,
            deckName: deck?.name || null,
            isWinner: participant.is_winner,
            bracket: deck?.bracket || null,
          };
        }),
      })),
      publicUrl: group.is_public ? `${window.location.origin}/arena/${group.invite_code}` : null,
    }, {
      arenaStatsTitle: t({ it: 'Statistiche playgroup', en: 'Playgroup stats' }),
      period: t({ it: 'Periodo', en: 'Period' }),
      totalMatches: t({ it: 'Partite', en: 'Matches' }),
      topPlayers: t({ it: 'Top giocatori', en: 'Top players' }),
      topDecks: t({ it: 'Top mazzi', en: 'Top decks' }),
      topColors: t({ it: 'Colori più giocati', en: 'Most played colors' }),
      recentMatches: t({ it: 'Ultime partite', en: 'Recent matches' }),
      winner: t({ it: 'Vincitore', en: 'Winner' }),
      winRate: t({ it: 'win rate', en: 'win rate' }),
      publicPage: t({ it: 'Pagina pubblica', en: 'Public page' }),
      noComment: t({ it: 'Nessun commento', en: 'No comment' }),
    });

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${group.name} - 21Life`,
          text,
        });
        return;
      }

      await navigator.clipboard.writeText(text);
      toast({
        title: t({ it: 'Statistiche copiate', en: 'Stats copied' }),
        description: t({ it: 'Il riepilogo del playgroup è negli appunti', en: 'Playgroup summary copied to clipboard' }),
      });
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Impossibile condividere le statistiche', en: 'Unable to share stats' }),
        variant: 'destructive',
      });
    }
  };

  const toggleDayGroup = (dayKey: string, open: boolean) => {
    setExpandedDayKeys((current) => {
      const next = new Set(current);
      if (open) {
        next.add(dayKey);
      } else {
        next.delete(dayKey);
      }
      return next;
    });
  };

  const buildSessionExportMatch = (match: Match): ArenaSessionExportMatch => ({
    participants: match.match_participants.map((participant) => {
      const deck = getParticipantDeckSnapshot(participant);
      const commanderLabel = deck?.commander?.trim() || deck?.name?.trim() || '—';
      return {
        displayName: getParticipantDisplayName(participant),
        commanderLabel,
      };
    }),
    notes: match.notes,
  });

  const openDayExportModal = (dayKey: string) => {
    setExportDayKey(dayKey);
    setExportIntro('');
  };

  const closeDayExportModal = () => {
    setExportDayKey(null);
    setExportIntro('');
  };

  const handleExportDayMatches = async () => {
    if (!exportDayKey) return;
    let dayMatches = matchesByDay[exportDayKey];
    if (!dayMatches?.length) {
      const loaded = await fetchMatchesForDay(supabase, groupId, exportDayKey);
      dayMatches = loaded as unknown as Match[];
      if (dayMatches.length > 0) {
        setMatchesByDay((current) => ({ ...current, [exportDayKey]: dayMatches! }));
      }
    }
    if (!dayMatches?.length) return;

    const dayGroup = matchDayGroups.find((entry) => entry.dayKey === exportDayKey);
    const exportMatches = [...dayMatches]
      .reverse()
      .map((match) => buildSessionExportMatch(match));
    const text = buildArenaSessionExportText(exportIntro, exportMatches);

    try {
      if (navigator.share) {
        await navigator.share({
          title: dayGroup?.label || exportDayKey,
          text,
        });
        closeDayExportModal();
        return;
      }

      await navigator.clipboard.writeText(text);
      toast({
        title: t({ it: 'Export copiato', en: 'Export copied' }),
        description: t({
          it: 'Il testo del giorno è negli appunti.',
          en: 'The day export is in your clipboard.',
        }),
      });
      closeDayExportModal();
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: t({ it: 'Export copiato', en: 'Export copied' }),
          description: t({
            it: 'Il testo del giorno è negli appunti.',
            en: 'The day export is in your clipboard.',
          }),
        });
        closeDayExportModal();
      } catch {
        toast({
          title: t({ it: 'Errore', en: 'Error' }),
          description: t({ it: 'Impossibile esportare le partite', en: 'Unable to export matches' }),
          variant: 'destructive',
        });
      }
    }
  };

  const handleShareMatch = async (match: Match) => {
    const text = buildMatchShareText(match);
    const shareData = {
      title: t({ it: 'Log partita 21Life', en: '21Life match log' }),
      text,
    };

    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(text);
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      toast({
        title: t({ it: 'Log copiato', en: 'Log copied' }),
        description: t({ it: 'Ho aperto WhatsApp con il testo pronto da inviare.', en: 'WhatsApp opened with the match text ready.' }),
      });
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: t({ it: 'Log copiato', en: 'Log copied' }),
          description: t({ it: 'Il testo della partita è negli appunti.', en: 'The match text is in your clipboard.' }),
        });
      } catch {
        toast({
          title: t({ it: 'Errore', en: 'Error' }),
          description: t({ it: 'Impossibile condividere il log partita', en: 'Unable to share match log' }),
          variant: 'destructive',
        });
      }
    }
  };

  const openEditArena = () => {
    if (!group) return;
    setEditArenaName(group.name);
    setEditArenaDescription(group.description || '');
    setEditArenaIsPublic(Boolean(group.is_public));
    setEditArenaSeasonsEnabled(group.seasons_enabled ?? true);
    setEditArenaResetMonth(group.season_reset_month ?? seasonContext?.resetMonth ?? 1);
    setShowEditArenaModal(true);
  };

  const handleSaveArena = async () => {
    if (!group || !editArenaName.trim()) return;
    setSavingArena(true);
    try {
      const { error } = await supabase
        .from('groups')
        .update({
          name: editArenaName.trim(),
          description: editArenaDescription.trim() || null,
          is_public: editArenaIsPublic,
        })
        .eq('id', group.id);
      if (error) throw error;
      const seasonSettingsChanged = editArenaSeasonsEnabled !== (group.seasons_enabled ?? true)
        || editArenaResetMonth !== (seasonContext?.resetMonth ?? group.season_reset_month ?? 1);
      const nextSeasonContext = seasonSettingsChanged
        ? await setArenaSeasonSettings(supabase, group.id, editArenaSeasonsEnabled, editArenaResetMonth)
        : seasonContext;
      setSeasonContext(nextSeasonContext);
      toast({ title: t({ it: 'Playgroup aggiornato!', en: 'Playgroup updated!' }) });
      setShowEditArenaModal(false);
      setGroup((currentGroup) => currentGroup ? {
        ...currentGroup,
        name: editArenaName.trim(),
        description: editArenaDescription.trim() || null,
        is_public: editArenaIsPublic,
        seasons_enabled: editArenaSeasonsEnabled,
        season_reset_month: editArenaResetMonth,
      } : currentGroup);
    } catch (error: unknown) {
      toast({ title: t({ it: 'Errore', en: 'Error' }), description: error instanceof Error ? error.message : t({ it: 'Impossibile aggiornare il playgroup', en: 'Failed to update playgroup' }), variant: 'destructive' });
    } finally {
      setSavingArena(false);
    }
  };

  const openEditMatch = (match: Match) => {
    setEditingMatch(match);
    setEditMatchWinnerKey(resolveWinnerParticipantKey(match) || '');
    setEditMatchIsDraw(Boolean(match.is_draw));
    setEditMatchWinCondition(match.win_condition || 'other');
    setEditMatchNotes(match.notes || '');
    setEditMatchPlayedAt(isoToMatchDateValue(match.played_at));
    setEditMatchDeckSearches({});
    setEditMatchPlayerKeys(Object.fromEntries(
      match.match_participants.flatMap((participant) => {
        const key = getParticipantKey(participant);
        return key ? [[participant.id, key]] : [];
      }),
    ));
    setHiddenEditMatchDeckLists(Object.fromEntries(
      match.match_participants.map((participant) => [participant.id, true]),
    ));
    const deckMap: Record<string, string> = {};
    match.match_participants.forEach((p) => {
      const deckId = getParticipantDeckId(p);
      if (deckId) deckMap[p.id] = deckId;
    });
    setEditMatchPlayerDecks(deckMap);
    void refreshMissingImportedDeckImages(
      match.match_participants.flatMap((participant) => {
        const deckId = deckMap[participant.id];
        return deckId && getParticipantKey(participant)?.startsWith('user:') ? [deckId] : [];
      }),
    );
  };

  const handleSaveEditMatch = async () => {
    if (!editingMatch) return;
    if (!editMatchIsDraw && !editMatchWinnerKey) {
      toast({ title: t({ it: 'Errore', en: 'Error' }), description: t({ it: 'Seleziona un vincitore o segna come patta', en: 'Select a winner or mark as draw' }), variant: 'destructive' });
      return;
    }
    const assignments = editingMatch.match_participants.map((participant) => ({
      participant,
      originalKey: getParticipantKey(participant),
      selectedKey: editMatchPlayerKeys[participant.id] || getParticipantKey(participant),
    }));
    const selectedKeys = assignments.map((assignment) => assignment.selectedKey).filter((key): key is ParticipantKey => Boolean(key));
    const hasReplacement = assignments.some(({ originalKey, selectedKey }) => originalKey !== selectedKey);
    if (hasReplacement && !canManageGroup) {
      toast({ title: t({ it: 'Permesso negato', en: 'Permission denied' }), description: t({ it: 'Solo il proprietario dell’arena può sostituire un giocatore.', en: 'Only the arena owner can replace a player.' }), variant: 'destructive' });
      return;
    }
    if (selectedKeys.length !== assignments.length || new Set(selectedKeys).size !== selectedKeys.length) {
      toast({ title: t({ it: 'Giocatori non validi', en: 'Invalid players' }), description: t({ it: 'Ogni posto deve essere assegnato a un giocatore diverso.', en: 'Each seat must be assigned to a different player.' }), variant: 'destructive' });
      return;
    }
    if (!editMatchIsDraw && !selectedKeys.includes(editMatchWinnerKey as ParticipantKey)) {
      toast({ title: t({ it: 'Vincitore non valido', en: 'Invalid winner' }), description: t({ it: 'Seleziona come vincitore uno dei giocatori attuali.', en: 'Select one of the current players as the winner.' }), variant: 'destructive' });
      return;
    }
    const playedAtIso = matchDateToIso(editMatchPlayedAt, editingMatch?.played_at);
    if (!playedAtIso) {
      toast({
        title: t({ it: 'Errore', en: 'Error' }),
        description: t({ it: 'Data della partita non valida.', en: 'Invalid battle date.' }),
        variant: 'destructive',
      });
      return;
    }

    setSavingEditMatch(true);
    try {
      const winnerParsed = editMatchIsDraw ? null : parseParticipantKey(editMatchWinnerKey);
      const { data: updatedMatch, error: matchError } = await supabase
        .from('matches')
        .update({
          is_draw: editMatchIsDraw,
          winner_id: !editMatchIsDraw && winnerParsed?.type === 'user' ? winnerParsed.id : null,
          winner_guest_id: !editMatchIsDraw && winnerParsed?.type === 'guest' ? winnerParsed.id : null,
          notes: editMatchNotes || null,
          played_at: playedAtIso,
          win_condition: editMatchIsDraw ? null : editMatchWinCondition,
        })
        .eq('id', editingMatch.id)
        .select('id')
        .maybeSingle();
      if (matchError) throw matchError;
      if (!updatedMatch) throw new Error(t({ it: 'Partita non aggiornata: verifica i permessi sull’arena.', en: 'Match was not updated: check arena permissions.' }));

      for (const { participant: p, selectedKey } of assignments) {
        const parsedPlayer = selectedKey ? parseParticipantKey(selectedKey) : null;
        const selectedPlayer = editMatchPlayerOptions.find((option) => option.key === selectedKey);
        if (!parsedPlayer || !selectedPlayer) throw new Error(t({ it: 'Seleziona un giocatore valido.', en: 'Select a valid player.' }));
        const deckId = editMatchPlayerDecks[p.id] || null;
        const isGuest = parsedPlayer.type === 'guest';

        const { data: updatedParticipant, error: pError } = await supabase
          .from('match_participants')
          .update({
            user_id: isGuest ? null : parsedPlayer.id,
            guest_id: isGuest ? parsedPlayer.id : null,
            participant_name_snapshot: selectedPlayer.label,
            deck_id: isGuest ? null : deckId,
            guest_deck_id: isGuest ? deckId : null,
            is_winner: !editMatchIsDraw && selectedKey === editMatchWinnerKey,
          })
          .eq('id', p.id)
          .select('id')
          .maybeSingle();
        if (pError) throw pError;
        if (!updatedParticipant) throw new Error(t({ it: 'Giocatore non aggiornato: verifica i permessi sull’arena.', en: 'Player was not updated: check arena permissions.' }));
      }

      toast({ title: t({ it: 'Partita aggiornata!', en: 'Battle updated!' }) });
      setEditingMatch(null);
      setEditMatchDeckSearches({});
      setHiddenEditMatchDeckLists({});
      refreshMatches();
    } catch (error: unknown) {
      toast({ title: t({ it: 'Errore', en: 'Error' }), description: error instanceof Error ? error.message : t({ it: 'Impossibile aggiornare la partita', en: 'Failed to update match' }), variant: 'destructive' });
    } finally {
      setSavingEditMatch(false);
    }
  };

  if (authLoading || loading) {
    return <AppLoader label={t({ it: 'Caricamento playgroup...', en: 'Loading playgroup...' })} />;
  }

  if (!group) return null;

  return (
    <div className="min-h-screen">
      <header className="phyrexian-divider safe-top sticky top-0 z-10 border-b">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="hidden sm:block">
                <ManaLogo size="sm" showText />
              </div>
              <div className="sm:hidden">
                <ManaLogo size="sm" />
              </div>
              <div className="hidden min-w-0 items-center gap-2 border-l border-border pl-2 sm:flex">
                <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs uppercase tracking-[0.16em] text-emerald-200">
                  Playgroup
                </span>
                <span className="truncate font-semibold text-foreground">{group.name}</span>
                {group.description && <span className="hidden text-sm text-muted-foreground md:block">— {group.description}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <AppProfileButton />
              <Button variant="outline" size="sm" onClick={handleShareArenaStats} className="h-11 border-border px-3 text-foreground sm:px-4" title={t({ it: 'Condividi statistiche', en: 'Share stats' })}>
                <Share2 className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{t({ it: 'Condividi', en: 'Share' })}</span>
              </Button>

            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-5 sm:py-8">
        <PanelWithActions
          variant="strong"
          className="relative mb-5 sm:mb-8"
          actions={(
            <>
              <Button
                onClick={() => router.push(`/table/${groupId}/play`)}
                className="flex-1 bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-600 font-bold shadow-lg shadow-emerald-950/30 hover:from-emerald-500 hover:to-teal-500"
              >
                <Swords className="mr-2 h-4 w-4" />
                {activeLiveGameId
                  ? t({ it: 'Riprendi partita', en: 'Resume game' })
                  : t({ it: 'Gioca live', en: 'Play Game' })}
              </Button>
              <Button
                onClick={() => {
                  setMatchPlayedAt(toMatchDateValue());
                  ensureArenaMemberDecksLoaded();
                  setShowMatchModal(true);
                }}
                variant="outline"
                className="flex-1 border-emerald-500/35 bg-emerald-500/5 font-semibold text-foreground hover:bg-emerald-500/15"
              >
                <Target className="mr-2 h-4 w-4" />
                {t({ it: 'Registra partita', en: 'Record Battle' })}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={copyInviteLink}
                className="flex-1 border-border text-foreground"
              >
                <Copy className="mr-2 h-4 w-4" />
                {t({ it: 'Condividi invito', en: 'Share invite' })}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowInviteQr(true)} className="border-cyan-500/30 text-cyan-100">
                <QrCode className="mr-2 h-4 w-4" />
                QR
              </Button>
            </>
          )}
        >
          {activeLiveGameId ? (
            <button
              type="button"
              onClick={() => router.push(`/table/${groupId}/play`)}
              className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-left transition hover:bg-emerald-500/15"
            >
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-emerald-100">{t({ it: 'Partita live in corso', en: 'Live game in progress' })}</strong>
                <span className="block text-xs text-emerald-200/65">{t({ it: 'Tocca per tornare al tracker', en: 'Tap to return to the tracker' })}</span>
              </span>
              <ArrowLeft className="h-4 w-4 rotate-180 text-emerald-200" />
            </button>
          ) : null}
          {(canLeaveCurrentArena || canManageGroup) && (
            <div className="absolute right-4 top-4 hidden items-center gap-1 lg:flex">
              {canLeaveCurrentArena && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={openLeaveArenaModal}
                  className="h-10 w-10 text-muted-foreground hover:text-foreground"
                  title={t({ it: 'Esci dal playgroup', en: 'Leave playgroup' })}
                  aria-label={t({ it: 'Esci dal playgroup', en: 'Leave playgroup' })}
                >
                  <DoorOpen className="h-4 w-4" />
                </Button>
              )}
              {canManageGroup && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={openDeleteArenaModal}
                  className="h-10 w-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title={t({ it: 'Elimina playgroup', en: 'Delete playgroup' })}
                  aria-label={t({ it: 'Elimina playgroup', en: 'Delete playgroup' })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200">{t({ it: 'Sala operativa', en: 'Command room' })}</p>
          <div className="mt-1 flex min-w-0 items-center gap-2 lg:pr-24">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-2xl font-bold text-foreground">{group.name}</h1>
              {canManageGroup && (
                <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground" onClick={openEditArena} aria-label={t({ it: 'Modifica playgroup', en: 'Edit playgroup' })}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {group.description ? <p className="text-sm text-muted-foreground">{group.description}</p> : null}
          <p className="font-mono text-xs font-semibold text-emerald-300">
            {t({ it: 'Invito', en: 'Invite' })}: {group.invite_code}
          </p>
        </PanelWithActions>

        {seasonContext ? (
          <Card className="mb-5 border-emerald-500/25 bg-emerald-950/15">
            <CardContent className="py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  {formatArenaSeasonLabel(
                    seasonContext.currentSeasonStart,
                    seasonContext.currentSeasonEnd,
                    language === 'it' ? 'it-IT' : 'en-US',
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatArenaSeasonDate(seasonContext.currentSeasonStart, language === 'it' ? 'it-IT' : 'en-US')}
                  {' – '}
                  {formatArenaSeasonDate(seasonContext.currentSeasonEnd, language === 'it' ? 'it-IT' : 'en-US')}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-6 flex min-w-0 flex-col gap-3 rounded-2xl border border-border/70 bg-black/35 p-3 shadow-lg shadow-black/20 backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between">
            <TabsList className="grid h-auto w-full min-w-0 grid-cols-5 gap-1 border border-border/70 bg-card/60 p-1 xl:inline-flex xl:h-11 xl:w-auto">
              <TabsTrigger
                value="matches"
                aria-label={t({ it: 'Partite', en: 'Battles' })}
                title={t({ it: 'Partite', en: 'Battles' })}
                className="h-9 min-w-0 px-1.5 text-xs data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 md:px-3 md:text-sm"
              >
                <Calendar className="h-4 w-4 shrink-0 md:mr-2" />
                <span className="hidden whitespace-nowrap md:inline">{t({ it: 'Partite', en: 'Battles' })}</span>
              </TabsTrigger>
              <TabsTrigger
                value="players"
                aria-label={t({ it: 'Giocatori', en: 'Players' })}
                title={t({ it: 'Giocatori', en: 'Players' })}
                className="h-9 min-w-0 px-1.5 text-xs data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 md:px-3 md:text-sm"
              >
                <Users className="h-4 w-4 shrink-0 md:mr-2" />
                <span className="hidden whitespace-nowrap md:inline">{t({ it: 'Giocatori', en: 'Players' })}</span>
              </TabsTrigger>
              <TabsTrigger
                value="commanders"
                aria-label={t({ it: 'Mazzi', en: 'Decks' })}
                title={t({ it: 'Mazzi', en: 'Decks' })}
                className="h-9 min-w-0 px-1.5 text-xs data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 md:px-3 md:text-sm"
              >
                <Swords className="h-4 w-4 shrink-0 md:mr-2" />
                <span className="hidden whitespace-nowrap md:inline">{t({ it: 'Mazzi', en: 'Decks' })}</span>
              </TabsTrigger>
              <TabsTrigger
                value="awards"
                aria-label="Awards"
                title="Awards"
                className="h-9 min-w-0 px-1.5 text-xs data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 md:px-3 md:text-sm"
              >
                <Award className="h-4 w-4 shrink-0 md:mr-2" />
                <span className="hidden whitespace-nowrap md:inline">Awards</span>
              </TabsTrigger>
              <TabsTrigger
                value="meta"
                aria-label={t({ it: 'Meta', en: 'Meta' })}
                title={t({ it: 'Meta', en: 'Meta' })}
                className="h-9 min-w-0 px-1.5 text-xs data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 md:px-3 md:text-sm"
              >
                <Palette className="h-4 w-4 shrink-0 md:mr-2" />
                <span className="hidden whitespace-nowrap md:inline">{t({ it: 'Meta', en: 'Meta' })}</span>
              </TabsTrigger>
            </TabsList>

            <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-wrap xl:justify-end">
              {activeTab === 'commanders' ? (
                <Select value={deckStatsSort} onValueChange={(value) => setDeckStatsSort(value as typeof deckStatsSort)}>
                  <SelectTrigger className="h-11 w-full min-w-0 bg-card/70 border-border text-foreground xl:min-w-[11rem]">
                    <SelectValue placeholder={t({ it: 'Ordina per', en: 'Sort by' })} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="winRate">{t({ it: 'Win rate', en: 'Win rate' })}</SelectItem>
                    <SelectItem value="gamesPlayed">{t({ it: 'Partite giocate', en: 'Games played' })}</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              {activeTab === 'commanders' || activeTab === 'meta' ? (
                <Select value={bracketFilter} onValueChange={setBracketFilter}>
                  <SelectTrigger className="h-11 w-full min-w-0 bg-card/70 border-border text-foreground xl:min-w-[10rem]">
                    <SelectValue placeholder={t({ it: 'Bracket', en: 'Bracket' })} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">{t({ it: 'Tutti i bracket', en: 'All Brackets' })}</SelectItem>
                    {bracketOptions.map((bracket) => (
                      <SelectItem key={bracket} value={bracket}>
                        {t({ it: 'Bracket', en: 'Bracket' })} {bracket}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {activeTab !== 'awards' ? (
                <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as typeof dateFilter)}>
                  <SelectTrigger className="h-11 w-full min-w-0 bg-card/70 border-border text-foreground xl:min-w-[10rem]">
                    <Calendar className="mr-2 h-4 w-4 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="all">{t({ it: 'Season corrente', en: 'Current season' })}</SelectItem>
                    <SelectItem value="7d">{t({ it: 'Ultimi 7 giorni', en: 'Last 7 Days' })}</SelectItem>
                    <SelectItem value="30d">{t({ it: 'Ultimi 30 giorni', en: 'Last 30 Days' })}</SelectItem>
                    <SelectItem value="90d">{t({ it: 'Ultimi 90 giorni', en: 'Last 90 Days' })}</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>

          <TabsContent value="matches">
            {daySummaries.length === 0 ? (
              <Card className="phyrexian-panel">
                <CardContent className="py-12 text-center">
                  <Skull className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">{t({ it: 'Nessuna partita', en: 'No battles yet' })}</h3>
                  <p className="text-muted-foreground mb-4">{t({ it: 'Registra la prima partita per iniziare a tracciare i risultati', en: 'Record your first battle to begin tracking' })}</p>
                  <Button
                    onClick={() => {
                      setMatchPlayedAt(toMatchDateValue());
                      ensureArenaMemberDecksLoaded();
                      setShowMatchModal(true);
                    }}
                    className="bg-gradient-to-r from-emerald-600 to-teal-700"
                  >
                    <Target className="w-4 h-4 mr-2" /> {t({ it: 'Registra la prima partita', en: 'Record First Battle' })}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {matchDayGroups.map((dayGroup) => {
                  const isExpanded = expandedDayKeys.has(dayGroup.dayKey);
                  return (
                    <Collapsible
                      key={dayGroup.dayKey}
                      open={isExpanded}
                      onOpenChange={(open) => toggleDayGroup(dayGroup.dayKey, open)}
                    >
                      <Card className="phyrexian-panel overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              <span className="font-medium text-foreground">{dayGroup.label}</span>
                              <span className="text-sm text-muted-foreground">
                                · {dayGroup.matchCount}{' '}
                                {t({
                                  it: dayGroup.matchCount === 1 ? 'partita' : 'partite',
                                  en: dayGroup.matchCount === 1 ? 'match' : 'matches',
                                })}
                              </span>
                            </button>
                          </CollapsibleTrigger>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 border-border/80 bg-background/40"
                            onClick={() => openDayExportModal(dayGroup.dayKey)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            {t({ it: 'Export', en: 'Export' })}
                          </Button>
                        </div>
                        <CollapsibleContent>
                          <div className="space-y-3 p-3">
                            {dayGroup.matches.length === 0 && isExpanded ? (
                              <p className="py-4 text-center text-sm text-muted-foreground">
                                {t({ it: 'Nessuna partita in questa giornata', en: 'No matches on this day' })}
                              </p>
                            ) : null}
                            {dayGroup.matches.map((match) => (
                              <Card key={match.id} className="border-border/70 bg-background/20 transition-colors hover:border-emerald-500/40">
                                <CardContent className="py-4">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0 flex-1">
                                      <div className="mb-3 flex flex-col gap-2">
                                        {match.match_participants.map((p) => {
                                          const deck = getParticipantDeckSnapshot(p);
                                          const displayName = getParticipantDisplayName(p);
                                          return (
                                            <div
                                              key={p.id}
                                              className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm ${
                                                p.is_winner
                                                  ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
                                                  : 'bg-secondary/80 text-secondary-foreground'
                                              }`}
                                            >
                                              <DeckImage
                                                src={deck?.commander_image}
                                                alt={deck?.commander || displayName}
                                                className="h-[4.5rem] w-[3.25rem] shrink-0 rounded object-cover object-top"
                                                fallbackClassName="h-[4.5rem] w-[3.25rem] shrink-0 rounded"
                                              />
                                              <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                  {p.is_winner && <Trophy className="h-3.5 w-3.5 shrink-0" />}
                                                  {p.is_winner && match.win_condition === 'last_standing' ? <Shield className="h-3.5 w-3.5 shrink-0" /> : null}
                                                  {p.is_winner && match.win_condition === 'combo' ? <Flame className="h-3.5 w-3.5 shrink-0" /> : null}
                                                  {p.is_winner && match.win_condition === 'concession' ? <Flag className="h-3.5 w-3.5 shrink-0" /> : null}
                                                  {p.is_winner && match.win_condition === 'alternate_card' ? <Crown className="h-3.5 w-3.5 shrink-0" /> : null}
                                                  {p.is_winner && match.win_condition === 'other' ? <Target className="h-3.5 w-3.5 shrink-0" /> : null}
                                                  <span className="font-semibold">{displayName}</span>
                                                  {deck?.bracket && (
                                                    <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300">
                                                      B{deck.bracket}
                                                    </span>
                                                  )}
                                                </div>
                                                {deck?.name ? (
                                                  <p className="mt-0.5 line-clamp-1 text-sm font-medium text-foreground">{deck.name}</p>
                                                ) : null}
                                                {deck?.commander ? (
                                                  <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{deck.commander}</p>
                                                ) : null}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {match.is_draw ? (
                                        <span className="mb-2 inline-flex rounded-full border border-slate-400/40 bg-slate-500/15 px-2.5 py-0.5 text-xs font-medium text-slate-200">
                                          {t({ it: 'Patta', en: 'Draw' })}
                                        </span>
                                      ) : null}
                                      {match.notes ? <FormattedMarkdown value={match.notes} className="italic" /> : null}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {(match.tracking_version || match.duration_seconds != null) ? (
                                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-cyan-300" onClick={() => setDetailsMatch(match)} title={t({ it: 'Dettagli tracking', en: 'Tracking details' })}>
                                          <Eye className="h-4 w-4" />
                                          <span className="hidden lg:inline">{t({ it: 'Dettagli', en: 'Details' })}</span>
                                        </Button>
                                      ) : null}
                                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-emerald-300" onClick={() => handleShareMatch(match)} title={t({ it: 'Condividi log', en: 'Share log' })}>
                                        <Share2 className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => openEditMatch(match)}>
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteMatch(match.id)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })}
              </div>
            )}
            {seasonContext ? <PreviousSeasonsPanel archives={seasonContext.archives} /> : null}
          </TabsContent>

          <TabsContent value="awards">
            <div className="space-y-5">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                  <Award className="h-5 w-5 text-emerald-300" /> Awards
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t({
                    it: 'Top 3 per ogni premio. I primati usano tutte le partite registrate; solo il premio Più veloce richiede almeno 3 partite tracciate.',
                    en: 'Top 3 for each award. Records use every saved match; only the Fastest award requires at least 3 tracked games.',
                  })}
                </p>
              </div>
              <div className="flex w-fit rounded-xl border border-border bg-background/40 p-1">
                {(['decks', 'players'] as const).map((view) => <Button key={view} size="sm" variant={awardsView === view ? 'default' : 'ghost'} onClick={() => setAwardsView(view)}>{view === 'players' ? t({ it: 'Giocatori', en: 'Players' }) : t({ it: 'Mazzi', en: 'Decks' })}</Button>)}
              </div>
              {awardsView === 'decks' ? (arenaAwards.length === 0 ? (
                <Card className="phyrexian-panel">
                  <CardContent className="py-12 text-center">
                    <Award className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                    <h3 className="text-lg font-medium text-foreground">
                      {t({ it: 'Awards non ancora disponibili', en: 'No awards yet' })}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t({ it: 'Completa altre partite con il tracking realtime per sbloccare i primati.', en: 'Complete more realtime-tracked games to unlock playgroup records.' })}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                  {arenaAwardGroups.map((awards) => {
                    const leadAward = awards[0];
                    const presentation = leadAward.kind === 'fastest'
                      ? { icon: Gauge, title: t({ it: 'Fastest Deck', en: 'Fastest Deck' }), tone: 'text-cyan-300', badge: 'border-cyan-300/40 bg-cyan-400/10 shadow-cyan-400/20' }
                      : leadAward.kind === 'group_slugger'
                        ? { icon: Flame, title: 'Group Slugger', tone: 'text-orange-300', badge: 'border-orange-300/40 bg-orange-400/10 shadow-orange-400/20' }
                        : leadAward.kind === 'executioner'
                          ? { icon: Crosshair, title: t({ it: 'Executioner', en: 'Executioner' }), tone: 'text-rose-300', badge: 'border-rose-300/40 bg-rose-400/10 shadow-rose-400/20' }
                          : leadAward.kind === 'runner_up'
                            ? { icon: Crown, title: t({ it: 'Eterno Secondo', en: 'Runner-up' }), tone: 'text-amber-300', badge: 'border-amber-300/50 bg-amber-400/15 shadow-amber-400/25' }
                            : leadAward.kind === 'archenemy'
                              ? { icon: Skull, title: 'Archenemy', tone: 'text-red-300', badge: 'border-red-300/40 bg-red-400/10 shadow-red-400/20' }
                              : leadAward.kind === 'comebacker'
                                ? { icon: TrendingUp, title: 'Comebacker', tone: 'text-emerald-300', badge: 'border-emerald-300/40 bg-emerald-400/10 shadow-emerald-400/20' }
                                : leadAward.kind === 'one_trick'
                                  ? { icon: Target, title: 'The one-trick', tone: 'text-blue-300', badge: 'border-blue-300/40 bg-blue-400/10 shadow-blue-400/20' }
                                  : leadAward.kind === 'combo_winner'
                                    ? { icon: Flame, title: 'I think I won', tone: 'text-teal-300', badge: 'border-teal-300/40 bg-teal-400/10 shadow-teal-400/20' }
                                    : { icon: Trophy, title: 'Junk Master', tone: 'text-lime-300', badge: 'border-lime-300/40 bg-lime-400/10 shadow-lime-400/20' };
                    const Icon = presentation.icon;
                    const awardDescription = leadAward.kind === 'fastest'
                      ? t({ it: 'Le vittorie più rapide tra i mazzi tracciati.', en: 'Fastest wins among tracked decks.' })
                      : leadAward.kind === 'group_slugger'
                        ? t({ it: 'Il mazzo che ha inflitto più danni al tavolo.', en: 'The deck that dealt the most damage to the table.' })
                        : leadAward.kind === 'executioner'
                          ? t({ it: 'Il mazzo con più eliminazioni.', en: 'The deck with the most eliminations.' })
                          : leadAward.kind === 'runner_up'
                            ? t({ it: 'Il mazzo arrivato più spesso al secondo posto.', en: 'The deck that finished second most often.' })
                            : leadAward.kind === 'archenemy'
                              ? t({ it: 'Il mazzo sconfitto per primo più spesso.', en: 'The deck eliminated first most often.' })
                              : leadAward.kind === 'comebacker'
                                ? t({ it: 'Le vittorie ottenute dopo essere stato in svantaggio.', en: 'Wins earned after falling behind.' })
                                : leadAward.kind === 'one_trick'
                                  ? t({ it: 'Il mazzo portato al tavolo più spesso.', en: 'The deck brought to the table most often.' })
                                  : leadAward.kind === 'combo_winner'
                                    ? t({ it: 'Le vittorie concluse con una combo.', en: 'Wins completed with a combo.' })
                                    : t({ it: 'Le vittorie ottenute con condizioni alternative.', en: 'Wins achieved through alternate conditions.' });
                    return (
                      <Card key={leadAward.kind} className="phyrexian-panel overflow-hidden border-white/10 bg-card/70">
                        <CardContent className="p-4">
                          <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                            <span className={`relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl border shadow-lg ${presentation.badge}`}>
                              <Trophy aria-hidden="true" className="absolute -right-1 -top-1 h-5 w-5 text-white/10" />
                              <Icon className={`relative h-5 w-5 ${presentation.tone}`} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{presentation.title}</p>
                              <p className={`text-sm font-bold ${presentation.tone}`}>{t({ it: 'Top 3 mazzi', en: 'Top 3 decks' })}</p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                              {awards.length}/3
                            </span>
                          </div>
                          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{awardDescription}</p>
                          <div className="space-y-3">
                            {awards.map((award) => {
                              const podium = award.rank === 1
                                ? { label: t({ it: 'Oro', en: 'Gold' }), tone: 'border-yellow-300 bg-yellow-300 text-yellow-950' }
                                : award.rank === 2
                                  ? { label: t({ it: 'Argento', en: 'Silver' }), tone: 'border-slate-200 bg-slate-200 text-slate-950' }
                                  : { label: t({ it: 'Bronzo', en: 'Bronze' }), tone: 'border-orange-500 bg-orange-600 text-white' };
                              const value = award.kind === 'fastest' ? formatGameDuration(award.value) : String(award.value);

                              return (
                                <div key={`${award.kind}:${award.rank}:${award.deck.key}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/35 p-2.5">
                                  <span aria-label={`${podium.label}, ${award.rank}`} className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-black ${podium.tone}`}>
                                    {award.rank}
                                  </span>
                                  <DeckImage src={award.deck.commanderImage} alt={award.deck.commander} className="h-14 w-10 shrink-0 rounded object-cover object-top" />
                                  <div className="min-w-0 flex-1">
                                    <p className="line-clamp-1 font-semibold text-foreground">{award.deck.name}</p>
                                    <p className="line-clamp-1 text-xs text-emerald-300">{award.deck.commander}</p>
                                    <p className="line-clamp-1 text-[11px] text-muted-foreground">{t({ it: 'Proprietario', en: 'Owner' })}: {award.deck.ownerDisplayName}</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                      {award.kind === 'one_trick' ? award.deck.gamesPlayed : award.deck.trackedGames}{' '}
                                      {award.kind === 'one_trick'
                                        ? t({ it: 'partite', en: 'games' })
                                        : t({ it: 'partite tracciate', en: 'tracked games' })}
                                    </p>
                                  </div>
                                  <span className={`shrink-0 text-sm font-black tabular-nums ${presentation.tone}`}>
                                    {value}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )) : <PlayerAwards awards={playerAwards} language={language} />}
            </div>
          </TabsContent>

          <TabsContent value="players">
            {playerStats.length === 0 && !canManageGroup ? (
              <Card className="bg-card/50 border-border">
                <CardContent className="py-12 text-center">
                  <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">{t({ it: 'Nessuna statistica giocatore', en: 'No player stats yet' })}</h3>
                  <p className="text-muted-foreground">{t({ it: 'Gioca qualche partita per vedere le statistiche', en: 'Play some battles to see player statistics' })}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {playerStats.length === 0 && (
                  <Card className="bg-card/50 border-border">
                    <CardContent className="py-8 text-center">
                      <User className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {t({ it: 'Nessuna partita nel periodo selezionato.', en: 'No battles in the selected period.' })}
                      </p>
                    </CardContent>
                  </Card>
                )}
                {playerStats.length > 0 && (
                <>
                <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card className="bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-emerald-500/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-emerald-400 mb-2">
                        <Trophy className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Miglior giocatore', en: 'Top Player' })}</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{playerStats[0]?.displayName || '-'}</p>
                      <p className="text-sm text-muted-foreground">{playerStats[0]?.winRate}% {t({ it: 'win rate', en: 'win rate' })}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Users className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Giocatori attivi', en: 'Active Players' })}</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{playerStats.length}</p>
                      <p className="text-sm text-muted-foreground">{t({ it: 'partecipanti totali', en: 'total participants' })}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <BarChart3 className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Partite totali', en: 'Total Games' })}</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{getFilteredMatches().length}</p>
                      <p className="text-sm text-muted-foreground">{t({ it: 'partite registrate', en: 'battles recorded' })}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <TrendingUp className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Win rate medio', en: 'Avg Win Rate' })}</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        {Math.round(playerStats.reduce((a, b) => a + b.winRate, 0) / playerStats.length)}%
                      </p>
                      <p className="text-sm text-muted-foreground">{t({ it: 'su tutti i giocatori', en: 'across all players' })}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-card/50 border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Medal className="w-5 h-5" />
                      {t({ it: 'Classifica giocatori', en: 'Player Leaderboard' })}
                    </CardTitle>
                    <CardDescription>{t({ it: 'Ordinata per win rate', en: 'Rankings by win rate' })}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {playerStats.map((player, index) => {
                        const rank = playerRanksByIndex[index] ?? index + 1;
                        return (
                        <div
                          key={player.key}
                          className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-lg ${
                            rank === 1 ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30' :
                            rank === 2 ? 'bg-gradient-to-r from-slate-400/10 to-slate-500/10 border border-slate-400/20' :
                            rank === 3 ? 'bg-gradient-to-r from-amber-600/10 to-amber-700/10 border border-amber-600/20' :
                            'bg-secondary/50'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                            rank === 1 ? 'bg-gradient-to-br from-emerald-400 to-teal-600 text-white' :
                            rank === 2 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800' :
                            rank === 3 ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white' :
                            'bg-secondary text-secondary-foreground'
                          }`}>
                            {rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-foreground">{player.displayName}</p>
                              {player.isGuest && (
                                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                                  Guest
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>{player.gamesPlayed} {t({ it: player.gamesPlayed === 1 ? 'partita' : 'partite', en: player.gamesPlayed === 1 ? 'game' : 'games' })}</span>
                              <span>{formatMatchRecord(player)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:justify-end">
                            <div className="text-left sm:text-right">
                              <p className="text-2xl font-bold text-emerald-400">{player.winRate}%</p>
                              <p className="text-xs text-muted-foreground">{t({ it: 'win rate', en: 'win rate' })}</p>
                            </div>
                            {canManageGroup && player.isGuest && (
                              <PlayerGuestDeleteButton
                                playerKey={player.key}
                                guests={guests}
                                deletingGuestIds={deletingGuestIds}
                                onDeleteGuest={handleDeleteGuest}
                                deleteLabel={t({ it: 'Elimina guest', en: 'Delete guest' })}
                              />
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
                </>
                )}

                <Card className="bg-card/50 border-border">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Users className="h-5 w-5" />
                      {t({ it: 'Membri del playgroup', en: 'Playgroup members' })}
                    </CardTitle>
                    <CardDescription>
                      {t({
                        it: 'Giocatori registrati con accesso al playgroup. Uscire o essere rimossi non cancella le partite già registrate.',
                        en: 'Registered players with access to this playgroup. Leaving or being removed does not delete past battles.',
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {members.map((member) => {
                        const isCreator = group?.created_by === member.id;
                        const canKick = canKickArenaMember({
                          actorId: user?.id || '',
                          targetId: member.id,
                          group,
                          isPlatformAdmin: adminMode,
                        });

                        return (
                          <div
                            key={member.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-secondary/30 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-foreground">{getProfileDisplayName(member)}</p>
                                <span className="text-xs text-muted-foreground">@{member.username}</span>
                                {isCreator && (
                                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                                    {t({ it: 'Creatore', en: 'Creator' })}
                                  </span>
                                )}
                                {member.id === user?.id && (
                                  <span className="rounded-full border border-border/70 bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {t({ it: 'Tu', en: 'You' })}
                                  </span>
                                )}
                              </div>
                            </div>
                            {canKick && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => handleKickMember(member)}
                                disabled={kickingMemberIds.includes(member.id)}
                                title={t({ it: 'Rimuovi membro', en: 'Remove member' })}
                              >
                                <UserMinus className={`h-4 w-4 ${kickingMemberIds.includes(member.id) ? 'animate-pulse' : ''}`} />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {canManageGroup && group ? <DirectArenaInvite groupId={group.id} /> : null}
                  </CardContent>
                </Card>

                {canManageGroup && (
                  <Card className="bg-card/50 border-border">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-foreground">
                        <UserPlus className="h-5 w-5" />
                        {t({ it: 'Guest del playgroup', en: 'Playgroup guests' })}
                      </CardTitle>
                      <CardDescription>
                        {t({
                          it: 'Crea un link monouso per trasformare un guest in utente senza perdere mazzi, partite o vittorie.',
                          en: 'Create a one-time link to turn a guest into a user without losing decks, matches, or wins.',
                        })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {guests.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t({ it: 'Nessun guest registrato in questo playgroup.', en: 'No guests registered in this playgroup.' })}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {guests.map((guest) => (
                            <div
                              key={guest.id}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-secondary/30 px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-foreground">{guest.display_name}</p>
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                                    Guest
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {guest.arena_guest_decks?.length || 0} {t({ it: 'mazzi', en: 'decks' })}
                                  {guest.last_played_at && (
                                    <> · {t({ it: 'Ultima partita', en: 'Last played' })} {format(new Date(guest.last_played_at), 'PP')}</>
                                  )}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-muted-foreground hover:text-emerald-300"
                                  onClick={() => openAddGuestDeckModal(guest)}
                                  title={t({ it: 'Aggiungi mazzo', en: 'Add deck' })}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeleteGuest(guest)}
                                  disabled={deletingGuestIds.includes(guest.id)}
                                  title={t({ it: 'Elimina guest', en: 'Delete guest' })}
                                >
                                  <Trash2 className={`h-4 w-4 ${deletingGuestIds.includes(guest.id) ? 'animate-pulse' : ''}`} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="commanders">
            {deckStats.length === 0 ? (
              <Card className="bg-card/50 border-border">
                <CardContent className="py-12 text-center">
                  <Swords className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">{t({ it: 'Nessuna statistica mazzo', en: 'No deck stats yet' })}</h3>
                  <p className="text-muted-foreground">{t({ it: 'Aggiungi mazzi e gioca partite per vedere le statistiche', en: 'Add decks and play battles to see deck statistics' })}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card className="bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-emerald-500/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-emerald-400 mb-2">
                        <Trophy className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Miglior mazzo', en: 'Best Deck' })}</span>
                      </div>
                      <p className="text-xl font-bold text-foreground truncate">{visibleDeckStats[0]?.name || '-'}</p>
                      <p className="text-xs text-muted-foreground">{visibleDeckStats[0]?.ownerDisplayName || '-'}</p>
                      {visibleDeckStats[0]?.bracket && (
                        <p className="text-xs text-emerald-300">
                          {t({ it: 'Bracket', en: 'Bracket' })} {visibleDeckStats[0].bracket}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">{visibleDeckStats[0]?.winRate ?? 0}% {t({ it: 'win rate', en: 'win rate' })}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Swords className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Mazzi unici', en: 'Unique Decks' })}</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">{deckStats.length}</p>
                      <p className="text-sm text-muted-foreground">{t({ it: 'mazzi tracciati', en: 'tracked decks' })}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <Target className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Piu giocato', en: 'Most Played' })}</span>
                      </div>
                      <p className="text-xl font-bold text-foreground truncate">
                        {[...visibleDeckStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]?.name || '-'}
                      </p>
                      {[...visibleDeckStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]?.bracket && (
                        <p className="text-xs text-emerald-300">
                          {t({ it: 'Bracket', en: 'Bracket' })} {[...visibleDeckStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0].bracket}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {[...visibleDeckStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]?.gamesPlayed || 0} {t({ it: 'partite', en: 'games' })}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50 border-border">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-muted-foreground mb-2">
                        <TrendingUp className="w-5 h-5" />
                        <span className="text-sm font-medium">{t({ it: 'Win rate medio', en: 'Avg Win Rate' })}</span>
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        {visibleDeckStats.length > 0 ? Math.round(visibleDeckStats.reduce((a, b) => a + b.winRate, 0) / visibleDeckStats.length) : 0}%
                      </p>
                      <p className="text-sm text-muted-foreground">{t({ it: 'su tutti i mazzi', en: 'across all decks' })}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-card/50 border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Swords className="w-5 h-5" />
                      {t({ it: 'Classifica mazzi', en: 'Deck Rankings' })}
                    </CardTitle>
                    <CardDescription>
                      {deckStatsSort === 'winRate' && t({ it: 'Ordinata per win rate, vittorie e partite giocate', en: 'Sorted by win rate, wins, and games played' })}
                      {deckStatsSort === 'gamesPlayed' && t({ it: 'Ordinata per partite giocate', en: 'Sorted by games played' })}
                    </CardDescription>
                    {provisionalDeckCount > 0 ? (
                      <button
                        type="button"
                        aria-pressed={showProvisionalDecks}
                        onClick={() => setShowProvisionalDecks((value) => !value)}
                        className="w-fit rounded-full border border-border bg-background/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-emerald-500/50 hover:text-emerald-200"
                      >
                        {showProvisionalDecks
                          ? t({ it: 'Nascondi mazzi con meno di 5 partite', en: 'Hide decks under 5 games' })
                          : t({ it: `Mostra ${provisionalDeckCount} mazzi con meno di 5 partite`, en: `Show ${provisionalDeckCount} decks under 5 games` })}
                      </button>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {visibleDeckStats.map((deck, index) => {
                        const isRanked = !isProvisionalDeckRanking(deck.gamesPlayed);
                        const rank = commanderRanksByIndex[index] ?? index + 1;
                        return (
                          <div
                            key={deck.key}
                            className={`flex flex-col gap-3 rounded-lg p-3 sm:flex-row sm:items-start sm:gap-4 ${
                              isRanked && rank === 1 ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30' :
                              'bg-secondary/50'
                            }`}
                          >
                            <div className="flex items-start gap-3 sm:contents">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                              rank === 1 ? 'bg-gradient-to-br from-emerald-400 to-teal-600 text-white' :
                              rank === 2 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800' :
                              rank === 3 ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white' :
                              'bg-secondary text-secondary-foreground'
                            }`}>
                              {rank}
                            </div>
                            <DeckImage
                              src={deck.commanderImage}
                              alt={deck.commander}
                              className="h-14 w-20 shrink-0 rounded object-cover object-top"
                            />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                {isRanked && rank === 1 && <Trophy className="w-4 h-4 text-emerald-400" />}
                              <p className="font-semibold text-foreground break-words">{deck.commander}</p>
                              {!isRanked ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">{t({ it: 'Campione ridotto', en: 'Low sample' })}</span> : null}
                              <p className="w-full text-xs text-muted-foreground">{t({ it: 'Proprietario', en: 'Owner' })}: {deck.ownerDisplayName}</p>
                                {deck.bracket && <BracketBadge bracket={deck.bracket} />}
                                <EdhrecBadge commander={deck.commander} />
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>{deck.gamesPlayed} {t({ it: deck.gamesPlayed === 1 ? 'partita' : 'partite', en: deck.gamesPlayed === 1 ? 'game' : 'games' })}</span>
                                <span>{formatMatchRecord(deck)}</span>
                              </div>
                              <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full"
                                  style={{ width: `${deck.winRate}%` }}
                                />
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center justify-between gap-2 sm:block sm:text-right">
                              <p className="text-xs text-muted-foreground sm:hidden">{t({ it: 'win rate', en: 'win rate' })}</p>
                              <div>
                                <p className="text-2xl font-bold text-emerald-400">{deck.winRate}%</p>
                                <p className="hidden text-xs text-muted-foreground sm:block">{t({ it: 'win rate', en: 'win rate' })}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {visibleDeckStats.length === 0 ? (
                        <p className="py-5 text-center text-sm text-muted-foreground">{t({ it: 'Nessun mazzo ha ancora raggiunto 5 partite.', en: 'No deck has reached 5 games yet.' })}</p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="meta">
            {getFilteredMatches().length === 0 ? (
              <Card className="phyrexian-panel">
                <CardContent className="py-12 text-center">
                  <Palette className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-medium text-foreground">
                    {t({ it: 'Nessun dato meta ancora', en: 'No meta data yet' })}
                  </h3>
                  <p className="text-muted-foreground">
                    {t({ it: 'Gioca partite con mazzi tracciati per vedere il meta colori del playgroup.', en: 'Play tracked-deck battles to see this playgroup\'s color meta.' })}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-5">
                {(syncingDeckColors || colorAnalytics.missingColorGames > 0) && (
                  <Card className="border-border/70 bg-card/50">
                    <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {syncingDeckColors && <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />}
                        <span>
                          {syncingDeckColors
                            ? t({ it: 'Sto aggiornando i colori dei mazzi mancanti...', en: 'Updating missing deck colors...' })
                            : t({
                                it: `${colorAnalytics.missingColorGames} partite hanno ancora mazzi senza colori risolti.`,
                                en: `${colorAnalytics.missingColorGames} games still have decks without resolved colors.`,
                              })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="phyrexian-panel">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Palette className="h-5 w-5 text-emerald-300" />
                      {t({ it: 'Meta colori', en: 'Color meta' })}
                    </CardTitle>
                    <CardDescription>
                      {t({
                        it: 'Statistiche per W, U, B, R, G e incolore (C). I colori senza partite restano visibili ma attenuati.',
                        en: 'Stats for W, U, B, R, G, and colorless (C). Colors with no games stay visible but muted.',
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ManaColorReport
                      played={colorAnalytics.played}
                      won={colorAnalytics.won}
                      winRates={colorAnalytics.winRates}
                      missingColorGames={colorAnalytics.missingColorGames}
                      emptyLabel={t({
                        it: 'Nessun colore risolto nel periodo selezionato. Attendi la sincronizzazione o verifica che i mazzi abbiano il comandante impostato.',
                        en: 'No resolved colors in the selected period. Wait for sync or make sure decks have a commander set.',
                      })}
                    />
                  </CardContent>
                </Card>

                <Card className="phyrexian-panel">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      {t({ it: 'Identità multicolore', en: 'Multicolor identities' })}
                    </CardTitle>
                    <CardDescription>
                      {t({
                        it: 'Le 5 combinazioni più frequenti: gilde, tricolori (Naya, Grixis, Jeskai, Mardu, ecc.) o Pentacolor.',
                        en: 'Top 5 combinations: guilds, three-color identities (Naya, Grixis, Jeskai, Mardu, etc.), or Pentacolor.',
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ManaColorPairs
                      pairs={colorAnalytics.pairs}
                      emptyLabel={t({
                        it: 'Nessuna identità multicolore nel periodo selezionato.',
                        en: 'No multicolor identities in the selected period.',
                      })}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {(canLeaveCurrentArena || canManageGroup) && (
          <Card className="mt-6 border-border/70 bg-card/65 lg:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">
                {t({ it: 'Gestione playgroup', en: 'Playgroup management' })}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {canLeaveCurrentArena && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={openLeaveArenaModal}
                  className="h-11 justify-start border-border text-foreground"
                >
                  <DoorOpen className="mr-2 h-4 w-4" />
                  {t({ it: 'Esci dal playgroup', en: 'Leave playgroup' })}
                </Button>
              )}
              {canManageGroup && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={openDeleteArenaModal}
                  className="h-11 justify-start border-destructive/35 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t({ it: 'Elimina playgroup', en: 'Delete playgroup' })}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      {showMatchModal && (
        <ModalOverlay>
          <ModalCard size="xl">
            <CardHeader className="shrink-0 border-b border-border/70">
              <CardTitle className="text-foreground">{t({ it: 'Registra partita', en: 'Record Battle' })}</CardTitle>
              <CardDescription className="text-muted-foreground">{t({ it: 'Seleziona partecipanti e vincitore', en: 'Select combatants and the victor' })}</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto py-6">
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-foreground mb-3 block">{t({ it: 'Partecipanti', en: 'Combatants' })}</label>
                  <div className="space-y-2">
                    {members.map((member) => {
                      const participantKey = toUserParticipantKey(member.id);
                      const deckOptions = getParticipantDeckOptions(participantKey).map(toDeckOption);
                      const filteredDeckOptions = getFilteredParticipantDeckOptions(participantKey, participantDeckSearches).map(toDeckOption);
                      const selectedDeck = getSelectedParticipantDeck(participantKey);

                      return (
                        <MatchParticipantRow
                          key={participantKey}
                          participantKey={participantKey}
                          displayName={getProfileDisplayName(member)}
                          deckCount={deckOptions.length}
                          selected={selectedParticipantKeys.includes(participantKey)}
                          selectedDeck={selectedDeck ? toDeckOption(selectedDeck) : null}
                          deckListHidden={Boolean(hiddenParticipantDeckLists[participantKey])}
                          searchValue={participantDeckSearches[participantKey] || ''}
                          selectedDeckId={participantDecks[participantKey] || ''}
                          filteredDecks={filteredDeckOptions}
                          onToggle={() => toggleParticipantSelection(participantKey)}
                          onSearchChange={(value) => setParticipantDeckSearches((prev) => ({ ...prev, [participantKey]: value }))}
                          onToggleDeckList={() => setHiddenParticipantDeckLists((prev) => ({ ...prev, [participantKey]: !prev[participantKey] }))}
                          onSelectDeck={(deckId) => setParticipantDecks((prev) => ({ ...prev, [participantKey]: deckId }))}

                        />
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-foreground">{t({ it: 'Guest', en: 'Guests' })}</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border text-foreground"
                      onClick={() => {
                        setGuestDeckTargetId(null);
                        setGuestModalMode(guests.length > 0 ? 'pick-existing' : 'create');
                        setShowGuestModal(true);
                      }}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      {t({ it: 'Aggiungi guest', en: 'Add guest' })}
                    </Button>
                  </div>
                  {selectedParticipantKeys.filter((key) => key.startsWith('guest:')).length === 0 ? (
                    <p className="rounded-lg border border-border/70 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                      {t({ it: 'Nessun guest selezionato. Aggiungi un guest per includerlo nella partita.', en: 'No guests selected. Add a guest to include them in this battle.' })}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedParticipantKeys
                        .filter((key) => key.startsWith('guest:'))
                        .map((participantKey) => {
                          const parsed = parseParticipantKey(participantKey);
                          const guest = guests.find((entry) => entry.id === parsed?.id);
                          const deckOptions = getParticipantDeckOptions(participantKey).map(toDeckOption);
                          const filteredDeckOptions = getFilteredParticipantDeckOptions(participantKey, participantDeckSearches).map(toDeckOption);
                          const selectedDeck = getSelectedParticipantDeck(participantKey);

                          return (
                            <MatchParticipantRow
                              key={participantKey}
                              participantKey={participantKey}
                              displayName={guest?.display_name || t({ it: 'Guest', en: 'Guest' })}
                              isGuest
                              deckCount={deckOptions.length}
                              selected
                              selectedDeck={selectedDeck ? toDeckOption(selectedDeck) : null}
                              deckListHidden={Boolean(hiddenParticipantDeckLists[participantKey])}
                              searchValue={participantDeckSearches[participantKey] || ''}
                              selectedDeckId={participantDecks[participantKey] || ''}
                              filteredDecks={filteredDeckOptions}
                              onToggle={() => toggleParticipantSelection(participantKey)}
                              onSearchChange={(value) => setParticipantDeckSearches((prev) => ({ ...prev, [participantKey]: value }))}
                              onToggleDeckList={() => setHiddenParticipantDeckLists((prev) => ({ ...prev, [participantKey]: !prev[participantKey] }))}
                              onSelectDeck={(deckId) => setParticipantDecks((prev) => ({ ...prev, [participantKey]: deckId }))}
    
                            />
                          );
                        })}
                    </div>
                  )}
                </div>

                {selectedParticipantKeys.length >= 2 && (
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Checkbox
                        checked={matchIsDraw}
                        onCheckedChange={(checked) => {
                          const isDraw = checked === true;
                          setMatchIsDraw(isDraw);
                          if (isDraw) setWinnerKey('');
                        }}
                      />
                      {t({ it: 'Patta', en: 'Draw' })}
                    </label>
                    {!matchIsDraw ? (
                    <div>
                    <label className="text-sm font-medium text-foreground mb-3 block">{t({ it: 'Vincitore', en: 'Victor' })}</label>
                    <Select value={winnerKey} onValueChange={(value) => setWinnerKey(value as ParticipantKey)}>
                      <SelectTrigger className="w-full bg-background border-border text-foreground"><SelectValue placeholder={t({ it: 'Seleziona il vincitore', en: 'Select the victor' })} /></SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {selectedParticipantKeys.map((participantKey) => {
                          const parsed = parseParticipantKey(participantKey);
                          const displayName = parsed?.type === 'guest'
                            ? guests.find((entry) => entry.id === parsed.id)?.display_name || t({ it: 'Guest', en: 'Guest' })
                            : getProfileDisplayName(members.find((member) => member.id === parsed?.id));
                          const selectedDeck = getSelectedParticipantDeck(participantKey);
                          return (
                            <SelectItem key={participantKey} value={participantKey}>
                              {displayName}{selectedDeck ? ` (${selectedDeck.commander})` : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <label className="mb-2 mt-4 block text-sm font-medium text-foreground">
                      {t({ it: 'Come ha vinto?', en: 'How did they win?' })}
                    </label>
                    <Select
                      value={matchWinCondition}
                      onValueChange={(value) => setMatchWinCondition(value as NonNullable<Match['win_condition']>)}
                    >
                      <SelectTrigger className="w-full border-border bg-background text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-card">
                        <SelectItem value="last_standing">{t({ it: 'Ultimo in gioco', en: 'Last standing' })}</SelectItem>
                        <SelectItem value="combo">Combo</SelectItem>
                        <SelectItem value="concession">{t({ it: 'Concessione', en: 'Concession' })}</SelectItem>
                        <SelectItem value="alternate_card">{t({ it: 'Vittoria alternativa', en: 'Alternate win' })}</SelectItem>
                        <SelectItem value="other">{t({ it: 'Altro', en: 'Other' })}</SelectItem>
                      </SelectContent>
                    </Select>
                    </div>
                    ) : null}
                  </div>
                )}
                <div>
                  <label htmlFor="match-played-at" className="text-sm font-medium text-foreground mb-2 block">
                    {t({ it: 'Data', en: 'Date' })}
                  </label>
                  <Input
                    id="match-played-at"
                    type="date"
                    value={matchPlayedAt}
                    onChange={(e) => setMatchPlayedAt(e.target.value)}
                    className="bg-background/50 border-border text-foreground"
                  />
                </div>
                <RichTextEditor
                  label={t({ it: 'Note (opzionali)', en: 'Notes (optional)' })}
                  value={matchNotes}
                  onChange={setMatchNotes}
                  placeholder={t({ it: 'Cronaca della partita...', en: 'Epic saga of the battle...' })}
                  hint={t({
                    it: 'Usa la barra formato per grassetto, corsivo, barrato, a capo ed elenchi.',
                    en: 'Use the format toolbar for bold, italic, strike, line breaks, and bullet lists.',
                  })}
                  minRows={3}
                />
              </div>
            </CardContent>
            <div className="shrink-0 border-t border-border/70 bg-card px-6 py-4">
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={resetMatchForm} className="flex-1 border-border text-foreground">{t({ it: 'Annulla', en: 'Cancel' })}</Button>
                <Button onClick={handleCreateMatch} disabled={savingMatch} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700">
                  {savingMatch ? t({ it: 'Registrazione...', en: 'Recording...' }) : t({ it: 'Registra partita', en: 'Record Battle' })}
                </Button>
              </div>
            </div>
          </ModalCard>
        </ModalOverlay>
      )}

      {exportDayKey && (
        <ModalOverlay>
          <ModalCard>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Download className="h-5 w-5" />
                {t({ it: 'Export partite', en: 'Export matches' })}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {matchDayGroups.find((entry) => entry.dayKey === exportDayKey)?.label}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RichTextEditor
                label={t({ it: 'Intro', en: 'Intro' })}
                value={exportIntro}
                onChange={setExportIntro}
                placeholder={t({
                  it: 'Scrivi l\'intro del post...',
                  en: 'Write the post intro...',
                })}
                hint={t({
                  it: 'Usa la barra formato per grassetto, corsivo, barrato, a capo ed elenchi.',
                  en: 'Use the format toolbar for bold, italic, strike, line breaks, and bullet lists.',
                })}
                minRows={4}
              />
            </CardContent>
            <div className="shrink-0 border-t border-border/70 bg-card px-6 py-4">
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDayExportModal}
                  className="flex-1 border-border text-foreground"
                >
                  {t({ it: 'Annulla', en: 'Cancel' })}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleExportDayMatches()}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700"
                >
                  {t({ it: 'Genera export', en: 'Generate export' })}
                </Button>
              </div>
            </div>
          </ModalCard>
        </ModalOverlay>
      )}

      {/* Edit Arena Modal */}
      {showEditArenaModal && (
        <ModalOverlay>
          <ModalCard>
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Pencil className="w-5 h-5" /> {t({ it: 'Modifica playgroup', en: 'Edit Playgroup' })}
              </CardTitle>
              <CardDescription className="text-muted-foreground">{t({ it: 'Aggiorna nome e descrizione del playgroup', en: 'Update the playgroup name and description' })}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t({ it: 'Nome playgroup', en: 'Playgroup Name' })}</label>
                  <Input
                    value={editArenaName}
                    onChange={(e) => setEditArenaName(e.target.value)}
                    placeholder={t({ it: 'Il mio playgroup', en: 'My Playgroup' })}
                    className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t({ it: 'Descrizione (opzionale)', en: 'Description (optional)' })}</label>
                  <Textarea
                    value={editArenaDescription}
                    onChange={(e) => setEditArenaDescription(e.target.value)}
                    placeholder={t({ it: 'Descrizione del playgroup...', en: 'A description of this playgroup...' })}
                    className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/30 p-3">
                  <Checkbox
                    id="arena-is-public"
                    checked={editArenaIsPublic}
                    onCheckedChange={(checked) => setEditArenaIsPublic(checked === true)}
                  />
                  <div className="space-y-1">
                    <label htmlFor="arena-is-public" className="text-sm font-medium text-foreground">
                      {t({ it: 'Profilo playgroup pubblico', en: 'Public playgroup profile' })}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {t({
                        it: 'Chi ha il link puo vedere statistiche e partite in sola lettura.',
                        en: 'Anyone with the link can view read-only stats and match history.',
                      })}
                    </p>
                    {editArenaIsPublic && group?.invite_code && (
                      <a
                        href={`/arena/${group.invite_code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"
                      >
                        {t({ it: 'Apri pagina pubblica', en: 'Open public page' })}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
                <ArenaSeasonSettings
                  enabled={editArenaSeasonsEnabled}
                  resetMonth={editArenaResetMonth}
                  locale={language === 'it' ? 'it-IT' : 'en-US'}
                  labels={{
                    enabled: t({ it: 'Abilita le season', en: 'Enable seasons' }),
                    enabledHint: t({
                      it: 'Classifiche e statistiche ripartono ogni anno. Disabilitando, l’Arena usa tutto lo storico.',
                      en: 'Leaderboards and stats restart yearly. When disabled, the Arena uses its full history.',
                    }),
                    startMonth: t({ it: 'Mese di inizio season', en: 'Season start month' }),
                    resetHint: t({
                      it: 'La season dura un anno. Cambiare mese ricalcola gli archivi senza eliminare partite o score personali.',
                      en: 'A season lasts one year. Changing the month rebuilds archives without deleting matches or personal scores.',
                    }),
                  }}
                  onEnabledChange={setEditArenaSeasonsEnabled}
                  onResetMonthChange={setEditArenaResetMonth}
                />
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1 border-border text-foreground" onClick={() => setShowEditArenaModal(false)}>
                    {t({ it: 'Annulla', en: 'Cancel' })}
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700"
                    onClick={handleSaveArena}
                    disabled={savingArena || !editArenaName.trim()}
                  >
                    {savingArena ? t({ it: 'Salvataggio...', en: 'Saving...' }) : t({ it: 'Salva modifiche', en: 'Save Changes' })}
                  </Button>
                </div>
              </div>
            </CardContent>
          </ModalCard>
        </ModalOverlay>
      )}

      {showLeaveArenaModal && group && (
        <ModalOverlay>
          <ModalCard>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <DoorOpen className="h-5 w-5" />
                {t({ it: 'Esci dal playgroup', en: 'Leave playgroup' })}
              </CardTitle>
              <CardDescription>
                {t({
                  it: 'Perderai accesso a questo playgroup, ma le partite già registrate resteranno nello storico del gruppo.',
                  en: 'You will lose access to this playgroup, but battles already recorded will remain in the group history.',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-md border border-border/70 bg-background/35 p-3 text-sm text-muted-foreground">
                  {t({ it: 'Per confermare, scrivi:', en: 'To confirm, type:' })}
                  <div className="mt-2 font-semibold text-foreground">confirm</div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="leaveArenaConfirmation" className="text-sm font-medium text-foreground">
                    {t({ it: 'Conferma', en: 'Confirmation' })}
                  </label>
                  <Input
                    id="leaveArenaConfirmation"
                    value={leaveArenaConfirmation}
                    onChange={(e) => setLeaveArenaConfirmation(e.target.value)}
                    placeholder="confirm"
                    className="border-border bg-background/50 text-foreground placeholder:text-muted-foreground"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-border text-foreground"
                    onClick={() => {
                      setShowLeaveArenaModal(false);
                      setLeaveArenaConfirmation('');
                    }}
                    disabled={leavingArena}
                  >
                    {t({ it: 'Annulla', en: 'Cancel' })}
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700"
                    onClick={handleLeaveArena}
                    disabled={leavingArena || !isLeaveArenaConfirmationValid(leaveArenaConfirmation)}
                  >
                    {leavingArena ? t({ it: 'Uscita...', en: 'Leaving...' }) : t({ it: 'Esci', en: 'Leave' })}
                  </Button>
                </div>
              </div>
            </CardContent>
          </ModalCard>
        </ModalOverlay>
      )}

      {showDeleteArenaModal && group && (
        <ModalOverlay>
          <ModalCard className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t({ it: 'Elimina playgroup', en: 'Delete Playgroup' })}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {t({
                  it: 'Questa azione rimuove playgroup, partite e iscrizioni collegate. Non può essere annullata.',
                  en: 'This removes the playgroup, battles, and memberships. It cannot be undone.',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-muted-foreground">
                  {t({ it: 'Per confermare, scrivi esattamente:', en: 'To confirm, type exactly:' })}
                  <div className="mt-2 break-words font-semibold text-foreground">{group.name}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {t({ it: 'Nome playgroup', en: 'Playgroup name' })}
                  </label>
                  <Input
                    value={deleteArenaConfirmation}
                    onChange={(e) => setDeleteArenaConfirmation(e.target.value)}
                    placeholder={group.name}
                    className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-border text-foreground"
                    onClick={() => setShowDeleteArenaModal(false)}
                    disabled={deletingArena}
                  >
                    {t({ it: 'Annulla', en: 'Cancel' })}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1"
                    onClick={handleDeleteGroup}
                    disabled={deletingArena || deleteArenaConfirmation !== group.name}
                  >
                    {deletingArena ? t({ it: 'Eliminazione...', en: 'Deleting...' }) : t({ it: 'Elimina playgroup', en: 'Delete Playgroup' })}
                  </Button>
                </div>
              </div>
            </CardContent>
          </ModalCard>
        </ModalOverlay>
      )}

      {/* Edit Match Modal */}
      {detailsMatch && (
        <ModalOverlay>
          <ModalCard size="lg">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <BarChart3 className="h-5 w-5 text-cyan-300" />
                  {t({ it: 'Dettagli della partita', en: 'Match details' })}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(new Date(detailsMatch.played_at), 'PPP')} · {group?.name}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setDetailsMatch(null)} aria-label={t({ it: 'Chiudi', en: 'Close' })}>
                <span className="text-xl leading-none">×</span>
              </Button>
            </div>
            <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/70 bg-background/35 p-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{t({ it: 'Durata', en: 'Duration' })}</p>
                  <p className="mt-1 font-bold text-foreground">{detailsMatch.duration_seconds != null ? formatGameDuration(detailsMatch.duration_seconds) : '—'}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/35 p-3">
                  <p className="text-xs text-muted-foreground">{t({ it: 'Vittoria', en: 'Win condition' })}</p>
                  <p className="mt-1 font-bold text-foreground">{detailsMatch.is_draw ? t({ it: 'Patta', en: 'Draw' }) : getWinConditionLabel(detailsMatch.win_condition)}</p>
                </div>
              </div>

              {detailsRecapLoading ? <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-6 text-center text-sm text-cyan-100">{t({ it: 'Caricamento riepilogo…', en: 'Loading recap…' })}</div> : null}
              {(detailsLiveGame || (detailsMatch.tracking_version != null ? buildHistoricalLiveGameRecord(detailsMatch) : null)) ? <LiveGameRecapView record={detailsLiveGame ?? buildHistoricalLiveGameRecord(detailsMatch)} labels={{ timeline: t({ it: 'Stato finale', en: 'Final state' }), highlights: t({ it: 'Momenti chiave', en: 'Highlights' }), empty: t({ it: 'Nessun momento chiave registrato.', en: 'No highlights recorded.' }) }} /> : null}

              <div className="space-y-3">
                {detailsMatch.match_participants
                  .slice()
                  .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))
                  .map((participant) => {
                    const deck = getParticipantDeckSnapshot(participant);
                    const impact = (participant.life_damage_dealt || 0) + (participant.commander_damage_dealt || 0) + (participant.infect_dealt || 0);
                    const damage = participant.life_damage_dealt || 0;
                    const gained = participant.life_gained || 0;
                    const lost = participant.life_lost || 0;
                    const activity = Math.max(1, damage + gained + lost);
                    const damageEnd = (damage / activity) * 100;
                    const gainedEnd = damageEnd + (gained / activity) * 100;
                    const maxImpact = Math.max(1, ...detailsMatch.match_participants.map((entry) => (
                      (entry.life_damage_dealt || 0) + (entry.commander_damage_dealt || 0) + (entry.infect_dealt || 0)
                    )));
                    return (
                      <div key={participant.id} className={`rounded-xl border p-3 ${participant.is_winner ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border/70 bg-background/25'}`}>
                        <div className="mb-3 flex items-center gap-3">
                          <DeckImage src={deck?.commander_image} alt={deck?.commander || ''} className="h-14 w-10 shrink-0 rounded object-cover object-top" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-foreground">{getParticipantDisplayName(participant)}</p>
                              {participant.placement ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">#{participant.placement}</span> : null}
                              {participant.was_starting_player ? <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200">{t({ it: 'Ha iniziato', en: 'Started' })}</span> : null}
                            </div>
                            <p className="line-clamp-1 text-xs text-emerald-300">{deck?.name || deck?.commander}</p>
                          </div>
                          <div className="ml-auto hidden shrink-0 items-center gap-2 sm:flex">
                            <div className="grid h-14 w-14 place-items-center rounded-full" style={{ background: `conic-gradient(#fb7185 0 ${damageEnd}%, #34d399 ${damageEnd}% ${gainedEnd}%, #38bdf8 ${gainedEnd}% 100%)` }}>
                              <div className="grid h-9 w-9 place-items-center rounded-full bg-card text-[10px] font-black text-foreground">{activity}</div>
                            </div>
                            <div className="text-[10px] leading-4 text-muted-foreground"><p><span className="text-rose-300">●</span> {t({ it: 'danni', en: 'damage' })}</p><p><span className="text-emerald-300">●</span> {t({ it: 'cura', en: 'healing' })}</p><p><span className="text-sky-300">●</span> {t({ it: 'subiti', en: 'taken' })}</p></div>
                          </div>
                        </div>
                        <div className="mb-3 rounded-lg border border-border/60 bg-background/35 p-2.5">
                          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                            <span>{t({ it: 'Pressione sul tavolo', en: 'Table pressure' })}</span>
                            <span className="font-bold text-foreground">{impact}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-secondary">
                            <div className={`h-full rounded-full ${participant.is_winner ? 'bg-emerald-400' : 'bg-cyan-400'}`} style={{ width: `${(impact / maxImpact) * 100}%` }} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                          {[
                            [t({ it: 'Danni inflitti', en: 'Damage dealt' }), participant.life_damage_dealt || 0],
                            ['KO', participant.eliminations_caused || 0],
                            [t({ it: 'Danno commander', en: 'Commander damage' }), participant.commander_damage_dealt || 0],
                            [t({ it: 'Infect inflitto', en: 'Infect dealt' }), participant.infect_dealt || 0],
                          ].filter(([, value]) => Number(value) > 0).map(([label, value]) => (
                            <div key={String(label)} className="rounded-lg bg-secondary/45 px-2.5 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                              <p className="font-bold text-foreground">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </ModalCard>
        </ModalOverlay>
      )}

      {group ? <ArenaInviteQrDialog
        open={showInviteQr}
        inviteCode={group.invite_code}
        arenaName={group.name}
        onClose={() => setShowInviteQr(false)}
        labels={{
          title: t({ it: 'QR Playgroup', en: 'Playgroup QR' }),
          hint: t({ it: 'Scansiona per entrare in questo playgroup.', en: 'Scan to join this playgroup.' }),
          close: t({ it: 'Chiudi', en: 'Close' }),
        }}
      /> : null}

      {editingMatch && (
        <ModalOverlay>
          <ModalCard size="xl">
            <CardHeader className="shrink-0 border-b border-border/70">
              <CardTitle className="text-foreground flex items-center gap-2">
                <Pencil className="w-5 h-5" /> {t({ it: 'Modifica partita', en: 'Edit Battle' })}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {t({ it: 'Aggiorna data, mazzi, vincitore e note.', en: 'Update date, decks, winner, and notes.' })}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto py-6">
              <div className="space-y-6">
                <div>
                  <label htmlFor="edit-match-played-at" className="text-sm font-medium text-foreground mb-2 block">
                    {t({ it: 'Data', en: 'Date' })}
                  </label>
                  <Input
                    id="edit-match-played-at"
                    type="date"
                    value={editMatchPlayedAt}
                    onChange={(e) => setEditMatchPlayedAt(e.target.value)}
                    className="bg-background/50 border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-3 block">{t({ it: 'Assegnazione mazzi', en: 'Deck Assignments' })}</label>
                  <div className="space-y-3">
                    {editingMatch.match_participants.map((p) => {
                      const participantKey = editMatchPlayerKeys[p.id] || getParticipantKey(p);
                      if (!participantKey) return null;

                      const parsedPlayer = parseParticipantKey(participantKey);
                      const playerLabel = editMatchPlayerOptions.find((option) => option.key === participantKey)?.label
                        || getParticipantDisplayName(p);
                      const deckOptions = getParticipantDeckOptions(participantKey).map(toDeckOption);
                      const filteredDeckOptions = getFilteredEditMatchDeckOptions(p.id, participantKey).map(toDeckOption);
                      const selectedDeck = getSelectedEditMatchDeck(p.id, participantKey);
                      const deckListHidden = hiddenEditMatchDeckLists[p.id];

                      return (
                        <div key={p.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{playerLabel}</p>
                                {parsedPlayer?.type === 'guest' && (
                                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                                    Guest
                                  </span>
                                )}
                                {deckOptions.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    ({deckOptions.length} {t({ it: deckOptions.length === 1 ? 'mazzo' : 'mazzi', en: deckOptions.length === 1 ? 'deck' : 'decks' })})
                                  </span>
                                )}
                              </div>
                              {selectedDeck && (
                                <p className="mt-1 truncate text-xs text-emerald-300">
                                  {selectedDeck.name} - {selectedDeck.commander}
                                </p>
                              )}
                            </div>

                            {deckOptions.length > 0 && (
                              <div className="flex flex-col gap-2 sm:min-w-80 sm:flex-row sm:items-center">
                                <div className="relative flex-1">
                                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                  <Input
                                    value={editMatchDeckSearches[p.id] || ''}
                                    onChange={(event) => setEditMatchDeckSearches((prev) => ({ ...prev, [p.id]: event.target.value }))}
                                    placeholder={t({ it: 'Cerca mazzo...', en: 'Search deck...' })}
                                    className="h-9 bg-background/50 border-border pl-9 text-foreground placeholder:text-muted-foreground"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0 border-border text-foreground"
                                  onClick={() => setHiddenEditMatchDeckLists((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                                >
                                  {deckListHidden ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
                                  {deckListHidden ? t({ it: 'Mostra', en: 'Show' }) : t({ it: 'Nascondi', en: 'Hide' })}
                                </Button>
                              </div>
                            )}
                          </div>

                          {canManageGroup ? (
                            <div className="mb-3 space-y-1.5">
                              <label className="text-xs font-medium text-muted-foreground">{t({ it: 'Giocatore', en: 'Player' })}</label>
                              <Select
                                value={participantKey}
                                onValueChange={(value) => {
                                  const nextKey = value as ParticipantKey;
                                  const previousKey = editMatchPlayerKeys[p.id] || getParticipantKey(p);
                                  setEditMatchPlayerKeys((current) => ({ ...current, [p.id]: nextKey }));
                                  setEditMatchPlayerDecks((current) => ({ ...current, [p.id]: '' }));
                                  setEditMatchDeckSearches((current) => ({ ...current, [p.id]: '' }));
                                  setHiddenEditMatchDeckLists((current) => ({ ...current, [p.id]: false }));
                                  if (previousKey && editMatchWinnerKey === previousKey) setEditMatchWinnerKey(nextKey);
                                }}
                              >
                                <SelectTrigger className="h-9 w-full bg-background/50 border-border text-foreground">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                  {editMatchPlayerOptions.map((option) => (
                                    <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}

                          {deckOptions.length > 0 ? (
                            deckListHidden ? (
                              <div className="rounded-lg border border-border/70 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                                {selectedDeck
                                  ? t({ it: 'Lista mazzi nascosta. Il mazzo selezionato resta assegnato.', en: 'Deck list hidden. The selected deck stays assigned.' })
                                  : t({ it: 'Lista mazzi nascosta. Nessun mazzo selezionato.', en: 'Deck list hidden. No deck selected.' })}
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-1 gap-3 sm:grid-flow-col sm:auto-cols-[minmax(290px,320px)] sm:overflow-x-auto sm:pb-3">
                                  <button
                                    type="button"
                                    onClick={() => setEditMatchPlayerDecks((prev) => ({ ...prev, [p.id]: '' }))}
                                    className={`h-28 rounded-lg border p-3 text-left text-xs transition-colors ${
                                      !editMatchPlayerDecks[p.id] ? 'border-emerald-500 bg-emerald-500/10' : 'border-border bg-background/25 hover:border-emerald-500/50'
                                    }`}
                                  >
                                    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border/70 bg-background/25 px-3 text-center">
                                      <span className="text-muted-foreground">{t({ it: 'Nessun mazzo', en: 'No deck' })}</span>
                                    </div>
                                  </button>
                                  {filteredDeckOptions.map((deck) => (
                                    <button
                                      key={deck.id}
                                      type="button"
                                      onClick={() => setEditMatchPlayerDecks((prev) => ({ ...prev, [p.id]: deck.id }))}
                                      className={`min-h-[7.5rem] rounded-lg border p-3 text-left transition-colors ${
                                        editMatchPlayerDecks[p.id] === deck.id
                                          ? 'border-emerald-500 bg-emerald-500/10'
                                          : 'border-border bg-background/25 hover:border-emerald-500/50'
                                      }`}
                                    >
                                      <div className="flex h-full items-start gap-3">
                                        <DeckImage
                                          src={deck.commander_image}
                                          alt={deck.commander}
                                          className="h-20 w-24 shrink-0 rounded object-cover object-top"
                                        />
                                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                                          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{deck.name}</p>
                                          <p className="line-clamp-2 text-xs leading-snug text-emerald-400">{deck.commander}</p>
                                          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1.5">
                                            {deck.source_type && (
                                              <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs ${
                                                deck.source_type === 'archidekt'
                                                  ? 'bg-blue-500/20 text-blue-400'
                                                  : deck.source_type === 'moxfield'
                                                    ? 'bg-teal-500/20 text-teal-300'
                                                    : 'bg-muted text-muted-foreground'
                                              }`}>
                                                {deck.source_type}
                                              </span>
                                            )}
                                            <BracketBadge bracket={deck.bracket} />
                                          </div>
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                                {filteredDeckOptions.length === 0 && (
                                  <p className="mt-2 rounded-lg border border-border/70 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                                    {t({ it: 'Nessun mazzo trovato con questa ricerca', en: 'No decks match this search' })}
                                  </p>
                                )}
                              </>
                            )
                          ) : (
                            <p className="text-xs text-muted-foreground">{t({ it: 'Nessun mazzo disponibile per questo giocatore', en: 'No decks available for this player' })}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Checkbox
                      checked={editMatchIsDraw}
                      onCheckedChange={(checked) => {
                        const isDraw = checked === true;
                        setEditMatchIsDraw(isDraw);
                        if (isDraw) setEditMatchWinnerKey('');
                      }}
                    />
                    {t({ it: 'Patta', en: 'Draw' })}
                  </label>
                  {!editMatchIsDraw ? (
                    <div className="space-y-4">
                      <label className="text-sm font-medium text-foreground mb-3 block">{t({ it: 'Vincitore', en: 'Winner' })}</label>
                      <Select value={editMatchWinnerKey} onValueChange={(value) => setEditMatchWinnerKey(value as ParticipantKey)}>
                        <SelectTrigger className="w-full bg-background border-border text-foreground">
                          <SelectValue placeholder={t({ it: 'Seleziona il vincitore', en: 'Select the victor' })} />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {editingMatch.match_participants.map((p) => {
                            const participantKey = editMatchPlayerKeys[p.id] || getParticipantKey(p);
                            if (!participantKey) return null;
                            const selectedDeck = getSelectedEditMatchDeck(p.id, participantKey);
                            const playerLabel = editMatchPlayerOptions.find((option) => option.key === participantKey)?.label || getParticipantDisplayName(p);
                            return (
                              <SelectItem key={p.id} value={participantKey}>
                                {playerLabel}{selectedDeck ? ` (${selectedDeck.commander})` : ''}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <div>
                        <label className="mb-3 block text-sm font-medium text-foreground">{t({ it: 'Tipo di vittoria', en: 'Win condition' })}</label>
                        <Select value={editMatchWinCondition} onValueChange={(value) => setEditMatchWinCondition(value as NonNullable<Match['win_condition']>)}>
                          <SelectTrigger className="w-full bg-background border-border text-foreground">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border">
                            <SelectItem value="last_standing">{t({ it: 'Ultimo in piedi', en: 'Last standing' })}</SelectItem>
                            <SelectItem value="combo">Combo</SelectItem>
                            <SelectItem value="concession">{t({ it: 'Resa', en: 'Concession' })}</SelectItem>
                            <SelectItem value="alternate_card">{t({ it: 'Vittoria alternativa', en: 'Alternate card' })}</SelectItem>
                            <SelectItem value="other">{t({ it: 'Altro', en: 'Other' })}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : null}
                </div>

                <RichTextEditor
                  label={t({ it: 'Note (opzionali)', en: 'Notes (optional)' })}
                  value={editMatchNotes}
                  onChange={setEditMatchNotes}
                  placeholder={t({ it: 'Cronaca della partita...', en: 'Epic saga of the battle...' })}
                  hint={t({
                    it: 'Usa la barra formato per grassetto, corsivo, barrato, a capo ed elenchi.',
                    en: 'Use the format toolbar for bold, italic, strike, line breaks, and bullet lists.',
                  })}
                  minRows={3}
                />

              </div>
            </CardContent>
            <div className="shrink-0 border-t border-border/70 bg-card px-6 py-4">
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingMatch(null);
                    setEditMatchDeckSearches({});
                    setHiddenEditMatchDeckLists({});
                  }}
                  className="flex-1 border-border text-foreground"
                >
                  {t({ it: 'Annulla', en: 'Cancel' })}
                </Button>
                <Button
                  onClick={handleSaveEditMatch}
                  disabled={savingEditMatch || (!editMatchIsDraw && !editMatchWinnerKey)}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700"
                >
                  {savingEditMatch ? t({ it: 'Salvataggio...', en: 'Saving...' }) : t({ it: 'Salva modifiche', en: 'Save Changes' })}
                </Button>
              </div>
            </div>
          </ModalCard>
        </ModalOverlay>
      )}

      {showGuestModal && (
        <ModalOverlay>
          <ModalCard>
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                {guestModalMode === 'add-deck' ? <Plus className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
                {guestModalMode === 'add-deck'
                  ? t({ it: 'Aggiungi mazzo guest', en: 'Add guest deck' })
                  : t({ it: 'Aggiungi guest', en: 'Add guest' })}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {guestModalMode === 'pick-existing'
                  ? t({ it: 'Scegli un guest già presente nel playgroup o creane uno nuovo', en: 'Pick an existing playgroup guest or create a new one' })
                  : guestModalMode === 'add-deck'
                    ? t({ it: 'Aggiungi un altro mazzo a questo guest', en: 'Add another deck to this guest' })
                    : t({ it: 'Crea un guest con nome e comandante', en: 'Create a guest with a name and commander' })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {guestModalMode === 'pick-existing' && guests.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {t({ it: 'Guest esistenti', en: 'Existing guests' })}
                  </label>
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {guests.map((guest) => (
                      <div
                        key={guest.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background/30 px-2 py-2 transition-colors hover:border-emerald-500/50"
                      >
                        <button
                          type="button"
                          onClick={() => addExistingGuestToMatch(guest)}
                          className="flex min-w-0 flex-1 items-center justify-between px-1 text-left"
                        >
                          <span className="font-medium text-foreground">{guest.display_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {guest.arena_guest_decks?.length || 0} {t({ it: 'mazzi', en: 'decks' })}
                          </span>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-emerald-300"
                          onClick={() => openAddGuestDeckModal(guest)}
                          title={t({ it: 'Aggiungi mazzo', en: 'Add deck' })}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-border text-foreground"
                    onClick={() => setGuestModalMode('create')}
                  >
                    {t({ it: 'Crea nuovo guest', en: 'Create new guest' })}
                  </Button>
                </div>
              )}

              {(guestModalMode === 'create' || guestModalMode === 'add-deck' || guests.length === 0) && (
                <div className="space-y-4">
                  {guests.length > 0 && guestModalMode !== 'add-deck' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-0 text-muted-foreground"
                      onClick={() => setGuestModalMode('pick-existing')}
                    >
                      {t({ it: 'Torna ai guest esistenti', en: 'Back to existing guests' })}
                    </Button>
                  )}
                  {guests.length > 0 && guestModalMode === 'add-deck' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-0 text-muted-foreground"
                      onClick={() => {
                        setGuestDeckTargetId(null);
                        setGuestModalMode('pick-existing');
                      }}
                    >
                      {t({ it: 'Torna ai guest esistenti', en: 'Back to existing guests' })}
                    </Button>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      {t({ it: 'Nome guest', en: 'Guest name' })}
                    </label>
                    <Input
                      value={guestName}
                      onChange={(event) => setGuestName(event.target.value)}
                      placeholder={t({ it: 'Es. Marco', en: 'e.g. Marco' })}
                      className="bg-background/50 border-border text-foreground"
                      disabled={savingGuest || guestModalMode === 'add-deck'}
                    />
                  </div>
                  <GuestCommanderPicker
                    deckName={guestDeckName}
                    onDeckNameChange={setGuestDeckName}
                    onSelectCommander={setGuestSelectedCommander}
                    selectedCommander={guestSelectedCommander}
                    selectedPartnerCommander={guestSelectedPartnerCommander}
                    onSelectPartnerCommander={setGuestSelectedPartnerCommander}
                    disabled={savingGuest}
                  />
                </div>
              )}
            </CardContent>
            {(guestModalMode === 'create' || guestModalMode === 'add-deck' || guests.length === 0) && (
              <div className="border-t border-border/70 px-6 py-4">
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-border text-foreground"
                    onClick={resetGuestModal}
                    disabled={savingGuest}
                  >
                    {t({ it: 'Annulla', en: 'Cancel' })}
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700"
                    onClick={handleSaveGuestModal}
                    disabled={
                      savingGuest ||
                      !guestSelectedCommander ||
                      (guestModalMode === 'add-deck' ? !guestDeckTargetId : !guestName.trim())
                    }
                  >
                    {savingGuest
                      ? t({ it: 'Salvataggio...', en: 'Saving...' })
                      : guestModalMode === 'add-deck'
                        ? t({ it: 'Salva mazzo', en: 'Save deck' })
                        : t({ it: 'Aggiungi guest', en: 'Add guest' })}
                  </Button>
                </div>
              </div>
            )}
          </ModalCard>
        </ModalOverlay>
      )}
    </div>
  );
}
