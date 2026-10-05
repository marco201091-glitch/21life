import { useFocusEffect , useLocalSearchParams, useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';

import * as Crypto from 'expo-crypto';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { DeckImage } from '@/components/deck/deck-image';
import { LiveGameConfigurator, type SetupParticipant } from '@/components/live-game/live-game-configurator';
import { TableArena } from '@/components/live-game/table-arena';
import { LiveGameRecapView } from '@/components/live-game/live-game-recap';
import { toDeckOption } from '@/components/table/match-participant-row';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Modal } from '@/components/ui/modal';
import { ModalHeader } from '@/components/ui/modal-header';
import { PhyrexianPanel } from '@/components/ui/phyrexian-panel';
import { Screen } from '@/components/ui/screen';
import { ArenaSkeleton } from '@/components/ui/screen-skeletons';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';
import { useToast } from '@/contexts/toast-context';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { colors, radii, spacing } from '@/constants/theme';
import { useArena } from '@/hooks/use-arena';
import { useScreenInsets } from '@/hooks/use-screen-insets';
import {
  clearLiveGameRuntimePlayers,
  replaceLiveGameRuntimePlayers,
} from '@/stores/live-game-runtime-store';
import { hapticLight, hapticMedium, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { apiPost } from '@/lib/api';
import { syncArenaMemberArchidektDecks } from '@/lib/arena-archidekt-sync';
import { getLastDeckSelectionForParticipant } from '@/lib/arena-participants';
import { getPreferredDeckId } from '@/lib/arena-deck-selection';
import {
  applyLiveGameMutation,
  createLiveGamePlayer,
  createLiveGameSummary,
  getDefaultWinCondition,
  getLiveGameResultWarnings,
  getSuggestedWinner,
  isValidLiveGameResult,
  pickRandomPlayer,
  type DamageMode,
  type LiveGameMutation,
  type LiveGamePlayer,
  type LiveGameRecord,
  type LiveGameState,
  type QueuedLiveGameMutation,
  type WinCondition,
} from '@/lib/live-game';
import { buildRouletteSequence } from '@/lib/live-game-roulette';
import type { TableLayoutVariant } from '@/lib/live-game-table-layout';
import {
  createDefaultLiveGameSetup,
  clearLiveGameSeats,
  loadLiveGameSetup,
  saveLiveGameSetup,
  type LiveGameSeatSetup,
} from '@/lib/live-game-setup';
import { formatGameDuration, getGameDurationSeconds } from '@/lib/live-game-duration';
import { withLiveGameTimeout } from '@/lib/live-game-async';
import { getDiscardConfirmationVisibility } from '@/lib/live-game-modal-state';
import {
  applyQueuedLiveGameMutations,
  cancelLiveGame,
  ensureLiveGameCreated,
  fetchActiveLiveGame,
  fetchBusyLiveGameParticipantKeys,
  finalizePendingLiveGame,
  subscribeToLiveGame,
} from '@/lib/live-game-service';
import {
  LIVE_GAME_SYNC_BATCH_SIZE,
  getLiveGameSyncDelay,
} from '@/lib/live-game-sync-policy';
import {
  archiveAndClearLiveGameSession,
  clearLiveGameOfflineSession,
  clearLiveGameOfflineSessionIfMatches,
  loadLiveGameOutbox,
  loadLiveGameOfflineSession,
  saveLiveGameOutbox,
  saveLiveGameOfflineSession,
  type PendingLiveGameFinalization,
  type ArchivedLiveGameOperation,
} from '@/lib/live-game-offline';
import { persistLiveGameTelemetry, recordLiveGameQueueDepth } from '@/lib/live-game-telemetry';
import {
  createLiveGameHistory,
  recordLiveGameHistory,
  redoLiveGameHistory,
  undoLiveGameHistory,
  type LiveGameHistory,
} from '@/lib/live-game-history';
import {
  applyLiveGameImmersive,
  clearLiveGameImmersive,
} from '@/lib/live-game-immersive';
import {
  applyLiveGameOrientationLock,
  clearLiveGameOrientationLock,
} from '@/lib/live-game-orientation';
import { parseParticipantKey, toGuestParticipantKey, toUserParticipantKey, type ParticipantKey } from '@/lib/participant-keys';
import { getProfileDisplayName } from '@/lib/profile-display';
import { prefetchCommanderNames, prefetchDeckImageUrls } from '@/lib/deck-image-cache';
import { supabase } from '@/lib/supabase';
import type { MemberDeck } from '@/lib/types/arena';

type LifePreset = '20' | '25' | '30' | '40' | '60' | 'custom';
const LIFE_PRESETS: LifePreset[] = ['20', '25', '30', '40', '60'];
const WIN_CONDITIONS: {
  value: WinCondition;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: 'liveGameWinLastStanding' | 'liveGameWinCombo' | 'liveGameWinConcession' | 'liveGameWinAlternateCard' | 'liveGameWinOther';
  hintKey: 'liveGameWinLastStandingHint' | 'liveGameWinComboHint' | 'liveGameWinConcessionHint' | 'liveGameWinAlternateCardHint' | 'liveGameWinOtherHint';
}[] = [
  { value: 'last_standing', icon: 'shield-checkmark-outline', labelKey: 'liveGameWinLastStanding', hintKey: 'liveGameWinLastStandingHint' },
  { value: 'combo', icon: 'git-merge-outline', labelKey: 'liveGameWinCombo', hintKey: 'liveGameWinComboHint' },
  { value: 'concession', icon: 'flag-outline', labelKey: 'liveGameWinConcession', hintKey: 'liveGameWinConcessionHint' },
  { value: 'alternate_card', icon: 'sparkles-outline', labelKey: 'liveGameWinAlternateCard', hintKey: 'liveGameWinAlternateCardHint' },
  { value: 'other', icon: 'ellipsis-horizontal-circle-outline', labelKey: 'liveGameWinOther', hintKey: 'liveGameWinOtherHint' },
];

function replayQueuedMutations(
  record: LiveGameRecord,
  queue: QueuedLiveGameMutation[],
): LiveGameRecord {
  return {
    ...record,
    state: queue.reduce(
      (state, entry) => applyLiveGameMutation(state, entry.mutation),
      record.state,
    ),
  };
}

export default function LiveGameScreen() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const { user } = useAuth();
  const currentUserId = user?.id;
  const { copy, language } = useLanguage();
  const { featureFlags } = useRuntimeConfig();
  const { showToast } = useToast();
  const { scrollContentStyle } = useScreenInsets();

  const { members, guests, decks, matches, loading, group, refresh } = useArena(groupId, user?.id);

  const [liveGame, setLiveGame] = useState<LiveGameRecord | null>(null);
  const [booting, setBooting] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<ParticipantKey[]>([]);
  const [participantDecks, setParticipantDecks] = useState<Record<string, string>>({});
  const [playerCount, setPlayerCount] = useState(4);
  const [layoutVariant, setLayoutVariant] = useState<TableLayoutVariant>('classic');
  const [seatSetups, setSeatSetups] = useState<LiveGameSeatSetup[]>(
    createDefaultLiveGameSetup().seats,
  );
  const [lifePreset, setLifePreset] = useState<LifePreset>('40');
  const [customLife, setCustomLife] = useState('40');
  const [starting, setStarting] = useState(false);
  const [archidektSyncRequest, setArchidektSyncRequest] = useState<{
    userId: string;
    status: 'syncing' | 'completed' | 'partial' | 'failed';
  } | null>(null);
  const archidektSyncGeneration = useRef(0);
  const [damagePulse, setDamagePulse] = useState<Record<string, number>>({});
  const [randomHighlight, setRandomHighlight] = useState<ParticipantKey | null>(null);
  const [startingHighlight, setStartingHighlight] = useState<ParticipantKey | null>(null);
  const [pendingEliminate, setPendingEliminate] = useState<ParticipantKey | null>(null);
  const [showEndGame, setShowEndGame] = useState(false);
  const [endWinnerKey, setEndWinnerKey] = useState<ParticipantKey | ''>('');
  const [endIsDraw, setEndIsDraw] = useState(false);
  const [endWinCondition, setEndWinCondition] = useState<WinCondition | null>(null);
  const [endingGame, setEndingGame] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showExitChoice, setShowExitChoice] = useState(false);
  const [discardingGame, setDiscardingGame] = useState(false);
  const [showRematch, setShowRematch] = useState(false);
  const [completedGame, setCompletedGame] = useState<LiveGameRecord | null>(null);
  const [completedDurationSeconds, setCompletedDurationSeconds] = useState(0);
  const [recoveryOutbox, setRecoveryOutbox] = useState<ArchivedLiveGameOperation[]>([]);
  const [showClearRecoveryConfirm, setShowClearRecoveryConfirm] = useState(false);
  const rouletteTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const previousActivePlayerCountRef = useRef<number | null>(null);

  const liveGameRef = useRef<LiveGameRecord | null>(null);
  const serverRecordRef = useRef<LiveGameRecord | null>(null);
  const mutationQueueRef = useRef<QueuedLiveGameMutation[]>([]);
  const needsCreateRef = useRef(false);
  const pendingFinalizationRef = useRef<PendingLiveGameFinalization | null>(null);
  const pendingCancelRef = useRef(false);
  const sessionClosedRef = useRef(false);
  const syncRunningRef = useRef(false);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncBatchStartedAtRef = useRef<number | null>(null);
  const journalWriteRef = useRef<Promise<void>>(Promise.resolve());
  const historyRef = useRef<LiveGameHistory>(createLiveGameHistory());
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'offline' | 'pending' | 'syncing' | 'synced' | 'error'>('synced');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const telemetrySessionRef = useRef(Crypto.randomUUID());
  const setupHydratedRef = useRef<string | null>(null);

  const openEndGameModal = useCallback((state: LiveGameState) => {
    const suggested = getSuggestedWinner(state);
    setEndWinnerKey(suggested?.participantKey || '');
    setEndIsDraw(false);
    setEndWinCondition(getDefaultWinCondition(state));
    setShowEndGame(true);
  }, []);

  const openDiscardConfirm = useCallback(() => {
    // React Native must never keep two native modals stacked here. The flag
    // flow used to leave the end-game modal mounted below the confirmation,
    // trapping all touches on iOS after the destructive action.
    const next = getDiscardConfirmationVisibility();
    setShowExitChoice(next.showExitChoice);
    setShowEndGame(next.showEndGame);
    setShowDiscardConfirm(next.showDiscardConfirm);
  }, []);

  useEffect(() => {
    if (!liveGame) {
      previousActivePlayerCountRef.current = null;
      return;
    }

    const activePlayerCount = liveGame.state.players.filter((player) => !player.isEliminated).length;
    const previousActivePlayerCount = previousActivePlayerCountRef.current;
    previousActivePlayerCountRef.current = activePlayerCount;

    if (previousActivePlayerCount !== null && previousActivePlayerCount > 1 && activePlayerCount === 1) {
      openEndGameModal(liveGame.state);
    }
  }, [liveGame, openEndGameModal]);

  const startingLife = useMemo(() => {
    if (lifePreset === 'custom') {
      const parsed = Number.parseInt(customLife, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
    }
    return Number.parseInt(lifePreset, 10);
  }, [customLife, lifePreset]);

  const decksByUser = useMemo(() => {
    const map = new Map<string, MemberDeck[]>();
    decks.forEach((deck) => {
      const current = map.get(deck.user_id) || [];
      current.push(deck);
      map.set(deck.user_id, current);
    });
    return map;
  }, [decks]);

  const getDeckOptions = useCallback((key: ParticipantKey) => {
    if (key.startsWith('guest:')) {
      const guestId = key.slice(6);
      const guestDecks = guests.find((guest) => guest.id === guestId)?.arena_guest_decks || [];
      return guestDecks.map(toDeckOption);
    }
    return (decksByUser.get(key.slice(5)) || []).map(toDeckOption);
  }, [decksByUser, guests]);

  const setupParticipants = useMemo<SetupParticipant[]>(() => [
    ...members.map((member) => {
      const key = toUserParticipantKey(member.id);
      const options = getDeckOptions(key);
      return {
        key,
        name: getProfileDisplayName(member),
        decks: options,
        preferredDeckId: getPreferredDeckId(
          options,
          getLastDeckSelectionForParticipant(key, matches),
        ),
      };
    }),
    ...guests.map((guest) => {
      const key = toGuestParticipantKey(guest.id);
      const options = getDeckOptions(key);
      return {
        key,
        name: guest.display_name,
        decks: options,
        preferredDeckId: getPreferredDeckId(
          options,
          getLastDeckSelectionForParticipant(key, matches),
        ),
      };
    }),
  ], [getDeckOptions, guests, matches, members]);

  const applySeatSetups = useCallback((nextSeats: LiveGameSeatSetup[]) => {
    setSeatSetups(nextSeats);
    const assigned = nextSeats.filter(
      (seat): seat is { participantKey: ParticipantKey; deckId: string | null } => Boolean(seat.participantKey),
    );
    setSelectedKeys(assigned.map((seat) => seat.participantKey));
    setParticipantDecks(Object.fromEntries(
      assigned.filter((seat) => seat.deckId).map((seat) => [seat.participantKey, seat.deckId!]),
    ));
  }, []);

  const applyStartingLife = useCallback((value: number) => {
    const preset = String(value) as LifePreset;
    if (LIFE_PRESETS.includes(preset)) {
      setLifePreset(preset);
      setCustomLife(String(value));
    } else {
      setLifePreset('custom');
      setCustomLife(String(value));
    }
  }, []);

  const handlePlayerCountChange = useCallback((count: number) => {
    setPlayerCount(count);
    applySeatSetups(Array.from({ length: count }, (_, index) => (
      seatSetups[index] ?? { participantKey: null, deckId: null }
    )));
  }, [applySeatSetups, seatSetups]);

  const handleAssignSeat = useCallback((
    index: number,
    participantKey: ParticipantKey | null,
    deckId: string | null,
  ) => {
    const next = seatSetups.map((seat, seatIndex) => {
      if (seatIndex === index) return { participantKey, deckId };
      if (participantKey && seat.participantKey === participantKey) {
        return { participantKey: null, deckId: null };
      }
      return seat;
    });
    applySeatSetups(next);
  }, [applySeatSetups, seatSetups]);

  const handleSelectSetupParticipant = useCallback((participantKey: ParticipantKey) => {
    const generation = ++archidektSyncGeneration.current;
    const targetUserId = participantKey.startsWith('user:')
      ? participantKey.slice('user:'.length)
      : null;
    if (!groupId || !currentUserId || !targetUserId
      || !members.some((member) => member.id === targetUserId && member.archidekt_auto_import)) {
      setArchidektSyncRequest(null);
      return;
    }
    setArchidektSyncRequest({ userId: targetUserId, status: 'syncing' });
    void (async () => {
      try {
        const result = await syncArenaMemberArchidektDecks(groupId, targetUserId);
        if (!await refresh(false)) throw new Error('Unable to refresh arena decks.');
        if (generation === archidektSyncGeneration.current) {
          setArchidektSyncRequest({ userId: targetUserId, status: result.skipped ? 'partial' : 'completed' });
        }
      } catch {
        if (generation === archidektSyncGeneration.current) {
          setArchidektSyncRequest({ userId: targetUserId, status: 'failed' });
        }
      }
    })();
  }, [currentUserId, groupId, members, refresh]);

  const resetSetup = useCallback(() => {
    applySeatSetups(clearLiveGameSeats(seatSetups));
  }, [applySeatSetups, seatSetups]);

  useEffect(() => {
    const selectedDecks = seatSetups.flatMap((seat) => {
      if (!seat.participantKey || !seat.deckId) return [];
      const deck = getDeckOptions(seat.participantKey).find((option) => option.id === seat.deckId);
      return deck ? [deck] : [];
    });
    if (selectedDecks.length === 0) return;
    void prefetchDeckImageUrls(selectedDecks.map((deck) => deck.commander_image), { background: true });
    void prefetchCommanderNames(selectedDecks.map((deck) => deck.commander), { background: true });
  }, [getDeckOptions, seatSetups]);

  const setOptimisticRecord = useCallback((record: LiveGameRecord | null) => {
    liveGameRef.current = record;
    replaceLiveGameRuntimePlayers(record?.state.players ?? []);
    setLiveGame(record);
  }, []);

  useEffect(() => () => {
    clearLiveGameRuntimePlayers();
  }, [groupId]);

  const saveJournal = useCallback(() => {
    const record = liveGameRef.current;
    const serverRecord = serverRecordRef.current;
    if (!groupId || !record || !serverRecord) return Promise.resolve();
    const snapshot = {
      record,
      serverRecord,
      needsCreate: needsCreateRef.current,
      mutations: [...mutationQueueRef.current],
      pendingFinalization: pendingFinalizationRef.current,
      pendingCancel: pendingCancelRef.current,
      history: historyRef.current,
    };
    journalWriteRef.current = journalWriteRef.current
      .catch(() => undefined)
      .then(() => {
        if (sessionClosedRef.current) return;
        return saveLiveGameOfflineSession(groupId, snapshot);
      });
    return journalWriteRef.current;
  }, [groupId]);

  const flushOutbox = useCallback(async () => {
    const outbox = await loadLiveGameOutbox();
    setRecoveryOutbox(outbox);
    while (outbox.length > 0) {
      const item = outbox[0];
      let serverRecord = item.serverRecord;
      if (item.needsCreate) {
        serverRecord = await ensureLiveGameCreated(supabase, serverRecord);
        item.serverRecord = serverRecord;
        item.needsCreate = false;
        await saveLiveGameOutbox(outbox);
      }
      while (item.mutations.length > 0) {
        const batch = item.mutations.slice(0, LIVE_GAME_SYNC_BATCH_SIZE);
        serverRecord = await applyQueuedLiveGameMutations(supabase, serverRecord, batch);
        item.serverRecord = serverRecord;
        item.mutations = item.mutations.slice(batch.length);
        await saveLiveGameOutbox(outbox);
      }
      if (item.finalization) {
        const matchId = await finalizePendingLiveGame(
          supabase,
          serverRecord.id,
          item.finalization,
          serverRecord.state,
        );
        void apiPost('/api/notifications/match-completed', { matchId });
      } else if (item.cancel) {
        await cancelLiveGame(supabase, serverRecord.id);
      }
      outbox.shift();
      await saveLiveGameOutbox(outbox);
      setRecoveryOutbox([...outbox]);
    }
  }, []);

  useEffect(() => {
    void loadLiveGameOutbox().then(setRecoveryOutbox);
  }, []);

  const syncJournal = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (syncPromiseRef.current) return syncPromiseRef.current;
    syncRunningRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);
    let tracked: Promise<void>;
    tracked = (async () => {
      let failed = false;
      try {
        await flushOutbox();
        if (sessionClosedRef.current) return;
        let serverRecord = serverRecordRef.current;
        if (!serverRecord) return;
        if (needsCreateRef.current) {
          serverRecord = await ensureLiveGameCreated(supabase, serverRecord);
          if (sessionClosedRef.current) return;
          serverRecordRef.current = serverRecord;
          needsCreateRef.current = false;
          await saveJournal();
        }

        while (mutationQueueRef.current.length > 0) {
          const batch = mutationQueueRef.current.slice(0, LIVE_GAME_SYNC_BATCH_SIZE);
          serverRecord = await applyQueuedLiveGameMutations(supabase, serverRecord, batch);
          if (sessionClosedRef.current) return;
          serverRecordRef.current = serverRecord;
          mutationQueueRef.current = mutationQueueRef.current.slice(batch.length);
          if (mutationQueueRef.current.length === 0) syncBatchStartedAtRef.current = null;
          setPendingSyncCount(mutationQueueRef.current.length);
          setOptimisticRecord(replayQueuedMutations(serverRecord, mutationQueueRef.current));
          await saveJournal();
        }

        if (pendingCancelRef.current) {
          await cancelLiveGame(supabase, serverRecord.id);
          pendingCancelRef.current = false;
          await clearLiveGameOfflineSession(groupId);
        }
      } catch (error) {
        failed = true;
        setSyncError(error instanceof Error ? error.message : 'Sync failed');
        setSyncStatus('error');
        // Offline, timeout or a transient Realtime gap: the durable journal retries later.
      } finally {
        syncRunningRef.current = false;
        if (!failed && !sessionClosedRef.current) {
          setSyncStatus(mutationQueueRef.current.length ? 'pending' : 'synced');
        }
        if (user) {
          void persistLiveGameTelemetry(supabase, {
            userId: user.id,
            liveGameId: liveGameRef.current?.id ?? null,
            sessionId: telemetrySessionRef.current,
            platform: 'expo',
            force: failed,
          }).catch(() => undefined);
        }
      }
    })().finally(() => {
      if (syncPromiseRef.current === tracked) syncPromiseRef.current = null;
    });
    syncPromiseRef.current = tracked;
    return tracked;
  }, [flushOutbox, groupId, saveJournal, setOptimisticRecord, user]);

  const flushArchivedOutbox = useCallback(() => {
    const pendingSync = syncPromiseRef.current;
    void (pendingSync ?? Promise.resolve())
      .catch(() => undefined)
      .finally(() => {
        void syncJournal();
      });
  }, [syncJournal]);

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    if (mutationQueueRef.current.length === 0) {
      syncTimerRef.current = null;
      syncBatchStartedAtRef.current = null;
      return;
    }
    if (syncBatchStartedAtRef.current === null) syncBatchStartedAtRef.current = Date.now();
    const delay = getLiveGameSyncDelay({
      queueDepth: mutationQueueRef.current.length,
      batchStartedAt: syncBatchStartedAtRef.current,
    });
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      void syncJournal();
    }, delay);
  }, [syncJournal]);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (!online) {
        if (syncTimerRef.current) {
          clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }
        setSyncStatus('offline');
        return;
      }
      void syncJournal();
    });
  }, [syncJournal]);

  useEffect(() => {
    if (!groupId || !user) return;
    let mounted = true;
    void (async () => {
      let cached = await withLiveGameTimeout(
        loadLiveGameOfflineSession(groupId),
        3_000,
      ).catch(() => null);
      if (!mounted) return;
      const participantKey = toUserParticipantKey(user.id);
      if (cached && !cached.record.state.players.some(
        (player) => player.participantKey === participantKey,
      )) {
        await clearLiveGameOfflineSession(groupId);
        cached = null;
      }
      if (cached) {
        sessionClosedRef.current = false;
        serverRecordRef.current = cached.serverRecord;
        mutationQueueRef.current = cached.mutations;
        syncBatchStartedAtRef.current = cached.mutations.length ? Date.now() : null;
        needsCreateRef.current = cached.needsCreate;
        pendingFinalizationRef.current = cached.pendingFinalization;
        pendingCancelRef.current = cached.pendingCancel;
        historyRef.current = cached.history;
        setUndoDepth(cached.history.undo.length);
        setRedoDepth(cached.history.redo.length);
        setPendingSyncCount(cached.mutations.length);
        setSyncStatus(cached.mutations.length ? 'pending' : 'synced');
        setOptimisticRecord(cached.record);
      }

      try {
        const remote = await withLiveGameTimeout(
          fetchActiveLiveGame(supabase, groupId, participantKey),
        );
        if (!mounted) return;
        if (remote && (!cached || !cached.needsCreate || remote.id === cached.record.id)) {
          sessionClosedRef.current = false;
          serverRecordRef.current = remote;
          const queue = cached?.record.id === remote.id ? mutationQueueRef.current : [];
          mutationQueueRef.current = queue;
          syncBatchStartedAtRef.current = queue.length ? Date.now() : null;
          setPendingSyncCount(queue.length);
          needsCreateRef.current = false;
          setOptimisticRecord(replayQueuedMutations(remote, queue));
          await saveJournal();
        } else if (!remote && cached && !cached.needsCreate) {
          await clearLiveGameOfflineSession(groupId);
          serverRecordRef.current = null;
          mutationQueueRef.current = [];
          syncBatchStartedAtRef.current = null;
          setPendingSyncCount(0);
          historyRef.current = createLiveGameHistory();
          setUndoDepth(0);
          setRedoDepth(0);
          setOptimisticRecord(null);
        } else if (!remote && !cached) {
          setOptimisticRecord(null);
        }
        void syncJournal();
      } catch {
        // Cached session remains fully playable while offline.
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => { mounted = false; };
  }, [groupId, saveJournal, setOptimisticRecord, syncJournal, user]);

  const refreshAuthoritativeState = useCallback(async () => {
    const current = liveGameRef.current;
    if (!groupId || !user || !current || needsCreateRef.current || syncRunningRef.current) return;
    const remote = await fetchActiveLiveGame(supabase, groupId, toUserParticipantKey(user.id));
    if (!remote || remote.id !== current.id) return;
    serverRecordRef.current = remote;
    setOptimisticRecord(replayQueuedMutations(remote, mutationQueueRef.current));
    await saveJournal();
  }, [groupId, saveJournal, setOptimisticRecord, user]);

  useEffect(() => {
    if (!liveGame?.id || needsCreateRef.current) return undefined;
    return subscribeToLiveGame(supabase, liveGame.id, (remote) => {
      if (sessionClosedRef.current) return;
      if (remote.status !== 'active') {
        if (pendingFinalizationRef.current || pendingCancelRef.current) return;
        serverRecordRef.current = null;
        mutationQueueRef.current = [];
        syncBatchStartedAtRef.current = null;
        pendingFinalizationRef.current = null;
        pendingCancelRef.current = false;
        setPendingSyncCount(0);
        historyRef.current = createLiveGameHistory();
        setUndoDepth(0);
        setRedoDepth(0);
        setOptimisticRecord(null);
        void clearLiveGameOfflineSession(groupId);
        if (remote.status === 'ended') {
          setCompletedGame(remote);
          setCompletedDurationSeconds(getGameDurationSeconds(remote.started_at, remote.ended_at ?? new Date().toISOString()));
          setShowEndGame(false);
          setShowRematch(true);
          showToast(copy('liveGameSaved'));
        } else {
          router.replace(`/table/${groupId}`);
        }
        return;
      }
      if (syncRunningRef.current) return;
      serverRecordRef.current = remote;
      setOptimisticRecord(replayQueuedMutations(remote, mutationQueueRef.current));
      void saveJournal();
    }, (status) => {
      if (status === 'SUBSCRIBED') {
        setSyncStatus(mutationQueueRef.current.length ? 'pending' : 'synced');
        void refreshAuthoritativeState().catch(() => undefined).finally(() => syncJournal());
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setSyncStatus('offline');
      }
    });
  }, [copy, groupId, liveGame?.id, refreshAuthoritativeState, router, saveJournal, setOptimisticRecord, showToast, syncJournal]);

  useEffect(() => {
    if (!groupId || !user || loading || setupHydratedRef.current === `${user.id}:${groupId}`) return;
    setupHydratedRef.current = `${user.id}:${groupId}`;
    void loadLiveGameSetup(groupId, user.id).then((saved) => {
      if (!saved) return;
      const participantMap = new Map(setupParticipants.map((participant) => [participant.key, participant]));
      const validatedSeats = saved.seats.map((seat) => {
        if (!seat.participantKey) return { participantKey: null, deckId: null };
        const participant = participantMap.get(seat.participantKey);
        if (!participant) return { participantKey: null, deckId: null };
        const validDeck = participant.decks.some((deck) => deck.id === seat.deckId);
        const fallbackDeck = participant.decks.length === 1
          ? participant.decks[0].id
          : participant.preferredDeckId;
        return {
          participantKey: seat.participantKey,
          deckId: validDeck ? seat.deckId : fallbackDeck,
        };
      });
      setPlayerCount(saved.playerCount);
      setLayoutVariant(saved.layoutVariant);
      applyStartingLife(saved.startingLife);
      applySeatSetups(validatedSeats);
    });
  }, [applySeatSetups, applyStartingLife, groupId, loading, setupParticipants, user]);

  useEffect(() => {
    const interval = setInterval(() => {
      void NetInfo.fetch().then((state) => {
        if (state.isConnected === true && state.isInternetReachable !== false) void syncJournal();
      });
    }, 10_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshAuthoritativeState().catch(() => undefined).finally(() => syncJournal());
        if (liveGameRef.current) applyLiveGameImmersive();
      } else if (user) {
        void persistLiveGameTelemetry(supabase, {
          userId: user.id,
          liveGameId: liveGameRef.current?.id ?? null,
          sessionId: telemetrySessionRef.current,
          platform: 'expo',
          force: true,
        }).catch(() => undefined);
      }
    });
    return () => {
      clearInterval(interval);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      appStateSubscription.remove();
    };
  }, [refreshAuthoritativeState, syncJournal, user]);

  const liveGameId = liveGame?.id ?? null;
  const liveGamePlayerCount = liveGame?.state.players.length ?? 0;

  useEffect(() => {
    if (!liveGameId) {
      void clearLiveGameOrientationLock();
      return undefined;
    }

    void applyLiveGameOrientationLock(liveGamePlayerCount, {
      platform: Platform.OS,
      isPad: Platform.OS === 'ios' && Platform.isPad,
    });
    return () => {
      void clearLiveGameOrientationLock();
    };
  }, [liveGameId, liveGamePlayerCount]);

  useEffect(() => {
    if (!liveGameId) {
      clearLiveGameImmersive();
      return undefined;
    }

    applyLiveGameImmersive();
    return () => {
      clearLiveGameImmersive();
    };
  }, [liveGameId]);

  useFocusEffect(
    useCallback(() => {
      if (liveGameId) {
        void applyLiveGameOrientationLock(liveGamePlayerCount, {
          platform: Platform.OS,
          isPad: Platform.OS === 'ios' && Platform.isPad,
        });
        applyLiveGameImmersive();
      }
      return () => {
        void clearLiveGameOrientationLock();
        clearLiveGameImmersive();
      };
    }, [liveGameId, liveGamePlayerCount]),
  );

  const enqueueMutation = useCallback((
    mutation: LiveGameMutation,
    inverse?: LiveGameMutation,
    historyMode: 'record' | 'skip' = 'record',
  ) => {
    if (sessionClosedRef.current) return;
    const current = liveGameRef.current;
    if (!current) return;
    const id = Crypto.randomUUID();
    const trackedMutation: LiveGameMutation = {
      ...mutation,
      eventId: mutation.eventId ?? id,
      occurredAt: mutation.occurredAt ?? new Date().toISOString(),
    };
    const queued = { id, mutation: trackedMutation };
    if (mutationQueueRef.current.length === 0) syncBatchStartedAtRef.current = Date.now();
    mutationQueueRef.current = [...mutationQueueRef.current, queued];
    setPendingSyncCount(mutationQueueRef.current.length);
    setSyncStatus('pending');
    recordLiveGameQueueDepth(mutationQueueRef.current.length);
    if (inverse && historyMode === 'record') {
      historyRef.current = recordLiveGameHistory(historyRef.current, { forward: mutation, inverse });
      setUndoDepth(historyRef.current.undo.length);
      setRedoDepth(0);
    }
    setOptimisticRecord({ ...current, state: applyLiveGameMutation(current.state, trackedMutation) });
    void saveJournal().then(scheduleSync);
  }, [saveJournal, scheduleSync, setOptimisticRecord]);

  const handleUndo = () => {
    const result = undoLiveGameHistory(historyRef.current);
    if (!result) return;
    historyRef.current = result.history;
    setUndoDepth(result.history.undo.length);
    setRedoDepth(result.history.redo.length);
    enqueueMutation(result.mutation, undefined, 'skip');
    void hapticLight();
  };

  const handleRedo = () => {
    const result = redoLiveGameHistory(historyRef.current);
    if (!result) return;
    historyRef.current = result.history;
    setUndoDepth(result.history.undo.length);
    setRedoDepth(result.history.redo.length);
    enqueueMutation(result.mutation, undefined, 'skip');
    void hapticLight();
  };

  const pulseDamage = useCallback((key: ParticipantKey) => {
    setDamagePulse((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
  }, []);

  const clearRouletteTimers = useCallback(() => {
    rouletteTimersRef.current.forEach(clearTimeout);
    rouletteTimersRef.current = [];
  }, []);

  useEffect(() => clearRouletteTimers, [clearRouletteTimers]);

  const runRoulette = useCallback((
    pool: ParticipantKey[],
    winner: ParticipantKey,
    tone: 'random' | 'starting',
  ) => {
    clearRouletteTimers();
    setRandomHighlight(null);
    setStartingHighlight(null);
    const sequence = buildRouletteSequence(pool, winner);
    const setHighlight = tone === 'starting' ? setStartingHighlight : setRandomHighlight;
    sequence.forEach((key, index) => {
      rouletteTimersRef.current.push(setTimeout(() => {
        setHighlight(key);
        if (index === sequence.length - 1) void hapticSuccess();
      }, index * 120));
    });
    rouletteTimersRef.current.push(setTimeout(() => {
      setHighlight(null);
      rouletteTimersRef.current = [];
    }, (sequence.length - 1) * 120 + 4200));
  }, [clearRouletteTimers]);

  const revealStartingPlayer = useCallback((key: ParticipantKey | null, pool: ParticipantKey[]) => {
    if (!key) return;
    runRoulette(pool, key, 'starting');
  }, [runRoulette]);

  const resolveMeta = (key: ParticipantKey) => {
    const parsed = parseParticipantKey(key);
    if (!parsed) return null;
    const deckId = participantDecks[key];
    const deck = getDeckOptions(key).find((entry) => entry.id === deckId);
    if (!deck) return null;

    if (parsed.type === 'user') {
      const member = members.find((entry) => entry.id === parsed.id);
      if (!member) return null;
      return {
        key,
        deckId: deck.id,
        displayName: getProfileDisplayName(member),
        commander: deck.commander,
        commanderImage: deck.commander_image,
        isGuest: false,
        userId: parsed.id,
        guestId: null,
      };
    }

    const guest = guests.find((entry) => entry.id === parsed.id);
    if (!guest) return null;
    return {
      key,
      deckId: deck.id,
      displayName: guest.display_name,
      commander: deck.commander,
      commanderImage: deck.commander_image,
      isGuest: true,
      userId: null,
      guestId: parsed.id,
    };
  };

  const handleStart = async () => {
    if (!user) return;
    if (selectedKeys.length !== playerCount) {
      showToast(copy('liveGameFillSeats'));
      return;
    }

    const missingDeck = selectedKeys.find((key) => {
      const options = getDeckOptions(key);
      return options.length > 0 && !participantDecks[key];
    });
    if (missingDeck) {
      showToast(copy('liveGameDeckError'));
      return;
    }

    const resolvedPlayers = selectedKeys.map((key) => ({ key, meta: resolveMeta(key) }));
    if (resolvedPlayers.some((entry) => !entry.meta)) {
      showToast(copy('liveGameDeckError'));
      return;
    }

    setStarting(true);
    try {
      try {
        const busyKeys = await withLiveGameTimeout(
          fetchBusyLiveGameParticipantKeys(supabase, groupId, selectedKeys),
        );
        if (busyKeys.length > 0) {
          showToast(copy('liveGamePlayersBusy'));
          return;
        }
      } catch {
        // Offline starts remain available; the durable outbox will retry later.
      }

      const players = resolvedPlayers.map(({ key, meta }, slot) => createLiveGamePlayer({
        slot,
        participantKey: key,
        deckId: meta!.deckId,
        displayName: meta!.displayName,
        commander: meta!.commander,
        commanderImage: meta!.commanderImage,
        startingLife,
        allParticipantKeys: selectedKeys,
      }));

      const now = new Date().toISOString();
      const startingPlayer = players[Math.floor(Math.random() * players.length)];
      const startingDirection = Math.random() < 0.5 ? 'clockwise' : 'counterclockwise';
      const created: LiveGameRecord = {
        id: Crypto.randomUUID(),
        group_id: groupId,
        created_by: user.id,
        status: 'active',
        starting_life: startingLife,
        state: {
          version: 0,
          players,
          layoutVariant,
          startingPlayerKey: startingPlayer?.participantKey ?? null,
          startingDirection,
          events: [],
          summary: createLiveGameSummary(),
        },
        match_id: null,
        started_at: now,
        ended_at: null,
        created_at: now,
        updated_at: now,
      };
      sessionClosedRef.current = false;
      serverRecordRef.current = created;
      mutationQueueRef.current = [];
      syncBatchStartedAtRef.current = null;
      setPendingSyncCount(0);
      historyRef.current = createLiveGameHistory();
      setUndoDepth(0);
      setRedoDepth(0);
      needsCreateRef.current = true;
      pendingFinalizationRef.current = null;
      pendingCancelRef.current = false;
      setOptimisticRecord(created);
      await saveLiveGameSetup(groupId, user.id, {
        playerCount,
        layoutVariant,
        startingLife,
        seats: seatSetups,
      }).catch(() => undefined);
      revealStartingPlayer(created.state.startingPlayerKey ?? null, selectedKeys);
      await saveJournal();
      void syncJournal();
      showToast(copy('liveGameStarted'));
    } catch {
      showToast(copy('liveGameStartFailed'));
    } finally {
      setStarting(false);
    }
  };

  const handleAdjust = (playerKey: ParticipantKey, delta: number) => {
    if (delta < 0) {
      pulseDamage(playerKey);
      void (Math.abs(delta) >= 10 ? hapticMedium() : hapticLight());
    }
    const mutation: LiveGameMutation = {
      type: 'adjust',
      targetKey: playerKey,
      // UI deltas describe the life-total change, while positive mutations describe damage.
      amount: -delta,
      mode: 'life',
    };
    const player = liveGameRef.current?.state.players.find(
      (entry) => entry.participantKey === playerKey,
    );
    enqueueMutation(mutation, player ? { type: 'restore-player', player } : undefined);
  };

  const handleApplyDragDamage = (input: {
    sourceKey: ParticipantKey;
    targetKey: ParticipantKey;
    amount: number;
    mode: DamageMode;
    scope: 'single' | import('@/lib/live-game').GroupDamageScope;
    drain: boolean;
  }) => {
    if (input.sourceKey === input.targetKey || input.amount <= 0) return;
    const effectiveScope = input.drain && input.scope === 'all_players' ? 'opponents' : input.scope;
    if (effectiveScope !== 'single' && input.mode !== 'commander') {
      const targets = liveGameRef.current?.state.players
        .filter((player) => !player.isEliminated && (effectiveScope === 'all_players' || player.participantKey !== input.sourceKey)) ?? [];
      targets.forEach((player) => pulseDamage(player.participantKey));
      const drainAmount = input.drain ? input.amount * targets.length : undefined;
      enqueueMutation({
        type: 'adjust_many',
        sourceKey: input.sourceKey,
        amount: input.amount,
        scope: effectiveScope,
        mode: input.mode,
        drain: input.drain,
        drainAmount,
      }, {
        type: 'adjust_many',
        sourceKey: input.sourceKey,
        amount: -input.amount,
        scope: effectiveScope,
        mode: input.mode,
        drain: input.drain,
        drainAmount,
      });
    } else {
      pulseDamage(input.targetKey);
      const mutation: LiveGameMutation = {
        type: 'adjust',
        targetKey: input.targetKey,
        amount: input.amount,
        mode: input.mode,
        sourceKey: input.sourceKey,
        drain: input.drain,
        drainAmount: input.drain ? input.amount : undefined,
      };
      const player = liveGameRef.current?.state.players.find(
        (entry) => entry.participantKey === input.targetKey,
      );
      enqueueMutation(mutation, input.drain
        ? {
          type: 'adjust',
          targetKey: input.targetKey,
          sourceKey: input.sourceKey,
          amount: -input.amount,
          mode: input.mode,
          drain: true,
          drainAmount: input.amount,
        }
        : player ? { type: 'restore-player', player } : undefined);
    }
    hapticSuccess();
  };

  const runRandomPick = (pool?: ParticipantKey[]) => {
    if (!liveGame) return;
    const picked = pickRandomPlayer(liveGame.state, pool);
    if (!picked) return;
    const eligibleKeys = pool?.length
      ? pool
      : liveGame.state.players
        .filter((player) => !player.isEliminated)
        .map((player) => player.participantKey);
    runRoulette(eligibleKeys, picked.participantKey, 'random');
  };

  const handleDiscardGame = async () => {
    if (!liveGame || discardingGame || sessionClosedRef.current) return;

    setDiscardingGame(true);
    sessionClosedRef.current = true;
    pendingCancelRef.current = true;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    try {
      const pendingJournal = journalWriteRef.current;
      const serverRecord = serverRecordRef.current ?? liveGame;
      await archiveAndClearLiveGameSession(groupId, {
        id: liveGame.id,
        serverRecord,
        needsCreate: needsCreateRef.current,
        mutations: mutationQueueRef.current,
        finalization: null,
        cancel: true,
      });
      void pendingJournal
        .catch(() => undefined)
        .finally(() => clearLiveGameOfflineSessionIfMatches(groupId, liveGame.id))
        .catch(() => undefined);
      serverRecordRef.current = null;
      mutationQueueRef.current = [];
      syncBatchStartedAtRef.current = null;
      setPendingSyncCount(0);
      historyRef.current = createLiveGameHistory();
      setUndoDepth(0);
      setRedoDepth(0);
      needsCreateRef.current = false;
      pendingCancelRef.current = false;
      setOptimisticRecord(null);
      flushArchivedOutbox();
      hapticSuccess();
      showToast(copy('liveGameDiscarded'));
      router.replace(`/table/${groupId}`);
    } catch {
      sessionClosedRef.current = false;
      pendingCancelRef.current = false;
      void saveJournal();
      showToast(copy('liveGameDiscardFailed'));
    } finally {
      setDiscardingGame(false);
      setShowDiscardConfirm(false);
      setShowEndGame(false);
    }
  };

  const handleEndGame = async () => {
    if (!user || !liveGame || endingGame || sessionClosedRef.current) return;
    if (!endIsDraw && !endWinnerKey) {
      showToast(copy('liveGameWinnerError'));
      return;
    }
    if (!endIsDraw && activePlayers.length !== 1 && !endWinCondition) {
      showToast(copy('liveGameWinConditionError'));
      return;
    }
    if (!isValidLiveGameResult(liveGame.state, {
      winnerKey: endIsDraw ? null : endWinnerKey || null,
      isDraw: endIsDraw,
      winCondition: endIsDraw ? null : endWinCondition,
    })) {
      showToast(copy('liveGameWinConditionError'));
      return;
    }

    setEndingGame(true);
    try {
      if (!endIsDraw && endWinCondition === 'last_standing' && activePlayers.length > 1 && endWinnerKey) {
        activePlayers
          .filter((player) => player.participantKey !== endWinnerKey)
          .forEach((player) => pulseDamage(player.participantKey));
        enqueueMutation({ type: 'last_standing', winnerKey: endWinnerKey });
      }

      const finalizedGame = liveGameRef.current ?? liveGame;
      const players = finalizedGame.state.players.map((player: LiveGamePlayer) => {
        const parsed = parseParticipantKey(player.participantKey);
        return {
          participantKey: player.participantKey,
          deckId: player.deckId,
          isGuest: parsed?.type === 'guest',
          userId: parsed?.type === 'user' ? parsed.id : null,
          guestId: parsed?.type === 'guest' ? parsed.id : null,
        };
      });

      const pending: PendingLiveGameFinalization = {
        winnerKey: endIsDraw ? null : endWinnerKey,
        isDraw: endIsDraw,
        winCondition: endIsDraw
          ? null
          : activePlayers.length === 1 ? 'last_standing' : endWinCondition,
        endedAt: new Date().toISOString(),
        players,
      };
      sessionClosedRef.current = true;
      pendingFinalizationRef.current = pending;
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }

      const durationSeconds = getGameDurationSeconds(liveGame.started_at, pending.endedAt);
      setCompletedDurationSeconds(durationSeconds);

      setCompletedGame(finalizedGame);
      const pendingJournal = journalWriteRef.current;
      await archiveAndClearLiveGameSession(groupId, {
        id: liveGame.id,
        serverRecord: serverRecordRef.current ?? liveGame,
        needsCreate: needsCreateRef.current,
        mutations: mutationQueueRef.current,
        finalization: pending,
        cancel: false,
      });
      void pendingJournal
        .catch(() => undefined)
        .finally(() => clearLiveGameOfflineSessionIfMatches(groupId, liveGame.id))
        .catch(() => undefined);
      serverRecordRef.current = null;
      mutationQueueRef.current = [];
      syncBatchStartedAtRef.current = null;
      setPendingSyncCount(0);
      historyRef.current = createLiveGameHistory();
      setUndoDepth(0);
      setRedoDepth(0);
      needsCreateRef.current = false;
      pendingFinalizationRef.current = null;
      setOptimisticRecord(null);
      flushArchivedOutbox();

      hapticSuccess();
      showToast(`${endIsDraw ? copy('liveGameSavedDraw') : copy('liveGameSaved')} · ${formatGameDuration(durationSeconds)}`);
      setShowRematch(true);
    } catch {
      sessionClosedRef.current = false;
      pendingFinalizationRef.current = null;
      void saveJournal();
      showToast(copy('liveGameSaveFailed'));
    } finally {
      setEndingGame(false);
      setShowEndGame(false);
    }
  };

  const preparePreviousPod = useCallback(() => {
    const previous = completedGame;
    if (!previous) return null;
    const orderedPlayers = [...previous.state.players].sort((a, b) => a.slot - b.slot);
    setPlayerCount(orderedPlayers.length);
    setLayoutVariant(previous.state.layoutVariant ?? 'classic');
    applySeatSetups(orderedPlayers.map((player) => ({
      participantKey: player.participantKey,
      deckId: player.deckId,
    })));
    applyStartingLife(previous.starting_life);
    return previous;
  }, [applySeatSetups, applyStartingLife, completedGame]);

  const handleRematchSameDecks = useCallback(async () => {
    if (!user) return;
    const previous = preparePreviousPod();
    if (!previous) return;
    const keys = previous.state.players.map((player) => player.participantKey);
    const players = previous.state.players.map((player, slot) => createLiveGamePlayer({
      slot,
      participantKey: player.participantKey,
      deckId: player.deckId,
      displayName: player.displayName,
      commander: player.commander,
      commanderImage: player.commanderImage,
      startingLife: previous.starting_life,
      allParticipantKeys: keys,
    }));
    const now = new Date().toISOString();
    const startingPlayer = players[Math.floor(Math.random() * players.length)];
    const startingDirection = Math.random() < 0.5 ? 'clockwise' : 'counterclockwise';
    const record: LiveGameRecord = {
      id: Crypto.randomUUID(),
      group_id: groupId,
      created_by: user.id,
      status: 'active',
      starting_life: previous.starting_life,
      state: {
        version: 0,
        players,
        layoutVariant: previous.state.layoutVariant ?? 'classic',
        startingPlayerKey: startingPlayer?.participantKey ?? null,
        startingDirection,
        events: [],
        summary: createLiveGameSummary(),
      },
      match_id: null,
      started_at: now,
      ended_at: null,
      created_at: now,
      updated_at: now,
    };
    sessionClosedRef.current = false;
    serverRecordRef.current = record;
    mutationQueueRef.current = [];
    syncBatchStartedAtRef.current = null;
    setPendingSyncCount(0);
    historyRef.current = createLiveGameHistory();
    setUndoDepth(0);
    setRedoDepth(0);
    needsCreateRef.current = true;
    setOptimisticRecord(record);
    revealStartingPlayer(record.state.startingPlayerKey ?? null, keys);
    setShowRematch(false);
    await saveJournal();
    void syncJournal();
  }, [groupId, preparePreviousPod, revealStartingPlayer, saveJournal, setOptimisticRecord, syncJournal, user]);

  const handleRematchReselect = useCallback(() => {
    preparePreviousPod();
    setShowRematch(false);
  }, [preparePreviousPod]);

  if (loading || booting) {
    return <ArenaSkeleton contentStyle={scrollContentStyle} />;
  }

  const gameState = liveGame?.state;
  const activePlayers = (gameState?.players ?? []).filter((player: LiveGamePlayer) => !player.isEliminated);
  const endGameWarnings = gameState ? getLiveGameResultWarnings(gameState, {
    winnerKey: endIsDraw ? null : endWinnerKey || null,
    isDraw: endIsDraw,
    winCondition: endIsDraw ? null : endWinCondition,
  }) : [];
  const requiresAlternativeWinCondition = !endIsDraw && activePlayers.length !== 1;
  const pendingEliminatePlayer = gameState?.players.find(
    (player) => player.participantKey === pendingEliminate,
  );

  if (liveGame) {
    return (
      <View style={styles.immersiveRoot}>
        <StatusBar hidden />
        <TableArena
          players={gameState?.players ?? []}
          startedAt={liveGame.started_at}
          layoutVariant={gameState?.layoutVariant ?? 'classic'}
          randomHighlight={randomHighlight}
          startingPlayerKey={gameState?.startingPlayerKey ?? null}
          startingHighlight={startingHighlight}
          startingDirection={gameState?.startingDirection ?? null}
          damagePulse={damagePulse}
          activePlayers={activePlayers}
          labels={{
            damageLife: copy('liveGameDamageLife'),
            damageCommander: copy('liveGameDamageCommander'),
            damageInfect: copy('liveGameDamageInfect'),
            randomAll: copy('liveGameRandomAll'),
            randomOpponents: copy('liveGameRandomOpponents'),
            selectActivePlayer: copy('liveGameSelectActivePlayer'),
            dragDamage: copy('liveGameDragDamage'),
            dropDamage: copy('liveGameDropDamage'),
            damageConfirmTitle: copy('liveGameDamageConfirmTitle'),
            damageAmount: copy('liveGameDamageAmount'),
            lifeDamage: copy('liveGameLifeDamage'),
            commanderDamage: copy('liveGameCommanderDamage'),
            applyDamage: copy('liveGameApplyDamage'),
            cancel: copy('cancel'),
            commanderDamageMeta: copy('liveGameCommanderDamage'),
            infect: copy('liveGameInfect'),
            eliminated: copy('liveGameEliminated'),
            revive: copy('liveGameRevive'),
            selected: copy('liveGameSelected'),
            ko: copy('liveGameKo'),
            endGame: copy('liveGameEnd'),
            startingPlayer: copy('liveGameStartingPlayer'),
            clockwise: copy('liveGameClockwise'),
            counterclockwise: copy('liveGameCounterclockwise'),
            damageReceived: copy('liveGameDamageReceived'),
            undo: copy('liveGameUndo'),
            redo: copy('liveGameRedo'),
            thisPlayer: copy('liveGameThisPlayer'),
            eachOpponent: copy('liveGameEachOpponent'),
            everyone: copy('liveGameEveryone'),
            drain: copy('liveGameDrain'),
            drainHint: copy('liveGameDrainHint'),
            lifelink: copy('liveGameLifelink'),
            lifelinkHint: copy('liveGameLifelinkHint'),
            dieOrCoin: copy('dieOrCoin'),
            coin: copy('coin'),
            heads: copy('heads'),
            tails: copy('tails'),
          }}
          onBack={() => setShowExitChoice(true)}
          canUndo={undoDepth > 0}
          onUndo={handleUndo}
          canRedo={redoDepth > 0}
          onRedo={handleRedo}
          syncStatus={syncStatus}
          syncLabel={copy(syncStatus === 'offline'
            ? 'liveGameSyncOffline'
            : syncStatus === 'pending'
              ? 'liveGameSyncPending'
              : syncStatus === 'syncing'
                ? 'liveGameSyncing'
                : syncStatus === 'error' ? 'liveGameSyncError' : 'liveGameSynced')}
          pendingSyncCount={pendingSyncCount}
          syncError={syncError}
          onRetrySync={() => void syncJournal()}
          onEndGame={() => openEndGameModal(liveGame.state)}
          onAdjust={handleAdjust}
          onApplyDragDamage={handleApplyDragDamage}
          onEliminate={setPendingEliminate}
          onRevive={(key) => {
            const player = liveGame.state.players.find((entry) => entry.participantKey === key);
            if (!player) return;
            enqueueMutation(
              { type: 'revive', targetKey: key, startingLife: liveGame.starting_life },
              { type: 'restore-player', player },
            );
          }}
          onPickRandom={runRandomPick}
          onAdjustCounter={(key, counter, amount) => enqueueMutation(
            { type: 'adjust_counter', targetKey: key, counter, amount },
            { type: 'adjust_counter', targetKey: key, counter, amount: -amount },
          )}
          onSetEmblem={(key, emblem, active) => {
            const holderKey = liveGame.state.players.find((player) => player.counters[emblem])?.participantKey ?? null;
            enqueueMutation(
              { type: 'set_emblem', targetKey: key, emblem, active },
              { type: 'restore_emblem', emblem, holderKey },
            );
          }}
        />

        <Modal
          visible={showExitChoice}
          onClose={() => setShowExitChoice(false)}
          presentation="dialog"
          maxWidth={520}
          scroll={false}
        >
          <ModalHeader
            title={copy('liveGameExitTitle')}
            subtitle={copy('liveGameExitHint')}
            icon={null}
            onClose={() => setShowExitChoice(false)}
          />
          <View style={styles.exitChoiceGrid}>
            <Pressable
              style={({ pressed }) => [styles.exitChoice, styles.pauseChoice, pressed && styles.choicePressed]}
              onPress={() => {
                setShowExitChoice(false);
                router.back();
              }}
            >
              <View style={[styles.exitChoiceIcon, styles.pauseChoiceIcon]}>
                <Ionicons name="pause" size={22} color={colors.primaryLight} />
              </View>
              <View style={styles.exitChoiceCopy}>
                <Text style={styles.exitChoiceTitle}>{copy('liveGamePause')}</Text>
                <Text style={styles.exitChoiceHint}>
                  {copy('resumeGameHint')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.exitChoice, styles.discardChoice, pressed && styles.choicePressed]}
              onPress={openDiscardConfirm}
            >
              <View style={[styles.exitChoiceIcon, styles.discardChoiceIcon]}>
                <Ionicons name="trash-outline" size={21} color="#fca5a5" />
              </View>
              <View style={styles.exitChoiceCopy}>
                <Text style={[styles.exitChoiceTitle, styles.discardChoiceTitle]}>{copy('liveGameDiscard')}</Text>
                <Text style={styles.exitChoiceHint}>{copy('liveGameDiscardConfirm')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(252,165,165,0.72)" />
            </Pressable>
          </View>
        </Modal>

        <ConfirmModal
          visible={Boolean(pendingEliminate)}
          title={copy('liveGameConfirmEliminate')}
          message={pendingEliminatePlayer
            ? `${pendingEliminatePlayer.displayName}\n${copy('liveGameEliminateHint')}`
            : copy('liveGameEliminateHint')}
          icon="skull-outline"
          tone="danger"
          onClose={() => setPendingEliminate(null)}
          actions={[
            { label: copy('cancel'), variant: 'ghost', onPress: () => setPendingEliminate(null) },
            {
              label: copy('liveGameEliminate'),
              variant: 'destructive',
              onPress: () => {
                if (!pendingEliminate) return;
                void hapticWarning();
                const player = liveGame.state.players.find(
                  (entry) => entry.participantKey === pendingEliminate,
                );
                enqueueMutation(
                  {
                    type: 'eliminate',
                    targetKey: pendingEliminate,
                    eliminatedAt: new Date().toISOString(),
                  },
                  player ? { type: 'restore-player', player } : undefined,
                );
                setPendingEliminate(null);
              },
            },
          ]}
        />

        <Modal
          visible={showEndGame}
          onClose={() => setShowEndGame(false)}
          presentation="dialog"
          maxWidth={560}
          footer={(
            <View style={styles.modalActions}>
              <Button
                label={copy('cancel')}
                variant="outline"
                onPress={() => setShowEndGame(false)}
                style={styles.modalButton}
              />
              <Button
                label={endingGame ? copy('liveGameSaving') : copy('liveGameConfirmSave')}
                icon="checkmark-circle-outline"
                onPress={handleEndGame}
                disabled={endingGame
                  || discardingGame
                  || (!endIsDraw && !endWinnerKey)
                  || (requiresAlternativeWinCondition && !endWinCondition)}
                style={styles.modalButton}
              />
            </View>
          )}
        >
          <ModalHeader
            title={copy('liveGameWhoWon')}
            subtitle={copy('liveGameEndGameHint')}
            icon="trophy-outline"
            tone="success"
            onClose={() => setShowEndGame(false)}
          />
          <View style={styles.winConditionHeading}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <Text style={styles.winConditionTitle}>{copy('liveGameWhoWon')}</Text>
          </View>
          <Pressable
            style={[styles.drawOption, endIsDraw && styles.winnerOptionActive]}
            onPress={() => {
              setEndIsDraw((value) => !value);
              setEndWinnerKey('');
              setEndWinCondition(null);
              void hapticLight();
            }}
          >
            <View style={styles.drawIcon}>
              <Ionicons name="remove" size={22} color={endIsDraw ? colors.primaryMuted : colors.muted} />
            </View>
            <View style={styles.winnerCopy}>
              <Text style={styles.winnerOptionText}>{copy('liveGameDraw')}</Text>
              <Text style={styles.winnerOptionMeta}>{copy('liveGameDrawHint')}</Text>
            </View>
            <Ionicons
              name={endIsDraw ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={endIsDraw ? colors.primaryLight : colors.muted}
            />
          </Pressable>
          {!endIsDraw ? activePlayers.map((player: LiveGamePlayer) => (
            <Pressable
              key={player.participantKey}
              style={[styles.winnerOption, endWinnerKey === player.participantKey && styles.winnerOptionActive]}
              onPress={() => {
                setEndIsDraw(false);
                setEndWinnerKey(player.participantKey);
                setEndWinCondition(activePlayers.length === 1 ? 'last_standing' : null);
                void hapticLight();
              }}
            >
              <DeckImage
                uri={player.commanderImage}
                alt={player.commander}
                style={styles.winnerImage}
                containerStyle={styles.winnerImageWrap}
                contentPosition="top"
              />
              <View style={styles.winnerCopy}>
                <Text style={styles.winnerOptionText} numberOfLines={1}>{player.displayName}</Text>
                <Text style={styles.winnerOptionMeta} numberOfLines={1}>{player.commander}</Text>
              </View>
              <Ionicons
                name={endWinnerKey === player.participantKey ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={endWinnerKey === player.participantKey ? colors.primaryLight : colors.muted}
              />
            </Pressable>
          )) : null}
          {!endIsDraw && endWinnerKey ? (
            <View style={styles.winConditionSection}>
              <View style={styles.winConditionHeading}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>2</Text>
                </View>
                <View style={styles.winConditionHeadingCopy}>
                  <Text style={styles.winConditionTitle}>{copy('liveGameWinCondition')}</Text>
                  <Text style={styles.winConditionHint}>
                    {requiresAlternativeWinCondition
                      ? copy('liveGameWinConditionHint')
                      : copy('liveGameWinLastStandingHint')}
                  </Text>
                </View>
              </View>
              {requiresAlternativeWinCondition ? (
                <View style={styles.winConditionGrid}>
                  {WIN_CONDITIONS.filter((condition) => (
                    condition.value !== 'last_standing' || featureFlags?.lastStanding !== false
                  )).map((condition) => {
                    const selected = endWinCondition === condition.value;
                    return (
                      <Pressable
                        key={condition.value}
                        onPress={() => {
                          setEndWinCondition(condition.value);
                          void hapticLight();
                        }}
                        style={({ pressed }) => [
                          styles.winConditionOption,
                          selected && styles.winConditionOptionActive,
                          pressed && styles.choicePressed,
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <View style={[styles.winConditionIcon, selected && styles.winConditionIconActive]}>
                          <Ionicons
                            name={condition.icon}
                            size={20}
                            color={selected ? colors.primaryLight : colors.muted}
                          />
                        </View>
                        <Text style={styles.winConditionOptionTitle}>{copy(condition.labelKey)}</Text>
                        <Text style={styles.winConditionOptionHint} numberOfLines={2}>{copy(condition.hintKey)}</Text>
                        <Ionicons
                          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={19}
                          color={selected ? colors.primaryLight : colors.border}
                          style={styles.winConditionCheck}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.lastStandingCard}>
                  <Ionicons name="shield-checkmark-outline" size={21} color="#86efac" />
                  <Text style={styles.lastStandingText}>{copy('liveGameWinLastStanding')}</Text>
                  <Ionicons name="checkmark-circle" size={20} color="#86efac" />
                </View>
              )}
            </View>
          ) : null}
          {endGameWarnings.length > 0 ? (
            <View style={styles.resultWarning}>
              <Ionicons name="warning-outline" size={18} color="#fcd34d" />
              <Text style={styles.resultWarningText}>{endGameWarnings.map((warning) => (
                warning === 'draw_with_single_survivor'
                  ? (language === 'it' ? 'È rimasto un solo giocatore: verifica che sia davvero un pareggio.' : 'Only one player remains: verify this is really a draw.')
                  : (language === 'it' ? 'Il vincitore ha già un valore letale o risulta eliminato.' : 'The winner already has a lethal total or is marked eliminated.')
              )).join(' ')}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={openDiscardConfirm}
            disabled={endingGame || discardingGame}
            style={styles.discardButton}
          >
            <Ionicons name="trash-outline" size={16} color={colors.destructive} />
            <Text style={styles.discardButtonText}>
              {discardingGame ? copy('liveGameDiscarding') : copy('liveGameDiscard')}
            </Text>
          </Pressable>
        </Modal>

        <ConfirmModal
          visible={showDiscardConfirm}
          title={copy('liveGameDiscard')}
          message={copy('liveGameDiscardConfirm')}
          icon="trash-outline"
          tone="danger"
          onClose={() => setShowDiscardConfirm(false)}
          actions={[
            { label: copy('cancel'), variant: 'ghost', onPress: () => setShowDiscardConfirm(false) },
            {
              label: discardingGame ? copy('liveGameDiscarding') : copy('liveGameDiscard'),
              variant: 'destructive',
              onPress: handleDiscardGame,
              disabled: discardingGame,
            },
          ]}
        />
      </View>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.topBar}>
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color={colors.primaryMuted} />
          <Text style={styles.backLabel}>{group?.name || copy('table')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[scrollContentStyle, styles.content]}>
          {recoveryOutbox.length > 0 ? (
            <PhyrexianPanel style={styles.recoveryPanel}>
              <View style={styles.recoveryHeader}><Ionicons name="cloud-upload-outline" size={21} color="#fcd34d" /><View style={styles.recoveryCopy}><Text style={styles.recoveryTitle}>{language === 'it' ? 'Centro recupero' : 'Recovery center'}</Text><Text style={styles.recoveryHint}>{language === 'it' ? `${recoveryOutbox.length} salvataggi in attesa. La partita resta protetta sul dispositivo.` : `${recoveryOutbox.length} saves pending. The game remains protected on this device.`}</Text></View></View>
              <View style={styles.recoveryActions}><Button label={language === 'it' ? 'Sincronizza ora' : 'Sync now'} icon="sync-outline" onPress={() => void syncJournal()} /><Button label={language === 'it' ? 'Scarta' : 'Discard'} variant="ghost" onPress={() => setShowClearRecoveryConfirm(true)} /></View>
            </PhyrexianPanel>
          ) : null}
          <PhyrexianPanel style={styles.setupPanel}>
            <Text style={styles.setupTitle}>{copy('liveGameSetupTitle')}</Text>
            <Text style={styles.setupHint}>{copy('liveGameSetupHint')}</Text>

            <LiveGameConfigurator
              playerCount={playerCount}
              layoutVariant={layoutVariant}
              seats={seatSetups}
              startingLife={startingLife}
              participants={setupParticipants}
              onPlayerCountChange={handlePlayerCountChange}
              onLayoutChange={setLayoutVariant}
              onStartingLifeChange={applyStartingLife}
              onSelectParticipant={handleSelectSetupParticipant}
              archidektSyncRequest={archidektSyncRequest}
              onAssignSeat={handleAssignSeat}
              onReset={resetSetup}
              onStart={handleStart}
              starting={starting}
              labels={{
                playerCount: copy('liveGamePlayerCount'),
                layout: copy('liveGameLayout'),
                classic: copy('liveGameLayoutClassic'),
                opposed: copy('liveGameLayoutOpposed'),
                seats: copy('liveGameSeats'),
                seat: copy('liveGameSeat'),
                emptySeat: copy('liveGameEmptySeat'),
                choosePlayer: copy('liveGameChoosePlayer'),
                chooseDeck: copy('liveGameChooseDeck'),
                archidektSyncWaiting: copy('liveGameArchidektSyncWaiting'),
                archidektSyncCompleted: copy('liveGameArchidektSyncCompleted'),
                archidektSyncPartial: copy('liveGameArchidektSyncPartial'),
                archidektSyncRetry: copy('liveGameArchidektSyncRetry'),
                archidektSyncFailed: copy('liveGameArchidektSyncFailed'),
                searchDecks: copy('searchDecks'),
                noDecksMatchSearch: copy('noDecksMatchSearch'),
                clearSeat: copy('liveGameClearSeat'),
                confirm: copy('confirm'),
                reset: copy('liveGameResetSetup'),
                startingLife: copy('liveGameStartingLife'),
                custom: copy('liveGameCustom'),
                back: copy('back'),
                next: copy('next'),
                start: copy('liveGameStart'),
                starting: copy('liveGameStarting'),
              }}
            />

          </PhyrexianPanel>
      </ScrollView>
      <ConfirmModal
        visible={showClearRecoveryConfirm}
        title={language === 'it' ? 'Scartare i recuperi?' : 'Discard recovery data?'}
        message={language === 'it' ? 'I salvataggi non ancora sincronizzati verranno rimossi definitivamente.' : 'Unsynced saves will be permanently removed.'}
        icon="warning-outline"
        tone="danger"
        onClose={() => setShowClearRecoveryConfirm(false)}
        actions={[{ label: copy('cancel'), variant: 'ghost', onPress: () => setShowClearRecoveryConfirm(false) }, { label: language === 'it' ? 'Scarta' : 'Discard', variant: 'destructive', onPress: () => { void saveLiveGameOutbox([]); setRecoveryOutbox([]); setShowClearRecoveryConfirm(false); } }]}
      />
      <Modal
        visible={showRematch}
        onClose={() => setShowRematch(false)}
        presentation="dialog"
        maxWidth={500}
        footer={(
          <Button
            label={copy('liveGameDone')}
            variant="ghost"
            onPress={() => router.replace(`/table/${groupId}`)}
          />
        )}
      >
        <ModalHeader
          title={copy('liveGameAgainTitle')}
          subtitle={`${copy('liveGameAgainHint')}\n${copy('liveGameDuration')}: ${formatGameDuration(completedDurationSeconds)}`}
          icon="refresh-outline"
          onClose={() => setShowRematch(false)}
        />
        {completedGame ? (
          <LiveGameRecapView
            record={completedGame}
            labels={{
              timeline: copy('liveGameLifeTimeline'),
              highlights: copy('liveGameHighlights'),
              empty: copy('liveGameLogEmpty'),
            }}
          />
        ) : null}
        <View style={styles.rematchActions}>
          <Button
            label={copy('liveGameSameDecks')}
            icon="layers-outline"
            onPress={handleRematchSameDecks}
          />
          <Button
            label={copy('liveGameReselectDecks')}
            icon="albums-outline"
            variant="outline"
            onPress={handleRematchReselect}
          />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backLabel: {
    color: colors.primaryMuted,
    fontSize: 14,
    fontWeight: '600',
  },

  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  setupPanel: {
    gap: spacing.md,
  },
  setupTitle: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '700',
  },
  setupHint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionLabel: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  resultWarning: { flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)', borderRadius: radii.md, backgroundColor: 'rgba(245,158,11,0.1)', padding: spacing.sm },
  resultWarningText: { flex: 1, color: '#fde68a', fontSize: 11, lineHeight: 16 },
  recoveryPanel: { gap: spacing.sm, borderColor: 'rgba(251,191,36,0.35)' },
  recoveryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recoveryCopy: { flex: 1, gap: 2 },
  recoveryTitle: { color: '#fde68a', fontSize: 14, fontWeight: '900' },
  recoveryHint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  recoveryActions: { flexDirection: 'row', gap: spacing.sm },
  rematchActions: {
    gap: spacing.sm,
  },
  configSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  configSectionLabel: {
    flex: 1,
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  playerCountHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  lifePill: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  lifePillActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
  },
  lifePillText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  lifePillTextActive: {
    color: '#7dd3fc',
  },
  presetButton: {
    flex: 1,
  },
  immersiveRoot: {
    flex: 1,
    backgroundColor: '#050508',
  },
  exitChoiceGrid: {
    gap: spacing.sm,
  },
  exitChoice: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  pauseChoice: {
    borderColor: colors.selectionBorder,
    backgroundColor: colors.selectionTint,
  },
  discardChoice: {
    borderColor: 'rgba(248,113,113,0.34)',
    backgroundColor: 'rgba(127,29,29,0.13)',
  },
  exitChoiceIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseChoiceIcon: {
    backgroundColor: colors.selectionTintStrong,
  },
  discardChoiceIcon: {
    backgroundColor: 'rgba(127,29,29,0.3)',
  },
  exitChoiceCopy: {
    flex: 1,
    gap: 2,
  },
  exitChoiceTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '800',
  },
  discardChoiceTitle: {
    color: '#fecaca',
  },
  exitChoiceHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  drawOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.cardInset,
    padding: spacing.sm,
  },
  drawIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceChip,
  },
  winnerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.cardInset,
    padding: spacing.sm,
  },
  winnerOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.selectionTint,
  },
  winnerOptionText: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '800',
  },
  choicePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  winnerOptionMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  winnerCopy: {
    flex: 1,
    minWidth: 0,
  },
  winnerImageWrap: {
    width: 42,
    height: 56,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  winnerImage: {
    width: 42,
    height: 56,
  },
  winConditionSection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  winConditionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  stepBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  winConditionHeadingCopy: {
    flex: 1,
  },
  winConditionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '900',
  },
  winConditionHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  winConditionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  winConditionOption: {
    position: 'relative',
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 118,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardInset,
    padding: spacing.md,
    gap: 5,
  },
  winConditionOptionActive: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.selectionTint,
  },
  winConditionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceChip,
  },
  winConditionIconActive: {
    backgroundColor: colors.selectionTintStrong,
  },
  winConditionOptionTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '900',
  },
  winConditionOptionHint: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  winConditionCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  lastStandingCard: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.30)',
    backgroundColor: 'rgba(22, 101, 52, 0.18)',
    paddingHorizontal: spacing.md,
  },
  lastStandingText: {
    flex: 1,
    color: '#dcfce7',
    fontSize: 13,
    fontWeight: '800',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
  discardButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
  },
  discardButtonText: {
    color: colors.destructive,
    fontSize: 13,
    fontWeight: '700',
  },
});
