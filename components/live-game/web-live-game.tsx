'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Crown,
  Box,
  Dices,
  Flag,
  Heart,
  Loader2,
  Maximize2,
  Minus,
  MoreHorizontal,
  Pause,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Search,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trophy,
  Trash2,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import { useRuntimeConfig } from '@/components/runtime-config-provider';
import { matchesLiveGameDeckSearch } from '@/lib/live-game-deck-search';
import { Button } from '@/components/ui/button';
import { HoldActionButton } from '@/components/ui/hold-action-button';
import { DeckImage } from '@/components/deck-image';
import { LayoutMiniature } from '@/components/live-game/layout-miniature';
import { LiveGameModalTitle } from '@/components/live-game/live-game-modal-title';
import { LiveGameRecapView } from '@/components/live-game/live-game-recap';
import { ModalCard, ModalOverlay } from '@/components/ui/modal-shell';
import { useLanguage } from '@/components/language-provider';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
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
  type GroupDamageScope,
  type LiveGameMutation,
  type LiveGameRecord,
  type QueuedLiveGameMutation,
  type WinCondition,
} from '@/lib/live-game';
import { rollTableRandom, type TableRandomKind } from '@/lib/table-randomizer';
import {
  getLandscapeSeatRotation,
  getCenterToolbarBand,
  getSeatRotation,
  getSquareTableLayouts,
  getViewportTableOrientation,
  mapPlayersToSeats,
  type TableLayoutVariant,
} from '@/lib/live-game-table-layout';
import { buildRouletteSequence } from '@/lib/live-game-roulette';
import {
  applyQueuedLiveGameMutations,
  cancelLiveGame,
  ensureLiveGameCreated,
  fetchActiveLiveGame,
  fetchBusyLiveGameParticipantKeys,
  finalizeLiveGameAsMatch,
  subscribeToLiveGame,
} from '@/lib/live-game-service';
import {
  clearWebLiveGameJournal,
  loadWebLiveGameJournal,
  saveWebLiveGameJournal,
  type PendingLiveGameFinalization,
} from '@/lib/live-game-offline';
import {
  createLiveGameHistory,
  recordLiveGameHistory,
  redoLiveGameHistory,
  undoLiveGameHistory,
  type LiveGameHistory,
} from '@/lib/live-game-history';
import { persistLiveGameTelemetry, recordLiveGameQueueDepth } from '@/lib/live-game-telemetry';
import {
  createDefaultWebLiveGameSetup,
  loadWebLiveGameSetup,
  saveWebLiveGameSetup,
  type WebLiveGameSeatSetup,
} from '@/lib/live-game-setup';
import type { ParticipantKey } from '@/lib/participant-keys';
import { LifeReadout } from '@/components/ui/recent-life-delta';
import { useScreenWakeLock } from '@/hooks/use-screen-wake-lock';
import {
  LIVE_GAME_SYNC_BATCH_SIZE,
  getLiveGameSyncDelay,
} from '@/lib/live-game-sync-policy';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

export type WebTrackerDeck = {
  id: string;
  name: string;
  commander: string;
  commanderImage: string | null;
  isFavorite: boolean;
};

export type WebTrackerParticipant = {
  key: ParticipantKey;
  displayName: string;
  isGuest: boolean;
  userId: string | null;
  guestId: string | null;
  decks: WebTrackerDeck[];
};

type DragState = {
  sourceKey: ParticipantKey;
  startX: number;
  startY: number;
  x: number;
  y: number;
  targetKey: ParticipantKey | null;
};

type DamageDraft = {
  sourceKey: ParticipantKey;
  targetKey: ParticipantKey;
  mode: DamageMode;
  scope: 'single' | GroupDamageScope;
  drain: boolean;
};

const WIN_CONDITIONS: Array<{
  value: WinCondition;
  label: { it: string; en: string };
  icon: typeof Sparkles;
}> = [
  { value: 'last_standing', label: { it: 'Ultimo in piedi', en: 'Last Standing' }, icon: Shield },
  { value: 'combo', label: { it: 'Combo', en: 'Combo' }, icon: Sparkles },
  { value: 'concession', label: { it: 'Resa avversari', en: 'Opponents conceded' }, icon: Flag },
  { value: 'alternate_card', label: { it: 'Vittoria alternativa', en: 'Alternate card win' }, icon: Trophy },
  { value: 'other', label: { it: 'Altro', en: 'Other' }, icon: MoreHorizontal },
];

function secureRandom() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]! / 0x1_0000_0000;
}

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape-primary') => Promise<void>;
  unlock?: () => void;
};

async function lockTrackerLandscapeOrientation() {
  const orientation = screen.orientation as LockableScreenOrientation | undefined;
  if (!orientation?.lock) return;
  try {
    await orientation.lock('landscape-primary');
  } catch {
    // Safari and some embedded browsers do not expose orientation locking.
  }
}

function unlockTrackerOrientation() {
  const orientation = screen.orientation as LockableScreenOrientation | undefined;
  try {
    orientation?.unlock?.();
  } catch {
    // Ignore unsupported orientation APIs.
  }
}

function replay(record: LiveGameRecord, queue: QueuedLiveGameMutation[]) {
  return queue.reduce(
    (current, item) => ({ ...current, state: applyLiveGameMutation(current.state, item.mutation) }),
    record,
  );
}

function formatDuration(startedAt: string | null, endedAt?: string) {
  if (!startedAt) return '00:00';
  const endTime = endedAt ? new Date(endedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((endTime - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}


function restoreDefaultTrackerDisplay() {
  unlockTrackerOrientation();
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined);
  }
}

export function WebLiveGame({
  groupId,
  arenaName,
  userId,
  participants,
}: {
  groupId: string;
  arenaName: string;
  userId: string;
  participants: WebTrackerParticipant[];
}) {
  const router = useRouter();
  const { copy } = useLanguage();
  const { toast } = useToast();
  const [booting, setBooting] = useState(true);
  const [record, setRecord] = useState<LiveGameRecord | null>(null);
  const recordRef = useRef<LiveGameRecord | null>(null);
  const serverRef = useRef<LiveGameRecord | null>(null);
  const queueRef = useRef<QueuedLiveGameMutation[]>([]);
  const needsCreateRef = useRef(false);
  const pendingFinalizationRef = useRef<PendingLiveGameFinalization | null>(null);
  const pendingCancelRef = useRef(false);
  const historyRef = useRef<LiveGameHistory>(createLiveGameHistory());
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);
  const syncingRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const syncBatchStartedAtRef = useRef<number | null>(null);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncBadgeVisible, setSyncBadgeVisible] = useState(true);
  const [liveOnboardingOpen, setLiveOnboardingOpen] = useState(false);
  const [recoveredJournal, setRecoveredJournal] = useState(false);
  const telemetrySessionRef = useRef(globalThis.crypto.randomUUID());
  const [duration, setDuration] = useState('00:00');
  useScreenWakeLock(Boolean(record));

  const initialSetup = useMemo(() => loadWebLiveGameSetup(groupId, userId), [groupId, userId]);
  const [playerCount, setPlayerCount] = useState(initialSetup.playerCount);
  const [layoutVariant, setLayoutVariant] = useState<TableLayoutVariant>(initialSetup.layoutVariant);
  const [startingLife, setStartingLife] = useState(initialSetup.startingLife);
  const [seats, setSeats] = useState<WebLiveGameSeatSetup[]>(initialSetup.seats);
  const [setupStep, setSetupStep] = useState(0);
  const [setupSeatIndex, setSetupSeatIndex] = useState(0);
  const [setupDeckSearch, setSetupDeckSearch] = useState('');
  const [starting, setStarting] = useState(false);
  const [damageDraft, setDamageDraft] = useState<DamageDraft | null>(null);
  const [damageAmount, setDamageAmount] = useState('0');
  const [damagePanelKey, setDamagePanelKey] = useState<ParticipantKey | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [highlight, setHighlight] = useState<ParticipantKey | null>(null);
  const [randomOpponentMode, setRandomOpponentMode] = useState(false);
  const [randomizerOpen, setRandomizerOpen] = useState(false);
  const [randomizerResult, setRandomizerResult] = useState<string | number | null>(null);
  const rouletteTimers = useRef<number[]>([]);
  const [endOpen, setEndOpen] = useState(false);
  const [winnerKey, setWinnerKey] = useState<ParticipantKey | ''>('');
  const [isDraw, setIsDraw] = useState(false);
  const [winCondition, setWinCondition] = useState<WinCondition | null>(null);
  const [ending, setEnding] = useState(false);
  const { featureFlags } = useRuntimeConfig();
  const [completedRecord, setCompletedRecord] = useState<LiveGameRecord | null>(null);
  const [completedDuration, setCompletedDuration] = useState('00:00');
  const durationRef = useRef('00:00');
  const syncPresentationStatus = syncError
    && pendingSyncCount > 0
    ? 'error'
    : syncing
      ? 'syncing'
      : pendingSyncCount
        ? 'pending'
        : online
          ? 'synced'
          : 'offline';

  useEffect(() => {
    setSyncBadgeVisible(true);
    if (syncPresentationStatus !== 'synced' && syncPresentationStatus !== 'offline') return;
    const timer = window.setTimeout(() => setSyncBadgeVisible(false), 15_000);
    return () => window.clearTimeout(timer);
  }, [syncPresentationStatus]);
  const [confirmRematch, setConfirmRematch] = useState(false);
  const [confirmEliminate, setConfirmEliminate] = useState<ParticipantKey | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [exitChoiceOpen, setExitChoiceOpen] = useState(false);
  const previousActivePlayerCountRef = useRef<number | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [tableSize, setTableSize] = useState({ width: 390, height: 760 });
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    seats.forEach((seat) => {
      if (!seat.participantKey || !seat.deckId) return;
      const deck = participants.find((participant) => participant.key === seat.participantKey)
        ?.decks.find((entry) => entry.id === seat.deckId);
      if (deck?.commanderImage) {
        const preload = new Image();
        preload.src = deck.commanderImage;
      }
    });
  }, [participants, seats]);

  const enterTrackerLandscape = useCallback(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone) {
      void lockTrackerLandscapeOrientation();
      return;
    }
    if (document.fullscreenElement) {
      void lockTrackerLandscapeOrientation();
      return;
    }
    if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        .then(() => lockTrackerLandscapeOrientation())
        .catch(() => {
          toast({
            title: copy({
              it: 'Il browser non ha consentito lo schermo intero. Riprova dal pulsante del tracker.',
              en: 'The browser did not allow fullscreen. Try again from the tracker button.',
            }),
            variant: 'destructive',
          });
        });
      return;
    }
    void lockTrackerLandscapeOrientation();
    toast({
      title: copy({
        it: 'Per il vero schermo intero su iPad, aggiungi MTG: Commander alla schermata Home.',
        en: 'For true fullscreen on iPad, add MTG: Commander to your Home Screen.',
      }),
    });
  }, [copy, toast]);

  useEffect(() => {
    const updateFullscreen = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setFullscreen(isFullscreen);
      if (recordRef.current) {
        void lockTrackerLandscapeOrientation();
      }
    };
    updateFullscreen();
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreen);
      restoreDefaultTrackerDisplay();
    };
  }, []);

  const activeOrientationRecordId = record?.id ?? null;
  useEffect(() => {
    if (activeOrientationRecordId) {
      void lockTrackerLandscapeOrientation();
      return;
    }
    restoreDefaultTrackerDisplay();
  }, [activeOrientationRecordId]);

  const setOptimisticRecord = useCallback((next: LiveGameRecord | null) => {
    recordRef.current = next;
    setRecord(next);
  }, []);

  const persist = useCallback((next = recordRef.current) => {
    if (!next || !serverRef.current) return;
    saveWebLiveGameJournal(groupId, {
      record: next,
      serverRecord: serverRef.current,
      needsCreate: needsCreateRef.current,
      mutations: queueRef.current,
      pendingFinalization: pendingFinalizationRef.current,
      pendingCancel: pendingCancelRef.current,
      history: historyRef.current,
    });
  }, [groupId]);

  const showCompletedGame = useCallback((completed: LiveGameRecord, endedAt: string) => {
    setCompletedDuration(formatDuration(completed.started_at, endedAt));
    setCompletedRecord(completed);
    serverRef.current = null;
    queueRef.current = [];
    syncBatchStartedAtRef.current = null;
    needsCreateRef.current = false;
    historyRef.current = createLiveGameHistory();
    setUndoDepth(0);
    setRedoDepth(0);
    setPendingSyncCount(0);
    setOptimisticRecord(null);
    setEndOpen(false);
  }, [setEndOpen, setOptimisticRecord]);

  const clearCancelledGame = useCallback(() => {
    serverRef.current = null;
    queueRef.current = [];
    syncBatchStartedAtRef.current = null;
    needsCreateRef.current = false;
    historyRef.current = createLiveGameHistory();
    setUndoDepth(0);
    setRedoDepth(0);
    setPendingSyncCount(0);
    setOptimisticRecord(null);
    setConfirmCancel(false);
  }, [setConfirmCancel, setOptimisticRecord]);

  const flush = useCallback(async () => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (syncingRef.current || !recordRef.current || !serverRef.current || !navigator.onLine) return false;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);
    let failed = false;
    try {
      let server = serverRef.current;
      if (needsCreateRef.current) {
        server = await ensureLiveGameCreated(supabase, recordRef.current);
        serverRef.current = server;
        needsCreateRef.current = false;
      }
      while (queueRef.current.length > 0) {
        const batch = queueRef.current.slice(0, LIVE_GAME_SYNC_BATCH_SIZE);
        server = await applyQueuedLiveGameMutations(supabase, server, batch);
        serverRef.current = server;
        queueRef.current = queueRef.current.slice(batch.length);
        if (queueRef.current.length === 0) syncBatchStartedAtRef.current = null;
        setPendingSyncCount(queueRef.current.length);
        setOptimisticRecord(replay(server, queueRef.current));
        persist(recordRef.current);
      }
      if (pendingFinalizationRef.current) {
        const completed = recordRef.current;
        const finalization = pendingFinalizationRef.current;
        const matchId = await finalizeLiveGameAsMatch(supabase, {
          liveGameId: server.id,
          ...finalization,
        });
        void authenticatedFetch('/api/notifications/match-completed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId }),
        });
        pendingFinalizationRef.current = null;
        clearWebLiveGameJournal(groupId);
        if (completed) showCompletedGame(completed, finalization.endedAt);
        return true;
      }
      if (pendingCancelRef.current) {
        await cancelLiveGame(supabase, server.id);
        pendingCancelRef.current = false;
        clearWebLiveGameJournal(groupId);
        clearCancelledGame();
        return true;
      }
      persist(recordRef.current);
      return true;
    } catch (error) {
      failed = true;
      persist(recordRef.current);
      setSyncError(error instanceof Error ? error.message : 'Sync failed');
      console.error('Web live-game sync failed', error);
      return false;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      void persistLiveGameTelemetry(supabase, {
        userId,
        liveGameId: recordRef.current?.id ?? null,
        sessionId: telemetrySessionRef.current,
        platform: 'web',
        force: failed,
      }).catch(() => undefined);
    }
  }, [clearCancelledGame, groupId, persist, setOptimisticRecord, showCompletedGame, userId]);

  const scheduleFlush = useCallback(() => {
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    if (queueRef.current.length > 0 && syncBatchStartedAtRef.current === null) {
      syncBatchStartedAtRef.current = Date.now();
    }
    const delay = getLiveGameSyncDelay({
      queueDepth: queueRef.current.length,
      batchStartedAt: syncBatchStartedAtRef.current,
    });
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void flush();
    }, delay);
  }, [flush]);

  const refreshAuthoritativeState = useCallback(async () => {
    const current = recordRef.current;
    if (!current || needsCreateRef.current || syncingRef.current) return;
    const remote = await fetchActiveLiveGame(
      supabase,
      groupId,
      `user:${userId}` as ParticipantKey,
    );
    if (!remote || remote.id !== current.id) return;
    serverRef.current = remote;
    setOptimisticRecord(replay(remote, queueRef.current));
    persist(recordRef.current);
  }, [groupId, persist, setOptimisticRecord, userId]);

  useEffect(() => {
    if (queueRef.current.length > 0) scheduleFlush();
    return () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [scheduleFlush]);

  useEffect(() => {
    const flushBeforeBackground = () => {
      if (document.visibilityState === 'hidden') {
        if (queueRef.current.length > 0) void flush();
        void persistLiveGameTelemetry(supabase, {
          userId,
          liveGameId: recordRef.current?.id ?? null,
          sessionId: telemetrySessionRef.current,
          platform: 'web',
          force: true,
        }).catch(() => undefined);
      } else {
        void refreshAuthoritativeState().catch(() => undefined).finally(() => flush());
      }
    };
    const flushBeforeExit = () => {
      if (queueRef.current.length > 0) void flush();
    };
    document.addEventListener('visibilitychange', flushBeforeBackground);
    window.addEventListener('pagehide', flushBeforeExit);
    return () => {
      document.removeEventListener('visibilitychange', flushBeforeBackground);
      window.removeEventListener('pagehide', flushBeforeExit);
    };
  }, [flush, refreshAuthoritativeState, userId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      void refreshAuthoritativeState().catch(() => undefined).finally(() => flush());
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flush, refreshAuthoritativeState]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const participantKey = `user:${userId}` as ParticipantKey;
      const cached = loadWebLiveGameJournal(groupId);
      if (cached?.record.state.players.some((player) => player.participantKey === participantKey)) {
        setRecoveredJournal(true);
        serverRef.current = cached.serverRecord;
        queueRef.current = cached.mutations;
        syncBatchStartedAtRef.current = cached.mutations.length ? Date.now() : null;
        needsCreateRef.current = cached.needsCreate;
        pendingFinalizationRef.current = cached.pendingFinalization;
        pendingCancelRef.current = cached.pendingCancel;
        historyRef.current = cached.history;
        setUndoDepth(cached.history.undo.length);
        setRedoDepth(cached.history.redo.length);
        setPendingSyncCount(cached.mutations.length);
        setOptimisticRecord(cached.record);
      }
      try {
        if (cached && (cached.pendingFinalization || cached.pendingCancel) && navigator.onLine) {
          const terminalOperationRecovered = await flush();
          if (terminalOperationRecovered) return;
        }
        const remote = await fetchActiveLiveGame(supabase, groupId, participantKey);
        if (!mounted) return;
        if (remote) {
          const queue = cached?.record.id === remote.id ? queueRef.current : [];
          serverRef.current = remote;
          queueRef.current = queue;
          syncBatchStartedAtRef.current = queue.length ? Date.now() : null;
          setPendingSyncCount(queue.length);
          needsCreateRef.current = false;
          setOptimisticRecord(replay(remote, queue));
          persist(recordRef.current);
          void flush();
        } else if (cached && !cached.needsCreate) {
          clearWebLiveGameJournal(groupId);
          serverRef.current = null;
          queueRef.current = [];
          syncBatchStartedAtRef.current = null;
          setOptimisticRecord(null);
        }
      } catch {
        // The crash-safe local journal remains playable offline.
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => { mounted = false; };
  }, [flush, groupId, persist, setOptimisticRecord, userId]);

  const activeRecordId = record?.id;
  useEffect(() => {
    if (!activeRecordId || localStorage.getItem('live-onboarding-v1')) return;
    const timer = window.setTimeout(() => setLiveOnboardingOpen(true), 4_500);
    return () => window.clearTimeout(timer);
  }, [activeRecordId]);
  useEffect(() => {
    if (!activeRecordId || needsCreateRef.current) return;
    return subscribeToLiveGame(supabase, activeRecordId, (remote) => {
      if (remote.status !== 'active') {
        if (pendingFinalizationRef.current || pendingCancelRef.current) return;
        serverRef.current = null;
        queueRef.current = [];
        syncBatchStartedAtRef.current = null;
        pendingFinalizationRef.current = null;
        pendingCancelRef.current = false;
        clearWebLiveGameJournal(groupId);
        setOptimisticRecord(null);
        if (remote.status === 'ended') {
          setCompletedRecord(remote);
          setCompletedDuration(durationRef.current);
          toast({ title: copy({ it: 'Partita conclusa su un altro dispositivo', en: 'Game ended on another device' }) });
        } else {
          router.replace(`/table/${groupId}`);
        }
        return;
      }
      if (syncingRef.current) return;
      serverRef.current = remote;
      setOptimisticRecord(replay(remote, queueRef.current));
      persist(recordRef.current);
    }, (status) => {
      if (status === 'SUBSCRIBED') {
        void refreshAuthoritativeState().catch(() => undefined).finally(() => flush());
      }
    });
  }, [activeRecordId, copy, flush, groupId, persist, refreshAuthoritativeState, router, setOptimisticRecord, toast]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (!record?.started_at) return;
    setDuration(formatDuration(record.started_at));
    const timer = window.setInterval(() => setDuration(formatDuration(record.started_at)), 1000);
    return () => window.clearInterval(timer);
  }, [record?.started_at]);

  useEffect(() => {
    const element = tableRef.current;
    if (!element) return;
    const update = () => setTableSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [record]);

  const changePlayerCount = (next: number) => {
    setPlayerCount(next);
    setSeats((current) => Array.from({ length: next }, (_, index) => (
      current[index] ?? { participantKey: null, deckId: null }
    )));
  };

  const updateSeatParticipant = (index: number, key: ParticipantKey | null) => {
    setSetupDeckSearch('');
    setSeats((current) => current.map((seat, seatIndex) => {
      if (seatIndex !== index) return seat;
      const participant = participants.find((entry) => entry.key === key);
      const previous = initialSetup.seats.find((entry) => entry.participantKey === key)?.deckId;
      const deckId = participant?.decks.some((deck) => deck.id === previous)
        ? previous!
        : participant?.decks[0]?.id ?? null;
      return { participantKey: key, deckId };
    }));
  };

  const startGame = async (override?: {
    playerCount: number;
    layoutVariant: TableLayoutVariant;
    startingLife: number;
    seats: WebLiveGameSeatSetup[];
  }) => {
    const nextPlayerCount = override?.playerCount ?? playerCount;
    const nextLayoutVariant = override?.layoutVariant ?? layoutVariant;
    const nextStartingLife = override?.startingLife ?? startingLife;
    const nextSeats = override?.seats ?? seats;
    const selected = nextSeats.filter((seat) => seat.participantKey && seat.deckId);
    if (selected.length !== nextPlayerCount || new Set(selected.map((seat) => seat.participantKey)).size !== nextPlayerCount) {
      toast({ title: copy({ it: 'Completa tutti i posti', en: 'Complete every seat' }), variant: 'destructive' });
      return;
    }
    enterTrackerLandscape();
    setStarting(true);
    try {
      const keys = selected.map((seat) => seat.participantKey!) as ParticipantKey[];
      if (navigator.onLine) {
        const busy = await fetchBusyLiveGameParticipantKeys(supabase, groupId, keys);
        if (busy.length) throw new Error(copy({ it: 'Uno dei giocatori è già in una partita attiva.', en: 'A player is already in another active game.' }));
      }
      const players = selected.map((seat, slot) => {
        const participant = participants.find((entry) => entry.key === seat.participantKey)!;
        const deck = participant.decks.find((entry) => entry.id === seat.deckId)!;
        return createLiveGamePlayer({
          slot,
          participantKey: participant.key,
          deckId: deck.id,
          displayName: participant.displayName,
          commander: deck.commander,
          commanderImage: deck.commanderImage,
          startingLife: nextStartingLife,
          allParticipantKeys: keys,
        });
      });
      const startedAt = new Date().toISOString();
      const startingPlayer = players[Math.floor(secureRandom() * players.length)]!;
      const created: LiveGameRecord = {
        id: crypto.randomUUID(),
        group_id: groupId,
        created_by: userId,
        status: 'active',
        starting_life: nextStartingLife,
        state: {
          version: 0,
          players,
          events: [],
          summary: createLiveGameSummary(),
          layoutVariant: nextLayoutVariant,
          startingPlayerKey: startingPlayer.participantKey,
          startingDirection: secureRandom() < 0.5 ? 'clockwise' : 'counterclockwise',
        },
        match_id: null,
        started_at: startedAt,
        ended_at: null,
        created_at: startedAt,
        updated_at: startedAt,
      };
      serverRef.current = created;
      queueRef.current = [];
      syncBatchStartedAtRef.current = null;
      setPendingSyncCount(0);
      historyRef.current = createLiveGameHistory();
      setUndoDepth(0);
      setRedoDepth(0);
      needsCreateRef.current = true;
      pendingFinalizationRef.current = null;
      pendingCancelRef.current = false;
      setCompletedRecord(null);
      setOptimisticRecord(created);
      saveWebLiveGameSetup(groupId, userId, {
        playerCount: nextPlayerCount,
        layoutVariant: nextLayoutVariant,
        startingLife: nextStartingLife,
        seats: nextSeats,
      });
      persist(created);
      runRoulette(keys, startingPlayer.participantKey);
      void flush();
    } catch (error) {
      restoreDefaultTrackerDisplay();
      toast({ title: copy({ it: 'Partita non avviata', en: 'Game not started' }), description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const enqueue = useCallback((
    mutation: LiveGameMutation,
    inverse?: LiveGameMutation,
    historyMode: 'record' | 'skip' = 'record',
  ) => {
    const current = recordRef.current;
    if (!current) return;
    const id = crypto.randomUUID();
    const tracked: LiveGameMutation = {
      ...mutation,
      eventId: mutation.eventId ?? id,
      occurredAt: mutation.occurredAt ?? new Date().toISOString(),
    };
    if (queueRef.current.length === 0) syncBatchStartedAtRef.current = Date.now();
    queueRef.current = [...queueRef.current, { id, mutation: tracked }];
    setPendingSyncCount(queueRef.current.length);
    recordLiveGameQueueDepth(queueRef.current.length);
    if (inverse && historyMode === 'record') {
      historyRef.current = recordLiveGameHistory(historyRef.current, { forward: mutation, inverse });
      setUndoDepth(historyRef.current.undo.length);
      setRedoDepth(0);
    }
    const next = { ...current, state: applyLiveGameMutation(current.state, tracked) };
    setOptimisticRecord(next);
    persist(next);
    scheduleFlush();
  }, [persist, scheduleFlush, setOptimisticRecord]);

  const undoLastMutation = () => {
    const result = undoLiveGameHistory(historyRef.current);
    if (!result) return;
    historyRef.current = result.history;
    setUndoDepth(result.history.undo.length);
    setRedoDepth(result.history.redo.length);
    enqueue(result.mutation, undefined, 'skip');
  };

  const redoLastMutation = () => {
    const result = redoLiveGameHistory(historyRef.current);
    if (!result) return;
    historyRef.current = result.history;
    setUndoDepth(result.history.undo.length);
    setRedoDepth(result.history.redo.length);
    enqueue(result.mutation, undefined, 'skip');
  };

  const runRoulette = (pool: ParticipantKey[], winner?: ParticipantKey) => {
    rouletteTimers.current.forEach(window.clearTimeout);
    rouletteTimers.current = [];
    const picked = winner ?? pickRandomPlayer(recordRef.current!.state, pool)?.participantKey;
    if (!picked) return;
    const sequence = buildRouletteSequence(pool, picked);
    sequence.forEach((key, index) => {
      rouletteTimers.current.push(window.setTimeout(() => setHighlight(key), index * 120));
    });
    rouletteTimers.current.push(window.setTimeout(() => setHighlight(null), sequence.length * 120 + 4000));
  };

  const selectRandomOpponent = (activeKey: ParticipantKey) => {
    if (!record) return;
    const pool = record.state.players
      .filter((player) => !player.isEliminated && player.participantKey !== activeKey)
      .map((player) => player.participantKey);
    setRandomOpponentMode(false);
    runRoulette(pool);
  };

  const beginDamageDrag = (event: React.PointerEvent<HTMLElement>, sourceKey: ParticipantKey) => {
    if (randomOpponentMode || event.button !== 0) return;
    setDrag({
      sourceKey,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      targetKey: null,
    });
  };

  const dragging = Boolean(drag);
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-player-key]');
      const key = element?.dataset.playerKey as ParticipantKey | undefined;
      setDrag((current) => current ? {
        ...current,
        x: event.clientX,
        y: event.clientY,
        targetKey: key && key !== current.sourceKey ? key : null,
      } : null);
    };
    const up = () => {
      setDrag((current) => {
        if (current?.targetKey) {
          setDamageDraft({ sourceKey: current.sourceKey, targetKey: current.targetKey, mode: 'life', scope: 'single', drain: false });
          setDamageAmount('0');
        }
        return null;
      });
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragging]);

  const applyDamageDraft = () => {
    const currentRecord = recordRef.current;
    if (!damageDraft || !currentRecord) return;
    const amount = Math.max(0, Math.min(999, Number(damageAmount) || 0));
    if (amount === 0) return;
    const effectiveScope = damageDraft.drain && damageDraft.scope === 'all_players'
      ? 'opponents'
      : damageDraft.scope;
    if (effectiveScope !== 'single' && damageDraft.mode !== 'commander') {
      const targetCount = effectiveScope === 'all_players'
        ? currentRecord.state.players.filter((player) => !player.isEliminated).length
        : currentRecord.state.players.filter((player) => !player.isEliminated && player.participantKey !== damageDraft.sourceKey).length;
      const drainAmount = damageDraft.drain ? amount * targetCount : undefined;
      enqueue({
        type: 'adjust_many',
        sourceKey: damageDraft.sourceKey,
        amount,
        scope: effectiveScope,
        mode: damageDraft.mode,
        drain: damageDraft.drain,
        drainAmount,
      }, {
        type: 'adjust_many',
        sourceKey: damageDraft.sourceKey,
        amount: -amount,
        scope: effectiveScope,
        mode: damageDraft.mode,
        drain: damageDraft.drain,
        drainAmount,
      });
    } else {
      enqueue({
        type: 'adjust',
        targetKey: damageDraft.targetKey,
        sourceKey: damageDraft.sourceKey,
        amount,
        mode: damageDraft.mode,
        drain: damageDraft.drain,
        drainAmount: damageDraft.drain ? amount : undefined,
      }, {
        type: 'adjust',
        targetKey: damageDraft.targetKey,
        sourceKey: damageDraft.sourceKey,
        amount: -amount,
        mode: damageDraft.mode,
        drain: damageDraft.drain,
        drainAmount: damageDraft.drain ? amount : undefined,
      });
    }
    setDamageDraft(null);
  };

  const openEnd = useCallback(() => {
    if (!record) return;
    const suggested = getSuggestedWinner(record.state);
    setWinnerKey(suggested?.participantKey ?? '');
    setIsDraw(false);
    setWinCondition(getDefaultWinCondition(record.state));
    setEndOpen(true);
  }, [record, setEndOpen, setIsDraw, setWinCondition, setWinnerKey]);

  useEffect(() => {
    if (!record) {
      previousActivePlayerCountRef.current = null;
      return;
    }

    const activePlayerCount = record.state.players.filter((player) => !player.isEliminated).length;
    const previousActivePlayerCount = previousActivePlayerCountRef.current;
    previousActivePlayerCountRef.current = activePlayerCount;

    if (previousActivePlayerCount !== null && previousActivePlayerCount > 1 && activePlayerCount === 1) {
      openEnd();
    }
  }, [openEnd, record]);

  const finishGame = async () => {
    if (!record) return;
    const result = {
      winnerKey: isDraw ? null : winnerKey || null,
      isDraw,
      winCondition: isDraw ? null : winCondition,
    };
    if (!isValidLiveGameResult(record.state, result)) {
      toast({ title: copy({ it: 'Seleziona vincitore e condizione di vittoria.', en: 'Select a winner and win condition.' }), variant: 'destructive' });
      return;
    }
    if (!isDraw && result.winCondition === 'last_standing' && result.winnerKey) {
      enqueue({ type: 'last_standing', winnerKey: result.winnerKey });
    }
    const finalRecord = recordRef.current ?? record;
    const players = finalRecord.state.players.map((player) => {
      const participant = participants.find((entry) => entry.key === player.participantKey)!;
      return {
        participantKey: player.participantKey,
        deckId: player.deckId,
        isGuest: participant.isGuest,
        userId: participant.userId,
        guestId: participant.guestId,
      };
    });
    pendingFinalizationRef.current = {
      winnerKey: result.winnerKey,
      isDraw,
      winCondition: result.winCondition,
      endedAt: new Date().toISOString(),
      players,
    };
    persist(finalRecord);
    setEnding(true);
    const saved = await flush();
    setEnding(false);
    if (saved) {
      toast({ title: copy({ it: `Partita salvata · ${duration}`, en: `Game saved · ${duration}` }) });
    } else {
      toast({ title: copy({ it: 'Salvataggio in attesa di connessione', en: 'Waiting for connection to save' }), variant: 'destructive' });
    }
  };

  const cancelGame = async () => {
    if (!record) return;
    pendingCancelRef.current = true;
    persist(record);
    const cancelled = await flush();
    if (cancelled) {
      router.replace(`/table/${groupId}`);
    }
  };

  if (booting) {
    return <div className="grid min-h-dvh place-items-center bg-black text-emerald-200"><Loader2 className="h-9 w-9 animate-spin" /></div>;
  }

  if (!record) {
    if (completedRecord) {
      const completedPlayers = [...completedRecord.state.players].sort((left, right) => left.slot - right.slot);
      const previousSetup = {
        playerCount: completedPlayers.length,
        layoutVariant: completedRecord.state.layoutVariant ?? 'classic' as TableLayoutVariant,
        startingLife: completedRecord.starting_life,
        seats: completedPlayers.map((player) => ({
          participantKey: player.participantKey,
          deckId: player.deckId,
        })),
      };
      const prepareReselection = () => {
        setPlayerCount(previousSetup.playerCount);
        setLayoutVariant(previousSetup.layoutVariant);
        setStartingLife(previousSetup.startingLife);
        setSeats(previousSetup.seats);
        setCompletedRecord(null);
      };
      return (
        <div className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_top,#0a1a0d_0%,#08080e_52%,#000_100%)] p-4 text-foreground">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-emerald-400/30 bg-card/95 shadow-2xl shadow-emerald-950/50 backdrop-blur-xl">
            <div className="bg-gradient-to-br from-emerald-600/30 via-teal-600/15 to-transparent p-7 text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-200 shadow-lg">
                <Trophy className="h-8 w-8" />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">{arenaName}</p>
              <h1 className="mt-2 text-3xl font-black">{copy({ it: 'Partita salvata', en: 'Game saved' })}</h1>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-2 font-bold text-emerald-100">
                <Clock3 className="h-4 w-4" /> {completedDuration}
              </div>
            </div>
            <div className="space-y-3 p-5 sm:p-7">
              <LiveGameRecapView
                record={completedRecord}
                labels={{
                  timeline: copy({ it: 'Stato finale', en: 'Final state' }),
                  highlights: copy({ it: 'Momenti chiave', en: 'Highlights' }),
                  empty: copy({ it: 'Nessun momento chiave registrato.', en: 'No highlights recorded.' }),
                }}
              />
              <Button onClick={() => setConfirmRematch(true)} className="h-14 w-full bg-gradient-to-r from-emerald-600 to-teal-600 font-black">
                <RotateCcw className="mr-2 h-5 w-5" />
                {copy({ it: 'Nuova partita · stessi mazzi', en: 'New game · same decks' })}
              </Button>
              <Button variant="outline" onClick={prepareReselection} className="h-14 w-full font-bold">
                <Swords className="mr-2 h-5 w-5" />
                {copy({ it: 'Riseleziona giocatori e mazzi', en: 'Reselect players and decks' })}
              </Button>
              <Button variant="ghost" onClick={() => router.replace(`/table/${groupId}`)} className="w-full text-muted-foreground">
                {copy({ it: 'Torna all’Arena', en: 'Back to Arena' })}
              </Button>
            </div>
          </div>

          {confirmRematch && (
            <ModalOverlay>
              <ModalCard>
                <LiveGameModalTitle icon={RotateCcw} title={copy({ it: 'Confermi gli stessi mazzi?', en: 'Use the same decks?' })} onClose={() => setConfirmRematch(false)} />
                <div className="space-y-4 p-5">
                  <p className="text-sm text-muted-foreground">
                    {copy({
                      it: 'Posti e mazzi restano invariati. Giocatore iniziale e verso di gioco verranno sorteggiati di nuovo.',
                      en: 'Seats and decks stay the same. Starting player and play direction will be randomized again.',
                    })}
                  </p>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setConfirmRematch(false)} className="flex-1">{copy({ it: 'Annulla', en: 'Cancel' })}</Button>
                    <Button
                      disabled={starting}
                      onClick={() => {
                        setConfirmRematch(false);
                        void startGame(previousSetup);
                      }}
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 font-black"
                    >
                      {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {copy({ it: 'Conferma', en: 'Confirm' })}
                    </Button>
                  </div>
                </div>
              </ModalCard>
            </ModalOverlay>
          )}
        </div>
      );
    }
    const usedKeys = seats.map((seat) => seat.participantKey).filter(Boolean);
    const setupLayouts = getSquareTableLayouts(playerCount, 1000, 680, layoutVariant);
    const setupToolbarBand = getCenterToolbarBand(playerCount, 1000, 680, layoutVariant);
    const activeSetupSeat = seats[setupSeatIndex] ?? seats[0];
    const activeSetupParticipant = participants.find((entry) => entry.key === activeSetupSeat?.participantKey);
    const activeSetupDecks = activeSetupParticipant?.decks.filter((deck) => (
      featureFlags?.deckWizardSearch === false
        ? true
        : matchesLiveGameDeckSearch(deck, setupDeckSearch)
    )) ?? [];
    const setupComplete = seats.length === playerCount
      && seats.every((seat) => Boolean(seat.participantKey && seat.deckId));
    return (
      <div className="min-h-dvh bg-[radial-gradient(circle_at_top,#08100a_0%,#08080e_48%,#000_100%)] px-3 pb-10 pt-[max(1rem,env(safe-area-inset-top))] text-foreground sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-5 flex items-center gap-3">
            <Button variant="ghost" size="icon" aria-label={copy({ it: 'Torna al playgroup', en: 'Back to playgroup' })} onClick={() => router.push(`/table/${groupId}`)}><ArrowLeft /></Button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">Live tracker</p>
              <h1 className="truncate text-2xl font-black">{arenaName}</h1>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-2 text-xs text-muted-foreground">
              {online ? <CircleDot className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-amber-400" />}
              <span className="hidden sm:inline">{online ? 'Realtime' : copy({ it: 'Non in linea', en: 'Offline' })}</span>
              <span className="sr-only sm:hidden">{online ? 'Realtime' : copy({ it: 'Non in linea', en: 'Offline' })}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-emerald-500/25 bg-card/90 shadow-2xl shadow-emerald-950/30 backdrop-blur-xl">
            <div className="border-b border-border bg-gradient-to-r from-emerald-500/10 to-cyan-500/5 p-5 sm:p-7">
              <h2 className="text-xl font-black">{copy({ it: 'Configura la partita', en: 'Set up the game' })}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{copy({ it: 'Scegli layout, posti e mazzi. L’ultima configurazione viene ricordata.', en: 'Choose layout, seats and decks. Your last setup is remembered.' })}</p>
            </div>
            <div className="flex flex-col gap-7 p-4 sm:p-7">
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3].map((step) => (
                  <button
                    key={step}
                    type="button"
                    aria-label={`${copy({ it: 'Passaggio', en: 'Step' })} ${step + 1}`}
                    onClick={() => setSetupStep(step)}
                    className={cn('h-1.5 flex-1 rounded-full py-3 transition', step <= setupStep ? 'bg-emerald-400 bg-clip-content' : 'bg-white/10 bg-clip-content')}
                  />
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSeats((current) => current.map(() => ({ participantKey: null, deckId: null })));
                    setSetupDeckSearch('');
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />{copy({ it: 'Azzera', en: 'Reset' })}
                </Button>
              </div>

              <section className="min-h-[330px] animate-in fade-in slide-in-from-right-2">
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-black shadow-lg shadow-emerald-950/40">{setupStep + 1}</span>
                  <div>
                    <h3 className="text-lg font-black">
                      {[
                        copy({ it: 'Quanti giocatori?', en: 'How many players?' }),
                        copy({ it: 'Punti vita iniziali', en: 'Starting life' }),
                        copy({ it: 'Scegli il layout', en: 'Choose the layout' }),
                        copy({ it: 'Assegna i posti', en: 'Assign the seats' }),
                      ][setupStep]}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {[
                        copy({ it: 'Puoi giocare da 2 a 6 persone.', en: 'Play with 2 to 6 people.' }),
                        copy({ it: 'Il totale iniziale vale per tutti.', en: 'The starting total applies to everyone.' }),
                        copy({ it: 'L’anteprima rispecchia il tavolo di gioco.', en: 'The preview matches the game table.' }),
                        copy({ it: 'Tocca un posto e scegli giocatore e mazzo.', en: 'Tap a seat, then choose player and deck.' }),
                      ][setupStep]}
                    </p>
                  </div>
                </div>

                {setupStep === 0 ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-4">
                    {[2, 3, 4, 5, 6].map((count) => (
                      <button
                        key={count}
                        onClick={() => changePlayerCount(count)}
                        className={cn(
                          'group relative aspect-square rounded-3xl border text-2xl font-black transition hover:-translate-y-1 active:scale-95',
                          playerCount === count
                            ? 'border-emerald-300 bg-gradient-to-br from-emerald-500/40 to-teal-500/15 text-white shadow-xl shadow-emerald-950/40'
                            : 'border-white/10 bg-white/[.035] text-muted-foreground hover:border-emerald-400/50 hover:text-white',
                        )}
                      >
                        {count}
                        <UserRound className="mx-auto mt-2 h-5 w-5 opacity-55" />
                        {playerCount === count ? <Check className="absolute right-3 top-3 h-4 w-4 text-emerald-200" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}

                {setupStep === 1 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[20, 25, 30, 40, 60].map((life) => (
                      <button
                        key={life}
                        onClick={() => setStartingLife(life)}
                        className={cn(
                          'relative flex h-20 items-center justify-center rounded-3xl border text-2xl font-black transition hover:-translate-y-1 active:scale-95 sm:h-24',
                          startingLife === life
                            ? 'border-cyan-300 bg-gradient-to-br from-cyan-500/25 to-emerald-500/15 text-cyan-50 shadow-xl shadow-cyan-950/20'
                            : 'border-white/10 bg-white/[.035] text-muted-foreground hover:border-cyan-400/45 hover:text-white',
                        )}
                      >
                        <Heart className="mr-3 h-6 w-6 text-rose-300" />{life}
                        {startingLife === life ? <Check className="absolute right-4 top-4 h-4 w-4 text-cyan-200" /> : null}
                      </button>
                    ))}
                    <label className="flex h-20 items-center gap-3 rounded-3xl border border-white/10 bg-white/[.035] px-4 focus-within:border-cyan-400/60 sm:h-24 sm:px-5">
                      <Heart className="h-6 w-6 text-rose-300" />
                      <span className="sr-only">{copy({ it: 'Punti vita personalizzati', en: 'Custom starting life' })}</span>
                      <input
                        type="number"
                        min={1}
                        value={[20, 25, 30, 40, 60].includes(startingLife) ? '' : startingLife}
                        placeholder={copy({ it: 'Altro', en: 'Custom' })}
                        onChange={(event) => {
                          const value = Number.parseInt(event.target.value, 10);
                          if (Number.isFinite(value) && value > 0) setStartingLife(value);
                        }}
                        className="min-w-0 flex-1 bg-transparent text-xl font-black outline-none placeholder:text-muted-foreground"
                      />
                    </label>
                  </div>
                ) : null}

                {setupStep === 2 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(['classic', 'opposed'] as const).map((variant) => {
                      const title = variant === 'classic'
                        ? copy({ it: 'Intorno al tavolo', en: 'Around the table' })
                        : copy({ it: 'Lati contrapposti', en: 'Opposing sides' });
                      const description = variant === 'classic'
                        ? copy({ it: 'Posti distribuiti in modo uniforme.', en: 'Seats distributed evenly around the table.' })
                        : copy({ it: 'Posti raggruppati sui lati opposti.', en: 'Seats grouped on opposing sides.' });
                      return (
                        <button
                          key={variant}
                          onClick={() => setLayoutVariant(variant)}
                          aria-pressed={layoutVariant === variant}
                          className={cn(
                            'group relative rounded-3xl border p-3 text-left transition hover:-translate-y-1 active:scale-[.98] sm:p-4',
                            layoutVariant === variant
                              ? 'border-emerald-300 bg-emerald-500/15 shadow-xl shadow-emerald-950/30'
                              : 'border-white/10 bg-white/[.035] hover:border-emerald-400/45',
                          )}
                        >
                          <LayoutMiniature
                            playerCount={playerCount}
                            variant={variant}
                            tableLabel={copy({ it: 'centro', en: 'center' })}
                            seatLabel={copy({ it: 'Posto', en: 'Seat' })}
                          />
                          <div className="mt-4 flex items-start gap-3">
                            <span className={cn(
                              'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-black transition',
                              layoutVariant === variant
                                ? 'border-emerald-200 bg-emerald-400 text-emerald-950'
                                : 'border-white/15 bg-white/5 text-white/50 group-hover:border-emerald-300/50',
                            )}>
                              {layoutVariant === variant ? <Check className="h-4 w-4" /> : playerCount}
                            </span>
                            <span className="min-w-0">
                              <b className="block text-sm text-foreground sm:text-base">{title}</b>
                              <small className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</small>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {setupStep === 3 ? (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
                    <div className="relative aspect-[25/17] overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_center,#0a120c_0%,#08080d_68%)] shadow-inner">
                      <div className="pointer-events-none absolute inset-2 rounded-[1.15rem] border border-emerald-100/[.06]" />
                      {setupToolbarBand ? (
                        <span
                          className="absolute z-[1] grid place-items-center rounded-lg border border-dashed border-amber-200/20 bg-amber-950/20 text-[8px] font-black uppercase tracking-[.2em] text-amber-100/45"
                          style={{
                            left: `${setupToolbarBand.left / 10}%`,
                            top: `${setupToolbarBand.top / 6.8}%`,
                            width: `${setupToolbarBand.width / 10}%`,
                            height: `${setupToolbarBand.height / 6.8}%`,
                          }}
                        >
                          {copy({ it: 'centro tavolo', en: 'table center' })}
                        </span>
                      ) : null}
                      {setupLayouts.map((layout, index) => {
                        const seat = seats[index];
                        const participant = participants.find((entry) => entry.key === seat?.participantKey);
                        const deck = participant?.decks.find((entry) => entry.id === seat?.deckId);
                        return (
                          <button
                            key={index}
                            type="button"
                            onClick={() => { setSetupSeatIndex(index); setSetupDeckSearch(''); }}
                            aria-label={`${copy({ it: 'Posto', en: 'Seat' })} ${index + 1}${participant ? `: ${participant.displayName}` : ''}`}
                            aria-pressed={setupSeatIndex === index}
                            className={cn(
                              'group absolute overflow-hidden rounded-xl border p-1.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 active:scale-[.98] sm:p-2',
                              setupSeatIndex === index
                                ? 'z-10 border-emerald-200 bg-emerald-500/25 ring-4 ring-emerald-500/20'
                                : 'border-dashed border-emerald-300/35 bg-emerald-500/10 hover:border-emerald-300/70',
                            )}
                            style={{ left: `${layout.left / 10}%`, top: `${layout.top / 6.8}%`, width: `${layout.width / 10}%`, height: `${layout.height / 6.8}%` }}
                          >
                            {deck?.commanderImage ? <DeckImage src={deck.commanderImage} alt="" className="absolute inset-0 h-full w-full rounded-none object-cover opacity-30 transition group-hover:opacity-40" fallbackClassName="hidden" /> : null}
                            <span className="absolute left-1.5 top-1.5 z-[1] grid h-5 min-w-5 place-items-center rounded-md border border-emerald-100/25 bg-black/65 px-1 text-[9px] font-black text-emerald-100 sm:left-2 sm:top-2 sm:h-6 sm:min-w-6 sm:text-[10px]">
                              {index + 1}
                            </span>
                            <span className="relative flex h-full min-h-0 flex-col items-center justify-center px-1">
                              <UserRound className={cn('mb-1 h-4 w-4 text-emerald-200/70', participant && 'hidden')} />
                              <b className="block max-w-full truncate text-[10px] leading-tight text-white sm:text-sm">{participant?.displayName ?? copy({ it: 'Scegli', en: 'Choose' })}</b>
                              {deck ? <small className="mt-0.5 hidden max-w-full truncate text-[9px] text-white/70 sm:block">{deck.commander}</small> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                      <p className="mb-3 text-xs font-black uppercase tracking-[.18em] text-emerald-300">{copy({ it: 'Posto', en: 'Seat' })} {setupSeatIndex + 1}</p>
                      <select
                        data-testid="live-player-select"
                          aria-label={copy({ it: 'Scegli giocatore', en: 'Choose player' })}
                        value={activeSetupSeat?.participantKey ?? ''}
                        onChange={(event) => updateSeatParticipant(setupSeatIndex, (event.target.value || null) as ParticipantKey | null)}
                        className="h-12 w-full rounded-xl border border-input bg-card px-3 font-semibold outline-none focus:border-emerald-400"
                      >
                        <option value="">{copy({ it: 'Scegli giocatore', en: 'Choose player' })}</option>
                        {participants.map((entry) => (
                          <option key={entry.key} value={entry.key} disabled={usedKeys.includes(entry.key) && entry.key !== activeSetupSeat?.participantKey}>{entry.displayName}</option>
                        ))}
                      </select>
                      {activeSetupParticipant ? (
                        <div className="mt-3 space-y-3">
                          {featureFlags?.deckWizardSearch !== false ? (
                            <label className="relative block">
                              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                              <input
                                value={setupDeckSearch}
                                onChange={(event) => setSetupDeckSearch(event.target.value)}
                                placeholder={copy({ it: 'Cerca mazzo o comandante', en: 'Search deck or commander' })}
                                className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-sm outline-none focus:border-emerald-400"
                              />
                            </label>
                          ) : null}
                          <div className="flex gap-2 overflow-x-auto pb-2">
                          {activeSetupDecks.map((deck) => {
                            const selected = activeSetupSeat?.deckId === deck.id;
                            return (
                              <button
                                data-testid="live-deck-option"
                                key={deck.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setSeats((current) => current.map((item, index) => index === setupSeatIndex ? { ...item, deckId: deck.id } : item))}
                                className={cn('w-24 shrink-0 overflow-hidden rounded-xl border bg-card text-left transition active:scale-[.98]', selected ? 'border-emerald-300 ring-2 ring-emerald-500/25' : 'border-white/10')}
                              >
                                <DeckImage src={deck.commanderImage} alt={deck.commander} className="h-24 w-full rounded-none object-cover object-top" fallbackClassName="h-24 w-full rounded-none" />
                                <b className="line-clamp-2 p-2 text-[10px] leading-tight">{deck.commander}</b>
                              </button>
                            );
                          })}
                          {activeSetupDecks.length === 0 ? (
                            <p className="py-5 text-sm text-muted-foreground">{copy({ it: 'Nessun mazzo corrispondente.', en: 'No matching decks.' })}</p>
                          ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row">
                {setupStep > 0 ? <Button variant="outline" onClick={() => setSetupStep((step) => step - 1)} className="w-full sm:w-auto"><ArrowLeft className="mr-2 h-4 w-4" />{copy({ it: 'Indietro', en: 'Back' })}</Button> : <span className="hidden flex-1 sm:block" />}
                {setupStep < 3 ? (
                  <Button onClick={() => setSetupStep((step) => step + 1)} className="h-12 w-full bg-gradient-to-r from-emerald-600 to-teal-600 px-7 font-black shadow-lg shadow-emerald-950/40 sm:ml-auto sm:w-auto">
                    {copy({ it: 'Avanti', en: 'Next' })}<ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button data-testid="live-start" onClick={() => void startGame()} disabled={starting || !setupComplete} className="h-12 w-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 font-black shadow-lg shadow-emerald-950/40 sm:ml-auto sm:w-auto sm:px-8">
                    {starting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Swords className="mr-2 h-5 w-5" />}
                    {setupComplete ? copy({ it: 'Avvia partita', en: 'Start game' }) : copy({ it: 'Completa tutti i posti', en: 'Complete every seat' })}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const orientation = getViewportTableOrientation(tableSize.width, tableSize.height);
  const layouts = getSquareTableLayouts(record.state.players.length, tableSize.width, tableSize.height, record.state.layoutVariant ?? 'classic', orientation);
  const assignments = mapPlayersToSeats(record.state.players, layouts, null);
  const centerToolbarBand = getCenterToolbarBand(
    record.state.players.length,
    tableSize.width,
    tableSize.height,
    record.state.layoutVariant ?? 'classic',
    orientation,
  );
  const panelPlayer = record.state.players.find((player) => player.participantKey === damagePanelKey);
  const activePlayers = record.state.players.filter((player) => !player.isEliminated);
  const alternativeRequired = activePlayers.length !== 1;
  const endGameWarnings = getLiveGameResultWarnings(record.state, {
    winnerKey: isDraw ? null : winnerKey || null,
    isDraw,
    winCondition: isDraw ? null : winCondition,
  });
  const toolbarMainSize = centerToolbarBand?.axis === 'vertical'
    ? centerToolbarBand.height
    : centerToolbarBand?.width ?? 0;
  const toolbarCrossSize = centerToolbarBand?.axis === 'vertical'
    ? centerToolbarBand.width
    : centerToolbarBand?.height ?? 0;
  const toolbarControlSize = Math.max(30, Math.min(56, toolbarCrossSize - 12, (toolbarMainSize - 96) / 8));
  const toolbarButtonStyle = { width: toolbarControlSize, height: toolbarControlSize };
  const toolbarDurationStyle = centerToolbarBand?.axis === 'vertical'
    ? { width: toolbarControlSize, height: Math.min(80, toolbarControlSize * 1.5) }
    : { width: Math.min(88, toolbarControlSize * 1.65), height: toolbarControlSize };

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black text-white touch-none">
      <div ref={tableRef} className="absolute inset-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        {assignments.map(({ player, layout }) => {
          const rotation = orientation === 'landscape'
            ? getLandscapeSeatRotation(layout, tableSize.width)
            : getSeatRotation(layout.role, record.state.players.length, record.state.layoutVariant ?? 'classic');
          const sideways = Math.abs(rotation) === 90;
          const selected = highlight === player.participantKey;
          const isStarting = record.state.startingPlayerKey === player.participantKey;
          const contentWidth = sideways ? layout.height : layout.width;
          const contentHeight = sideways ? layout.width : layout.height;
          const shortestSide = Math.min(contentWidth, contentHeight);
          const controlSize = Math.max(36, Math.min(68, shortestSide * 0.16));
          const controlWidth = controlSize * 1.35;
          const controlInset = Math.max(8, Math.min(24, contentWidth * 0.055));
          const iconSize = Math.max(18, Math.min(31, controlSize * 0.48));
          const auxiliarySize = Math.max(32, Math.min(48, controlSize * 0.75));
          return (
            <section key={player.participantKey} data-player-key={player.participantKey} onPointerDown={(event) => beginDamageDrag(event, player.participantKey)} onClickCapture={(event) => { if (randomOpponentMode) { event.stopPropagation(); selectRandomOpponent(player.participantKey); } }} className={cn('absolute overflow-hidden rounded-[clamp(12px,2vw,28px)] border-2 bg-zinc-950 transition-all duration-200', selected ? 'z-20 border-amber-300 shadow-[0_0_45px_rgba(251,191,36,.9)] brightness-125' : 'border-black/80', drag?.targetKey === player.participantKey && 'border-rose-400 shadow-[0_0_35px_rgba(244,63,94,.8)]', player.isEliminated && 'grayscale brightness-50')} style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}>
              <DeckImage src={player.commanderImage} alt={player.commander} className="absolute inset-0 h-full w-full rounded-none object-cover opacity-75" fallbackClassName="absolute inset-0 h-full w-full rounded-none" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/5 to-black/50" />
              <div className="absolute left-1/2 top-1/2" style={{ width: contentWidth, height: contentHeight, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}>
                <HoldActionButton variant="ghost" stopPropagation onShort={() => enqueue({ type: 'adjust', targetKey: player.participantKey, amount: 1, mode: 'life' }, { type: 'adjust', targetKey: player.participantKey, amount: -1, mode: 'life' })} onLong={() => enqueue({ type: 'adjust', targetKey: player.participantKey, amount: 10, mode: 'life' }, { type: 'adjust', targetKey: player.participantKey, amount: -10, mode: 'life' })} className="absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 font-light shadow-lg backdrop-blur transition active:scale-90" style={{ left: controlInset, width: controlWidth, height: controlSize }} aria-label={`${copy({ it: 'Riduci punti vita di', en: 'Reduce life for' })} ${player.displayName}`}><Minus style={{ width: iconSize, height: iconSize }} /></HoldActionButton>
                <HoldActionButton variant="ghost" stopPropagation onShort={() => enqueue({ type: 'adjust', targetKey: player.participantKey, amount: -1, mode: 'life' }, { type: 'adjust', targetKey: player.participantKey, amount: 1, mode: 'life' })} onLong={() => enqueue({ type: 'adjust', targetKey: player.participantKey, amount: -10, mode: 'life' }, { type: 'adjust', targetKey: player.participantKey, amount: 10, mode: 'life' })} className="absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 font-light shadow-lg backdrop-blur transition active:scale-90" style={{ right: controlInset, width: controlWidth, height: controlSize }} aria-label={`${copy({ it: 'Aumenta punti vita di', en: 'Increase life for' })} ${player.displayName}`}><Plus style={{ width: iconSize, height: iconSize }} /></HoldActionButton>
                <div className="pointer-events-none absolute left-1/2 top-[7%] z-10 max-w-[66%] -translate-x-1/2 truncate rounded-full border border-white/15 bg-gradient-to-r from-black/75 via-zinc-900/80 to-black/75 px-[clamp(10px,3%,20px)] py-[clamp(4px,1.5%,9px)] font-black tracking-wide text-white shadow-xl backdrop-blur-md" style={{ fontSize: `clamp(11px, ${shortestSide * 0.052}px, 22px)` }}>{player.displayName}</div>
                {(player.counters.monarch || player.counters.initiative || player.counters.energy > 0 || player.counters.experience > 0 || player.counters.commanderTax > 0) ? (
                  <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex max-w-24 flex-wrap-reverse justify-end gap-1.5" aria-label={[
                    player.counters.monarch ? copy({ it: 'Monarca', en: 'Monarch' }) : '',
                    player.counters.initiative ? copy({ it: 'Iniziativa', en: 'Initiative' }) : '',
                    player.counters.energy > 0 ? `${copy({ it: 'Energia', en: 'Energy' })} ${player.counters.energy}` : '',
                    player.counters.experience > 0 ? `${copy({ it: 'Esperienza', en: 'Experience' })} ${player.counters.experience}` : '',
                    player.counters.commanderTax > 0 ? `Commander Tax ${player.counters.commanderTax}` : '',
                  ].filter(Boolean).join(', ')}>
                    {player.counters.monarch ? <span title={copy({ it: 'Monarca', en: 'Monarch' })} className="grid h-9 w-9 place-items-center rounded-full border border-amber-200/70 bg-amber-950/90 text-amber-100 shadow-lg backdrop-blur"><Crown className="h-5 w-5" /></span> : null}
                    {player.counters.initiative ? <span title={copy({ it: 'Iniziativa', en: 'Initiative' })} className="grid h-9 w-9 place-items-center rounded-full border border-cyan-200/65 bg-cyan-950/90 text-cyan-100 shadow-lg backdrop-blur"><Swords className="h-5 w-5" /></span> : null}
                    {player.counters.energy > 0 ? <span title={copy({ it: 'Energia', en: 'Energy' })} className="grid h-9 min-w-9 place-items-center rounded-full border border-yellow-200/60 bg-yellow-950/90 px-2 text-xs font-black text-yellow-100">E {player.counters.energy}</span> : null}
                    {player.counters.experience > 0 ? <span title={copy({ it: 'Esperienza', en: 'Experience' })} className="grid h-9 min-w-9 place-items-center rounded-full border border-violet-200/60 bg-violet-950/90 px-2 text-xs font-black text-violet-100">XP {player.counters.experience}</span> : null}
                    {player.counters.commanderTax > 0 ? <span title="Commander Tax" className="grid h-9 min-w-9 place-items-center rounded-full border border-slate-200/60 bg-slate-950/90 px-2 text-xs font-black text-slate-100">T {player.counters.commanderTax}</span> : null}
                  </div>
                ) : null}
                <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                  <LifeReadout life={player.life} className="font-black leading-none drop-shadow-[0_3px_4px_rgba(0,0,0,.9)]" style={{ fontSize: `clamp(54px, ${shortestSide * 0.28}px, 112px)` }} />
                </div>
                <button
                  onClick={(event) => { event.stopPropagation(); setDamagePanelKey(player.participantKey); }}
                  className="absolute left-1/2 top-3/4 z-10 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-emerald-200/30 bg-black/65 text-emerald-100 shadow-lg backdrop-blur transition active:scale-90"
                  style={{ width: controlSize, height: controlSize }}
                  aria-label={`${player.displayName} damage details`}
                >
                  <Shield style={{ width: iconSize, height: iconSize }} />
                </button>
                {player.isEliminated && <button onClick={(event) => { event.stopPropagation(); enqueue({ type: 'revive', targetKey: player.participantKey, startingLife: record.starting_life }, { type: 'restore-player', player }); }} className="absolute left-3 top-3 z-20 rounded-full bg-emerald-600 px-3 font-black" style={{ height: auxiliarySize, fontSize: Math.max(10, auxiliarySize * 0.27) }}><RotateCcw className="mr-1 inline" style={{ width: auxiliarySize * 0.38, height: auxiliarySize * 0.38 }} />Revive</button>}
                {!player.isEliminated && <button aria-label={`${copy({ it: 'Elimina giocatore', en: 'Eliminate player' })} ${player.displayName}`} onClick={(event) => { event.stopPropagation(); setConfirmEliminate(player.participantKey); }} className="absolute left-3 top-3 z-20 grid place-items-center rounded-full border border-white/20 bg-black/55 text-white/75" style={{ width: auxiliarySize, height: auxiliarySize }}><Skull style={{ width: auxiliarySize * 0.4, height: auxiliarySize * 0.4 }} /></button>}
                {isStarting && (() => {
                  const clockwise = record.state.startingDirection === 'clockwise';
                  const DirectionIcon = clockwise ? RotateCw : RotateCcw;
                  const label = clockwise
                    ? copy({ it: 'Primo giocatore · senso orario', en: 'Starting player · clockwise' })
                    : copy({ it: 'Primo giocatore · senso antiorario', en: 'Starting player · counterclockwise' });
                  return <div role="img" aria-label={label} title={label} className="absolute bottom-3 left-3 grid h-9 w-9 place-items-center rounded-full border border-amber-300/60 bg-amber-950/90 text-amber-100 shadow-lg"><DirectionIcon className="h-7 w-7" /><span className="absolute text-[11px] font-black">1</span></div>;
                })()}
              </div>
            </section>
          );
        })}

        {centerToolbarBand && <div
          className={cn(
            'absolute z-30 flex items-center justify-center',
            centerToolbarBand.axis === 'vertical' ? 'flex-col' : 'flex-row',
          )}
          style={{
            left: centerToolbarBand.left,
            top: centerToolbarBand.top,
            width: centerToolbarBand.width,
            height: centerToolbarBand.height,
          }}
        >
        <div className={cn('flex h-full w-full items-center justify-between border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-xl', centerToolbarBand.axis === 'vertical' ? 'flex-col' : 'flex-row')}>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full" style={toolbarButtonStyle} onClick={() => setExitChoiceOpen(true)} title="Back"><ArrowLeft /></Button>
          <div className={cn('flex shrink-0 items-center justify-center gap-1 rounded-full bg-zinc-900 px-1.5 text-xs font-bold text-zinc-300', centerToolbarBand.axis === 'vertical' && 'flex-col px-1')} style={toolbarDurationStyle}><Clock3 className="h-4 w-4 shrink-0" />{duration}</div>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full" style={toolbarButtonStyle} onClick={undoLastMutation} disabled={!undoDepth} title="Undo"><RotateCcw /></Button>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full" style={toolbarButtonStyle} onClick={redoLastMutation} disabled={!redoDepth} title="Redo"><Redo2 /></Button>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full" style={toolbarButtonStyle} onClick={() => runRoulette(activePlayers.map((player) => player.participantKey))} title="Random player"><Dices /></Button>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full" style={toolbarButtonStyle} onClick={() => { setRandomizerResult(null); setRandomizerOpen(true); }} title="Dado o moneta"><Box /></Button>
          <Button variant={randomOpponentMode ? 'default' : 'ghost'} size="icon" className="shrink-0 rounded-full" style={toolbarButtonStyle} onClick={() => setRandomOpponentMode((value) => !value)} title="Random opponent">
            <span className="relative block h-5 w-5">
              <UserRound className="absolute left-0 top-0 h-[18px] w-[18px]" />
              <Dices className="absolute -bottom-1 -right-1 h-3 w-3 text-emerald-300" />
            </span>
          </Button>
          <Button data-testid="live-end" variant="ghost" size="icon" className="shrink-0 rounded-full" style={toolbarButtonStyle} onClick={openEnd} title="End game"><Flag /></Button>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full"
            style={toolbarButtonStyle}
            onClick={enterTrackerLandscape}
            title={copy({ it: 'Blocca in orizzontale', en: 'Lock landscape' })}
            aria-label={copy({ it: 'Blocca in orizzontale', en: 'Lock landscape' })}
          >
            <Maximize2 className={fullscreen ? 'text-emerald-300' : undefined} />
          </Button>
        </div>
        </div>}
        {syncBadgeVisible ? <button
          type="button"
          onClick={() => void flush()}
          className={cn(
            'absolute right-2 top-[calc(env(safe-area-inset-top)+.5rem)] z-40 flex items-center gap-1.5 rounded-full border bg-black/75 px-2.5 py-1 text-[10px] font-bold backdrop-blur',
            syncError && pendingSyncCount > 0 ? 'border-rose-400/50 text-rose-200' : online ? 'border-emerald-400/30 text-emerald-200' : 'border-amber-400/40 text-amber-200',
          )}
          title={pendingSyncCount > 0 ? syncError ?? undefined : undefined}
        >
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : online ? <CircleDot className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {syncError && pendingSyncCount > 0 ? copy({ it: 'Riprova sync', en: 'Retry sync' }) : syncing ? copy({ it: 'Sincronizzo', en: 'Syncing' }) : pendingSyncCount ? `${pendingSyncCount} ${copy({ it: 'in attesa', en: 'pending' })}` : online ? copy({ it: 'Sincronizzato', en: 'Synced' }) : 'Offline'}
        </button> : null}
        {randomOpponentMode && <div className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+1rem)] z-40 mx-auto max-w-md rounded-2xl border border-emerald-400/40 bg-emerald-950/95 px-4 py-3 text-center text-sm font-bold shadow-2xl backdrop-blur">{copy({ it: 'Tocca qualsiasi punto della card del giocatore attivo da escludere.', en: 'Tap anywhere on the active player card to exclude them.' })}</div>}
        {recoveredJournal ? <div className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+3.25rem)] z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/35 bg-zinc-950/95 px-3 py-2 text-xs text-amber-100 shadow-xl"><span>{copy({ it: 'Partita recuperata dal dispositivo', en: 'Game recovered from this device' })}</span>{pendingSyncCount > 0 ? <button type="button" onClick={() => void flush()} className="font-black text-emerald-300">{copy({ it: 'Sincronizza', en: 'Sync' })}</button> : null}<button type="button" aria-label="Close" onClick={() => setRecoveredJournal(false)}><X className="h-3.5 w-3.5" /></button></div> : null}
        {liveOnboardingOpen ? <div role="dialog" aria-label={copy({ it: 'Guida rapida live', en: 'Live quick guide' })} className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(92vw,390px)] -translate-x-1/2 rounded-2xl border border-emerald-400/35 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><div className="min-w-0 flex-1"><p className="font-black text-emerald-100">{copy({ it: 'Tre gesti utili', en: 'Three useful gestures' })}</p><ul className="mt-2 space-y-1 text-xs text-zinc-300"><li>{copy({ it: 'Tieni premuto +/− per modificare di 10.', en: 'Hold +/− to change by 10.' })}</li><li>{copy({ it: 'Trascina da un giocatore a un altro per assegnare danno.', en: 'Drag between players to assign damage.' })}</li><li>{copy({ it: 'La bandierina conclude e salva la partita.', en: 'The flag ends and saves the game.' })}</li></ul></div><button type="button" aria-label={copy({ it: 'Chiudi guida', en: 'Close guide' })} onClick={() => { localStorage.setItem('live-onboarding-v1', 'done'); setLiveOnboardingOpen(false); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5"><X className="h-4 w-4" /></button></div></div> : null}
      </div>

      {drag && <svg className="pointer-events-none fixed inset-0 z-50 h-full w-full"><defs><marker id="damage-arrow" markerWidth="14" markerHeight="14" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#fb7185" /></marker><filter id="damage-glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs><path d={`M ${drag.startX} ${drag.startY} Q ${(drag.startX + drag.x) / 2} ${Math.min(drag.startY, drag.y) - 90} ${drag.x} ${drag.y}`} fill="none" stroke="#fb7185" strokeWidth="7" strokeLinecap="round" markerEnd="url(#damage-arrow)" filter="url(#damage-glow)" strokeDasharray="12 8"><animate attributeName="stroke-dashoffset" from="40" to="0" dur=".7s" repeatCount="indefinite" /></path></svg>}

      {randomizerOpen && <ModalOverlay><ModalCard><div className="space-y-5 p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">{copy({ it: 'Dado o moneta', en: 'Die or coin' })}</h2><button onClick={() => setRandomizerOpen(false)} aria-label="Close"><X /></button></div><div className="grid grid-cols-4 gap-2">{([
        ['coin', copy({ it: 'Moneta', en: 'Coin' })],
        ['d4', 'd4'],
        ['d6', 'd6'],
        ['d20', 'd20'],
      ] as Array<[TableRandomKind, string]>).map(([kind, label]) => <button key={kind} onClick={() => setRandomizerResult(rollTableRandom(kind))} className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 font-black transition active:scale-95">{label}</button>)}</div>{randomizerResult !== null ? <div className="rounded-3xl border border-emerald-400/20 bg-black/30 p-8 text-center text-7xl font-black text-emerald-200">{randomizerResult === 'heads' ? copy({ it: 'Testa', en: 'Heads' }) : randomizerResult === 'tails' ? copy({ it: 'Croce', en: 'Tails' }) : randomizerResult}</div> : null}</div></ModalCard></ModalOverlay>}

      {damageDraft && (() => {
        const source = record.state.players.find((player) => player.participantKey === damageDraft.sourceKey);
        const target = record.state.players.find((player) => player.participantKey === damageDraft.targetKey);
        const sourceAssignment = assignments.find(({ player }) => player.participantKey === damageDraft.sourceKey);
        const sourceRotation = sourceAssignment
          ? orientation === 'landscape'
            ? getLandscapeSeatRotation(sourceAssignment.layout, tableSize.width)
            : getSeatRotation(
              sourceAssignment.layout.role,
              record.state.players.length,
              record.state.layoutVariant ?? 'classic',
            )
          : 0;
        const amount = Math.max(0, Math.min(999, Number(damageAmount) || 0));
        const targetCount = damageDraft.scope === 'all_players'
          ? record.state.players.filter((player) => !player.isEliminated).length
          : damageDraft.scope === 'opponents'
            ? record.state.players.filter((player) => !player.isEliminated && player.participantKey !== damageDraft.sourceKey).length
            : 1;
        const scopeLabel = damageDraft.scope === 'opponents'
          ? copy({ it: 'ogni avversario', en: 'each opponent' })
          : damageDraft.scope === 'all_players'
            ? copy({ it: 'tutti i giocatori', en: 'all players' })
            : target?.displayName || '';
        const modeLabel = damageDraft.mode === 'life'
          ? copy({ it: 'danno', en: 'damage' })
          : damageDraft.mode === 'commander' ? copy({ it: 'danno commander', en: 'commander damage' }) : 'infect';
        return <ModalOverlay className="bg-black/90"><ModalCard size="lg" className="relative overflow-hidden border-rose-400/25 bg-zinc-950">
          {target?.commanderImage ? <DeckImage src={target.commanderImage} alt={target.commander} className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top opacity-20" /> : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/95 via-rose-950/65 to-zinc-950/95" />
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <LiveGameModalTitle icon={Swords} title={copy({ it: 'Assegna danno', en: 'Assign damage' })} onClose={() => setDamageDraft(null)} />
          <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
          <p className="truncate text-center text-xs font-bold uppercase tracking-[0.18em] text-zinc-300">{source?.displayName} <span className="px-2 text-rose-300">→</span> {target?.displayName}</p>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/35 p-1">{(['life', 'commander', 'infect'] as DamageMode[]).map((mode) => <button key={mode} onClick={() => setDamageDraft({ ...damageDraft, mode, scope: mode === 'commander' ? 'single' : damageDraft.scope })} className={cn('min-h-11 rounded-xl px-2 text-xs font-black uppercase tracking-wide transition', damageDraft.mode === mode ? 'bg-emerald-500 text-white shadow-lg' : 'text-zinc-400 hover:bg-white/5')}>{mode === 'life' ? copy({ it: 'Normale', en: 'Normal' }) : mode === 'commander' ? 'Commander' : 'Infect'}</button>)}</div>
          {damageDraft.mode !== 'commander' ? <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/25 p-1">{([
            ['single', copy({ it: 'Questo giocatore', en: 'This player' })],
            ['opponents', copy({ it: 'Ogni avversario', en: 'Each opponent' })],
            ['all_players', copy({ it: 'Tutti', en: 'Everyone' })],
          ] as const).map(([scope, label]) => <button key={scope} onClick={() => setDamageDraft({ ...damageDraft, scope, drain: scope === 'all_players' ? false : damageDraft.drain })} className={cn('min-h-11 rounded-xl px-2 py-2 text-[11px] font-bold transition', damageDraft.scope === scope ? 'bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/70' : 'text-zinc-400 hover:bg-white/5')}>{label}</button>)}</div> : null}
          {damageDraft.mode !== 'infect' ? <button type="button" onClick={() => setDamageDraft({ ...damageDraft, drain: !damageDraft.drain, scope: !damageDraft.drain && damageDraft.scope === 'all_players' ? 'opponents' : damageDraft.scope })} className={cn('flex min-h-11 w-full items-center gap-3 rounded-2xl border px-4 text-left transition', damageDraft.drain ? 'border-teal-400/60 bg-teal-500/20 text-teal-100' : 'border-white/10 bg-black/25 text-zinc-400')}><Heart className="h-5 w-5" /><span className="flex-1"><b className="block text-sm">{damageDraft.mode === 'commander' ? 'Lifelink' : copy({ it: 'Drain', en: 'Drain' })}</b><small>{damageDraft.mode === 'commander' ? copy({ it: 'Guadagni vite pari al danno commander inflitto.', en: 'Gain life equal to the commander damage dealt.' }) : copy({ it: 'Guadagni vite pari al danno alle vite inflitto.', en: 'Gain life equal to the life damage dealt.' })}</small></span>{damageDraft.drain ? <Check className="h-5 w-5" /> : null}</button> : null}
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl border border-rose-400/30 bg-black/35">
            <div
              className="absolute inset-0 flex items-center justify-between px-5 sm:px-8"
              style={{ transform: `rotate(${sourceRotation}deg)` }}
            >
              <button type="button" onClick={() => setDamageAmount(String(Math.max(0, amount - 1)))} className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-white/25 bg-black/40 text-3xl font-light transition active:scale-90" aria-label={copy({ it: 'Riduci danno', en: 'Reduce damage' })}>−</button>
              <div className="min-w-0 flex-1 text-center"><input aria-label={copy({ it: 'Quantità danno', en: 'Damage amount' })} value={damageAmount} onChange={(event) => setDamageAmount(event.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" className="h-24 w-full bg-transparent text-center text-7xl font-black leading-none tabular-nums text-white outline-none" /><p className="truncate text-sm font-black uppercase tracking-wide text-zinc-100">{modeLabel} · {scopeLabel}</p></div>
              <button type="button" onClick={() => setDamageAmount(String(Math.min(999, amount + 1)))} className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-white/25 bg-black/40 text-3xl font-light transition active:scale-90" aria-label={copy({ it: 'Aumenta danno', en: 'Increase damage' })}>+</button>
            </div>
          </div>
          <div className="grid grid-cols-6 gap-2">{[1, 2, 3, 5, 10, 15].map((quickAmount) => <button key={quickAmount} onClick={() => setDamageAmount(String(quickAmount))} className={cn('h-10 rounded-xl border text-sm font-black transition', damageAmount === String(quickAmount) ? 'border-rose-400 bg-rose-500/25 text-white' : 'border-white/10 bg-black/25 text-zinc-400')}>+{quickAmount}</button>)}</div>
          <div className="grid grid-cols-2 gap-3 pt-1"><Button variant="outline" onClick={() => setDamageDraft(null)} className="h-12 border-white/20 bg-black/20 font-black">{copy({ it: 'Annulla', en: 'Cancel' })}</Button><Button onClick={applyDamageDraft} disabled={amount === 0} className="h-12 bg-gradient-to-r from-rose-600 to-orange-600 font-black disabled:opacity-40">{damageDraft.scope === 'single' ? copy({ it: 'Risolvi', en: 'Resolve' }) : `${copy({ it: 'Risolvi', en: 'Resolve' })} ${amount} × ${targetCount}`}</Button></div>
        </div></div></ModalCard></ModalOverlay>;
      })()}

      {panelPlayer && (
        <ModalOverlay>
          <ModalCard size="lg">
            <LiveGameModalTitle
              icon={Shield}
              title={`${panelPlayer.displayName} · ${copy({ it: 'Dettaglio danni', en: 'Damage details' })}`}
              onClose={() => setDamagePanelKey(null)}
            />
            <div className="space-y-3 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['monarch', copy({ it: 'Monarca', en: 'Monarch' }), Crown],
                  ['initiative', copy({ it: 'Iniziativa', en: 'Initiative' }), Swords],
                ] as const).map(([emblem, label, Icon]) => <button
                  key={emblem}
                  onClick={() => {
                    const holderKey = record.state.players.find((entry) => entry.counters[emblem])?.participantKey ?? null;
                    enqueue(
                      { type: 'set_emblem', targetKey: panelPlayer.participantKey, emblem, active: !panelPlayer.counters[emblem] },
                      { type: 'restore_emblem', emblem, holderKey },
                    );
                  }}
                  className={cn('rounded-2xl border p-4 text-left transition', panelPlayer.counters[emblem] ? 'border-amber-300/70 bg-amber-500/20 text-amber-100' : 'border-border bg-background/60')}
                ><Icon className="mb-3 h-5 w-5" /><b>{label}</b></button>)}
              </div>
              {([
                ['energy', copy({ it: 'Energia', en: 'Energy' }), Sparkles],
                ['experience', copy({ it: 'Esperienza', en: 'Experience' }), Trophy],
                ['commanderTax', 'Commander Tax', Shield],
              ] as const).map(([counter, label, Icon]) => <div key={counter} className="flex items-center gap-3 rounded-2xl border border-border bg-background/60 p-3"><Icon className="h-5 w-5 text-emerald-300" /><b className="flex-1">{label}</b><Button variant="outline" size="icon" onClick={() => enqueue({ type: 'adjust_counter', targetKey: panelPlayer.participantKey, counter, amount: -1 }, { type: 'adjust_counter', targetKey: panelPlayer.participantKey, counter, amount: 1 })}><Minus /></Button><strong className="w-8 text-center text-xl">{panelPlayer.counters[counter]}</strong><Button variant="outline" size="icon" onClick={() => enqueue({ type: 'adjust_counter', targetKey: panelPlayer.participantKey, counter, amount: 1 }, { type: 'adjust_counter', targetKey: panelPlayer.participantKey, counter, amount: -1 })}><Plus /></Button></div>)}
              <div className="flex items-center justify-between rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-3">
                <div>
                  <p className="font-black text-emerald-100">Infect</p>
                  <p className="text-xs text-muted-foreground">{panelPlayer.infect} / 10</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => enqueue(
                      { type: 'adjust', targetKey: panelPlayer.participantKey, amount: -1, mode: 'infect' },
                      { type: 'adjust', targetKey: panelPlayer.participantKey, amount: 1, mode: 'infect' },
                    )}
                  >
                    <Minus />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => enqueue(
                      { type: 'adjust', targetKey: panelPlayer.participantKey, amount: 1, mode: 'infect' },
                      { type: 'adjust', targetKey: panelPlayer.participantKey, amount: -1, mode: 'infect' },
                    )}
                  >
                    <Plus />
                  </Button>
                </div>
              </div>
              {Object.entries(panelPlayer.commanderDamageFrom).map(([sourceKey, amount]) => {
                const source = record.state.players.find((entry) => entry.participantKey === sourceKey)!;
                const adjustment = {
                  targetKey: panelPlayer.participantKey,
                  sourceKey: source.participantKey,
                  mode: 'commander' as const,
                };
                return (
                  <div key={sourceKey} className="flex items-center gap-3 rounded-2xl border border-border bg-background/60 p-3">
                    <DeckImage src={source.commanderImage} alt={source.commander} className="h-14 w-11 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black">{source.displayName}</p>
                      <p className="text-xs text-muted-foreground">{source.commander}</p>
                    </div>
                    <b className="text-2xl">{amount}</b>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => enqueue(
                          { type: 'adjust', ...adjustment, amount: -1 },
                          { type: 'adjust', ...adjustment, amount: 1 },
                        )}
                      >
                        <Minus />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => enqueue(
                          { type: 'adjust', ...adjustment, amount: 1 },
                          { type: 'adjust', ...adjustment, amount: -1 },
                        )}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ModalCard>
        </ModalOverlay>
      )}

      {endOpen && <ModalOverlay onClose={() => setEndOpen(false)}><ModalCard size="lg"><LiveGameModalTitle icon={Trophy} title={copy({ it: 'Concludi partita', en: 'End game' })} onClose={() => setEndOpen(false)} /><div className="space-y-5 overflow-y-auto p-5"><div className="flex items-center justify-between rounded-2xl border border-border bg-background/60 p-3"><span className="font-bold">{copy({ it: 'Pareggio', en: 'Draw' })}</span><button onClick={() => { setIsDraw((value) => !value); setWinnerKey(''); setWinCondition(null); }} className={cn('h-7 w-12 rounded-full p-1 transition', isDraw ? 'bg-emerald-600' : 'bg-zinc-700')}><span className={cn('block h-5 w-5 rounded-full bg-white transition', isDraw && 'translate-x-5')} /></button></div>{!isDraw && <><div className="grid gap-2 sm:grid-cols-2">{activePlayers.map((player) => <button data-testid="live-winner" key={player.participantKey} onClick={() => { setWinnerKey(player.participantKey); setWinCondition(activePlayers.length === 1 ? 'last_standing' : null); }} className={cn('flex items-center gap-3 rounded-2xl border p-3 text-left transition', winnerKey === player.participantKey ? 'border-emerald-400 bg-emerald-500/20' : 'border-border bg-background/60')}><DeckImage src={player.commanderImage} alt={player.commander} className="h-12 w-10 rounded-lg object-cover" /><span className="min-w-0 flex-1"><b className="block truncate">{player.displayName}</b><small className="block truncate text-muted-foreground">{player.commander}</small></span>{winnerKey === player.participantKey && <Check className="text-emerald-300" />}</button>)}</div>{winnerKey && (alternativeRequired ? <div className="grid grid-cols-2 gap-2">{WIN_CONDITIONS.filter((condition) => condition.value !== 'last_standing' || featureFlags?.lastStanding !== false).map((condition) => { const Icon = condition.icon; return <button data-testid={`live-win-${condition.value}`} key={condition.value} onClick={() => setWinCondition(condition.value)} className={cn('rounded-2xl border p-4 text-left', winCondition === condition.value ? 'border-emerald-400 bg-emerald-500/20' : 'border-border bg-background/60')}><Icon className="mb-2 h-5 w-5 text-emerald-300" /><b className="text-sm">{copy(condition.label)}</b></button>; })}</div> : <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/25 p-4 font-bold text-emerald-200"><Shield /><span className="flex-1">{copy({ it: 'Ultimo giocatore rimasto', en: 'Last player standing' })}</span><Check /></div>)}</>}{endGameWarnings.length > 0 ? <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 p-3 text-sm text-amber-200">{copy({ it: 'Verifica il risultato: il vincitore ha un valore letale/risulta eliminato oppure è rimasto un solo giocatore nel pareggio.', en: 'Verify the result: the winner has a lethal total/is eliminated, or only one player remains in a draw.' })}</div> : null}<div className="flex gap-3"><Button variant="outline" onClick={() => setEndOpen(false)} className="flex-1">{copy({ it: 'Annulla', en: 'Cancel' })}</Button><Button data-testid="live-save" onClick={finishGame} disabled={ending || (!isDraw && (!winnerKey || !winCondition))} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 font-black">{ending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{copy({ it: 'Salva partita', en: 'Save game' })}</Button></div></div></ModalCard></ModalOverlay>}

      {confirmEliminate && <ModalOverlay><ModalCard><LiveGameModalTitle icon={Skull} title={copy({ it: 'Eliminare il giocatore?', en: 'Eliminate player?' })} onClose={() => setConfirmEliminate(null)} /><div className="space-y-4 p-5"><p className="text-muted-foreground">{record.state.players.find((player) => player.participantKey === confirmEliminate)?.displayName}</p><div className="flex gap-3"><Button variant="outline" onClick={() => setConfirmEliminate(null)} className="flex-1">{copy({ it: 'Annulla', en: 'Cancel' })}</Button><Button variant="destructive" onClick={() => { const player = record.state.players.find((entry) => entry.participantKey === confirmEliminate); enqueue({ type: 'eliminate', targetKey: confirmEliminate, eliminatedAt: new Date().toISOString() }, player ? { type: 'restore-player', player } : undefined); setConfirmEliminate(null); }} className="flex-1">{copy({ it: 'Elimina', en: 'Eliminate' })}</Button></div></div></ModalCard></ModalOverlay>}

      {exitChoiceOpen && <ModalOverlay><ModalCard><LiveGameModalTitle icon={null} title={copy({ it: 'Uscire dal tracker?', en: 'Leave the tracker?' })} onClose={() => setExitChoiceOpen(false)} /><div className="space-y-3 p-5"><p className="pb-1 text-sm text-muted-foreground">{copy({ it: 'La partita resta al sicuro finché non scegli di annullarla.', en: 'Your game stays safe unless you explicitly cancel it.' })}</p><button onClick={() => router.push(`/table/${groupId}`)} className="flex w-full items-center gap-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-3 text-left transition hover:bg-emerald-500/15 active:scale-[.99]"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-200"><Pause className="h-5 w-5" /></span><span className="min-w-0 flex-1"><b className="block">{copy({ it: 'Pausa partita', en: 'Pause game' })}</b><small className="text-muted-foreground">{copy({ it: 'Torna all’arena e riprendi quando vuoi.', en: 'Return to the arena and resume whenever you want.' })}</small></span><ChevronRight className="h-5 w-5 text-muted-foreground" /></button><button onClick={() => { setExitChoiceOpen(false); setConfirmCancel(true); }} className="flex w-full items-center gap-3 rounded-2xl border border-red-400/30 bg-red-950/20 p-3 text-left transition hover:bg-red-950/30 active:scale-[.99]"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-950/50 text-red-300"><Trash2 className="h-5 w-5" /></span><span className="min-w-0 flex-1"><b className="block text-red-200">{copy({ it: 'Annulla partita', en: 'Cancel game' })}</b><small className="text-muted-foreground">{copy({ it: 'Elimina la sessione senza salvare un risultato.', en: 'Discard the session without saving a result.' })}</small></span><ChevronRight className="h-5 w-5 text-red-300/70" /></button></div></ModalCard></ModalOverlay>}

      {confirmCancel && <ModalOverlay><ModalCard><LiveGameModalTitle icon={Flag} title={copy({ it: 'Annullare la partita?', en: 'Cancel this game?' })} onClose={() => setConfirmCancel(false)} /><div className="space-y-4 p-5"><p className="text-sm text-muted-foreground">{copy({ it: 'La partita live verrà eliminata senza creare un record.', en: 'The live game will be discarded without creating a record.' })}</p><div className="flex gap-3"><Button variant="outline" onClick={() => setConfirmCancel(false)} className="flex-1">{copy({ it: 'Continua a giocare', en: 'Keep playing' })}</Button><Button variant="destructive" onClick={cancelGame} className="flex-1">{copy({ it: 'Annulla partita', en: 'Cancel game' })}</Button></div></div></ModalCard></ModalOverlay>}
    </div>
  );
}
