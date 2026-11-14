import type { ParticipantKey } from '@/lib/participant-keys';
import type { TableLayoutVariant } from '@/lib/live-game-table-layout';

export const LIVE_GAME_MIN_PLAYERS = 2;
export const LIVE_GAME_MAX_PLAYERS = 6;
export const COMMANDER_DAMAGE_LIMIT = 21;
export const INFECT_LOSS_THRESHOLD = 10;
export const LIVE_GAME_HIGHLIGHT_LIMIT = 24;

export type LiveGameStatus = 'setup' | 'active' | 'ended' | 'cancelled';
export type DamageMode = 'life' | 'commander' | 'infect';
export type GroupDamageScope = 'opponents' | 'all_players';
export type PlayDirection = 'clockwise' | 'counterclockwise';
export type PlayerCounter = 'energy' | 'experience' | 'commanderTax';
export type PlayerEmblem = 'monarch' | 'initiative';
export interface LiveGamePlayerCounters {
  energy: number;
  experience: number;
  commanderTax: number;
  monarch: boolean;
  initiative: boolean;
}
export type WinCondition = 'last_standing' | 'combo' | 'concession' | 'alternate_card' | 'other';
export type LiveGameEventDirection = 'increase' | 'decrease';
export type LiveGameEventType =
  | 'damage'
  | 'commander_damage'
  | 'infect'
  | 'lifegain'
  | 'elimination'
  | 'revive'
  | 'correction';

export interface LiveGameEvent {
  id: string;
  type: LiveGameEventType;
  occurredAt: string;
  targetKey: ParticipantKey;
  sourceKey: ParticipantKey | null;
  amount: number | null;
  /** Direction of the tracked counter. Missing on legacy events. */
  direction?: LiveGameEventDirection;
  /** Links the per-target events produced by one atomic table-wide action. */
  actionId?: string;
  groupScope?: GroupDamageScope;
  /** Marks an undo event so compact analytics reverse the original counter. */
  isCorrection?: boolean;
}

export interface LiveGameParticipantSummary {
  eventCount: number;
  lifeLost: number;
  lifeGained: number;
  lifeDamageDealt: number;
  unattributedLifeLost: number;
  commanderDamageTaken: number;
  commanderDamageDealt: number;
  infectReceived: number;
  infectDealt: number;
  eliminations: number;
  eliminationsCaused: number;
  revives: number;
  corrections: number;
  groupDamageDealt: number;
  groupDamageEvents: number;
}

export interface LiveGameSummary {
  schemaVersion: 1;
  totalEvents: number;
  firstOccurredAt: string | null;
  lastOccurredAt: string | null;
  byParticipant: Partial<Record<ParticipantKey, LiveGameParticipantSummary>>;
}

export interface LiveGamePlayer {
  slot: number;
  participantKey: ParticipantKey;
  deckId: string;
  displayName: string;
  commander: string;
  commanderImage: string | null;
  backgroundColor?: string | null;
  life: number;
  infect: number;
  commanderDamageFrom: Record<ParticipantKey, number>;
  counters: LiveGamePlayerCounters;
  isEliminated: boolean;
  eliminatedAt: string | null;
}

export interface LiveGameState {
  version: number;
  players: LiveGamePlayer[];
  layoutVariant?: TableLayoutVariant;
  startingPlayerKey?: ParticipantKey | null;
  startingDirection?: PlayDirection | null;
  /** Significant moments only. Routine counter changes live in `summary`. */
  events: LiveGameEvent[];
  /** Bounded cumulative counters used for per-match and future per-deck analytics. */
  summary?: LiveGameSummary;
}

type LiveGameMutationMetadata = {
  eventId?: string;
  occurredAt?: string;
  actionId?: string;
  isCorrection?: boolean;
};

export type LiveGameMutation = (
  | {
      type: 'adjust';
      targetKey: ParticipantKey;
      amount: number;
      mode: DamageMode;
      sourceKey?: ParticipantKey;
      /** Gain life equal to the damage actually dealt, including commander damage. */
      drain?: boolean;
      /** Fixed amount used when reversing a drain action. */
      drainAmount?: number;
      /** Internal metadata set by adjust_many for compact analytics. */
      groupScope?: GroupDamageScope;
    }
  | {
      type: 'adjust_many';
      sourceKey: ParticipantKey;
      amount: number;
      scope: GroupDamageScope;
      mode?: 'life' | 'infect';
      drain?: boolean;
      drainAmount?: number;
    }
  | { type: 'last_standing'; winnerKey: ParticipantKey }
  | { type: 'eliminate'; targetKey: ParticipantKey; eliminatedAt: string }
  | { type: 'revive'; targetKey: ParticipantKey; startingLife: number }
  | { type: 'restore-player'; player: LiveGamePlayer }
  | { type: 'adjust_counter'; targetKey: ParticipantKey; counter: PlayerCounter; amount: number }
  | { type: 'set_emblem'; targetKey: ParticipantKey; emblem: PlayerEmblem; active: boolean }
  | { type: 'restore_emblem'; emblem: PlayerEmblem; holderKey: ParticipantKey | null }
) & LiveGameMutationMetadata;

export interface QueuedLiveGameMutation {
  id: string;
  mutation: LiveGameMutation;
}

export interface LiveGameRecord {
  id: string;
  group_id: string;
  created_by: string;
  status: LiveGameStatus;
  starting_life: number;
  state: LiveGameState;
  match_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export function bumpLiveGameState(state: LiveGameState): LiveGameState {
  return { ...state, version: state.version + 1 };
}

function emptyParticipantSummary(): LiveGameParticipantSummary {
  return {
    eventCount: 0,
    lifeLost: 0,
    lifeGained: 0,
    lifeDamageDealt: 0,
    unattributedLifeLost: 0,
    commanderDamageTaken: 0,
    commanderDamageDealt: 0,
    infectReceived: 0,
    infectDealt: 0,
    eliminations: 0,
    eliminationsCaused: 0,
    revives: 0,
    corrections: 0,
    groupDamageDealt: 0,
    groupDamageEvents: 0,
  };
}

export function createLiveGameSummary(): LiveGameSummary {
  return {
    schemaVersion: 1,
    totalEvents: 0,
    firstOccurredAt: null,
    lastOccurredAt: null,
    byParticipant: {},
  };
}

function incrementMetric(
  metrics: LiveGameParticipantSummary,
  key: keyof LiveGameParticipantSummary,
  amount: number,
) {
  metrics[key] = Math.max(0, metrics[key] + amount);
}

export function aggregateLiveGameEvent(
  current: LiveGameSummary | undefined,
  event: LiveGameEvent,
): LiveGameSummary {
  const summary = current ?? createLiveGameSummary();
  const byParticipant = { ...summary.byParticipant };
  const getMetrics = (key: ParticipantKey) => {
    const metrics = { ...(byParticipant[key] ?? emptyParticipantSummary()) };
    byParticipant[key] = metrics;
    return metrics;
  };
  const target = getMetrics(event.targetKey);
  const amount = Math.max(0, event.amount ?? 0);
  const defaultDirection: LiveGameEventDirection = event.type === 'damage' ? 'decrease' : 'increase';
  const direction = event.direction ?? defaultDirection;
  const delta = direction === 'decrease' ? -amount : amount;

  target.eventCount += 1;
  if (event.isCorrection && event.type === 'damage') {
    incrementMetric(target, 'lifeGained', -amount);
    target.corrections += 1;
  } else if (event.isCorrection && event.type === 'lifegain') {
    incrementMetric(target, 'lifeLost', -amount);
    if (!event.sourceKey) incrementMetric(target, 'unattributedLifeLost', -amount);
    target.corrections += 1;
  } else if (event.type === 'damage') {
    incrementMetric(target, 'lifeLost', amount);
    if (!event.sourceKey) incrementMetric(target, 'unattributedLifeLost', amount);
  } else if (event.type === 'lifegain') {
    incrementMetric(target, 'lifeGained', delta);
  } else if (event.type === 'commander_damage') {
    incrementMetric(target, 'lifeLost', delta);
    incrementMetric(target, 'commanderDamageTaken', delta);
    if (direction === 'decrease') target.corrections += 1;
  } else if (event.type === 'infect') {
    incrementMetric(target, 'infectReceived', delta);
    if (direction === 'decrease') target.corrections += 1;
  } else if (event.type === 'elimination') {
    target.eliminations += 1;
  } else if (event.type === 'revive') {
    target.revives += 1;
  } else if (event.type === 'correction') {
    target.corrections += 1;
  }

  if (event.sourceKey) {
    const source = getMetrics(event.sourceKey);
    if (event.isCorrection && event.type === 'lifegain') {
      incrementMetric(source, 'lifeDamageDealt', -amount);
      if (event.groupScope) {
        incrementMetric(source, 'groupDamageDealt', -amount);
        incrementMetric(source, 'groupDamageEvents', -1);
      }
    } else if (event.type === 'damage') {
      incrementMetric(source, 'lifeDamageDealt', amount);
      if (event.groupScope) {
        incrementMetric(source, 'groupDamageDealt', amount);
        source.groupDamageEvents += 1;
      }
    } else if (event.type === 'commander_damage') {
      incrementMetric(source, 'lifeDamageDealt', delta);
      incrementMetric(source, 'commanderDamageDealt', delta);
    } else if (event.type === 'infect') {
      incrementMetric(source, 'infectDealt', delta);
    } else if (event.type === 'elimination') {
      source.eliminationsCaused += 1;
    }
  }

  return {
    schemaVersion: 1,
    totalEvents: summary.totalEvents + 1,
    firstOccurredAt: !summary.firstOccurredAt || event.occurredAt < summary.firstOccurredAt
      ? event.occurredAt
      : summary.firstOccurredAt,
    lastOccurredAt: !summary.lastOccurredAt || event.occurredAt > summary.lastOccurredAt
      ? event.occurredAt
      : summary.lastOccurredAt,
    byParticipant,
  };
}

export function summarizeLiveGameEvents(events: LiveGameEvent[]): LiveGameSummary {
  return events.reduce<LiveGameSummary>(aggregateLiveGameEvent, createLiveGameSummary());
}

export function isLiveGameHighlight(event: Pick<LiveGameEvent, 'type'>): boolean {
  return event.type === 'elimination' || event.type === 'revive';
}

function compactLiveGameHighlights(events: LiveGameEvent[]): LiveGameEvent[] {
  return events.filter(isLiveGameHighlight).slice(-LIVE_GAME_HIGHLIGHT_LIMIT);
}

export function createLiveGamePlayer(input: {
  slot: number;
  participantKey: ParticipantKey;
  deckId: string;
  displayName: string;
  commander: string;
  commanderImage: string | null;
  backgroundColor?: string | null;
  startingLife: number;
  allParticipantKeys: ParticipantKey[];
}): LiveGamePlayer {
  const commanderDamageFrom = Object.fromEntries(
    input.allParticipantKeys
      .filter((key) => key !== input.participantKey)
      .map((key) => [key, 0]),
  ) as Record<ParticipantKey, number>;

  return {
    slot: input.slot,
    participantKey: input.participantKey,
    deckId: input.deckId,
    displayName: input.displayName,
    commander: input.commander,
    commanderImage: input.commanderImage,
    backgroundColor: input.backgroundColor ?? null,
    life: input.startingLife,
    infect: 0,
    commanderDamageFrom,
    counters: {
      energy: 0,
      experience: 0,
      commanderTax: 0,
      monarch: false,
      initiative: false,
    },
    isEliminated: false,
    eliminatedAt: null,
  };
}

export function getActivePlayers(state: LiveGameState): LiveGamePlayer[] {
  return state.players.filter((player) => !player.isEliminated);
}

export function shouldAutoEliminate(player: LiveGamePlayer): boolean {
  if (player.life <= 0) return true;
  if (player.infect >= INFECT_LOSS_THRESHOLD) return true;
  return Object.values(player.commanderDamageFrom).some((damage) => damage >= COMMANDER_DAMAGE_LIMIT);
}

export function applyDamage(
  state: LiveGameState,
  targetKey: ParticipantKey,
  amount: number,
  mode: DamageMode,
  sourceKey?: ParticipantKey,
): LiveGameState {
  if (amount <= 0) return state;

  const players = state.players.map((player) => {
    if (player.participantKey !== targetKey || player.isEliminated) return player;

    if (mode === 'infect') {
      return { ...player, infect: player.infect + amount };
    }

    if (mode === 'commander') {
      if (!sourceKey || sourceKey === targetKey) return player;
      const current = player.commanderDamageFrom[sourceKey] ?? 0;
      return {
        ...player,
        life: player.life - amount,
        commanderDamageFrom: {
          ...player.commanderDamageFrom,
          [sourceKey]: current + amount,
        },
      };
    }

    return { ...player, life: player.life - amount };
  });

  return bumpLiveGameState({ ...state, players });
}

export function applyHealing(
  state: LiveGameState,
  targetKey: ParticipantKey,
  amount: number,
  mode: DamageMode,
  sourceKey?: ParticipantKey,
): LiveGameState {
  if (amount <= 0) return state;

  const players = state.players.map((player) => {
    if (player.participantKey !== targetKey || player.isEliminated) return player;

    if (mode === 'infect') {
      return { ...player, infect: Math.max(0, player.infect - amount) };
    }

    if (mode === 'commander') {
      if (!sourceKey || sourceKey === targetKey) return player;
      const current = player.commanderDamageFrom[sourceKey] ?? 0;
      const restored = Math.min(amount, current);
      return {
        ...player,
        life: player.life + restored,
        commanderDamageFrom: {
          ...player.commanderDamageFrom,
          [sourceKey]: current - restored,
        },
      };
    }

    return { ...player, life: player.life + amount };
  });

  return bumpLiveGameState({ ...state, players });
}

export function eliminatePlayer(state: LiveGameState, targetKey: ParticipantKey): LiveGameState {
  return eliminatePlayerAt(state, targetKey, new Date().toISOString());
}

export function eliminatePlayerAt(
  state: LiveGameState,
  targetKey: ParticipantKey,
  eliminatedAt: string,
): LiveGameState {
  const players = state.players.map((player) => {
    if (player.participantKey !== targetKey || player.isEliminated) return player;
    return {
      ...player,
      isEliminated: true,
      eliminatedAt,
      life: Math.min(player.life, 0),
    };
  });

  return bumpLiveGameState({ ...state, players });
}

export function revivePlayer(state: LiveGameState, targetKey: ParticipantKey, startingLife: number): LiveGameState {
  const players = state.players.map((player) => {
    if (player.participantKey !== targetKey || !player.isEliminated) return player;
    const commanderDamageFrom = Object.fromEntries(
      Object.keys(player.commanderDamageFrom).map((key) => [key, 0]),
    ) as Record<ParticipantKey, number>;
    return {
      ...player,
      isEliminated: false,
      eliminatedAt: null,
      life: startingLife,
      infect: 0,
      commanderDamageFrom,
    };
  });

  return bumpLiveGameState({ ...state, players });
}

export function applyLiveGameMutation(
  state: LiveGameState,
  mutation: LiveGameMutation,
): LiveGameState {
  const eventId = mutation.eventId;
  const occurredAt = mutation.occurredAt;
  const appendEvent = (
    next: LiveGameState,
    event: Omit<LiveGameEvent, 'id' | 'occurredAt'>,
    suffix = '',
  ): LiveGameState => {
    if (!eventId || !occurredAt) return next;
    const id = `${eventId}${suffix}`;
    const completeEvent = {
      id,
      occurredAt,
      actionId: mutation.actionId,
      isCorrection: mutation.isCorrection,
      ...event,
    };
    if (isLiveGameHighlight(completeEvent) && next.events.some((entry) => entry.id === id)) return next;
    return {
      ...next,
      events: isLiveGameHighlight(completeEvent)
        ? compactLiveGameHighlights([...next.events, completeEvent])
        : next.events,
      summary: aggregateLiveGameEvent(next.summary, completeEvent),
    };
  };

  if (mutation.type === 'last_standing') {
    const winner = state.players.find((player) => (
      player.participantKey === mutation.winnerKey && !player.isEliminated
    ));
    if (!winner) return state;

    const opponents = state.players.filter((player) => (
      !player.isEliminated && player.participantKey !== mutation.winnerKey
    ));
    if (opponents.length === 0) return state;

    const actionId = mutation.actionId ?? mutation.eventId;
    const next = opponents.reduce((current, player, index) => applyLiveGameMutation(current, {
      type: 'adjust',
      targetKey: player.participantKey,
      sourceKey: mutation.winnerKey,
      amount: player.life > 0 ? player.life : 1,
      mode: 'life',
      eventId: mutation.eventId ? `${mutation.eventId}:${index}` : undefined,
      occurredAt: mutation.occurredAt,
      actionId,
      groupScope: 'opponents',
      isCorrection: mutation.isCorrection,
    }), state);

    return { ...next, version: state.version + 1 };
  }

  if (mutation.type === 'adjust_many') {
    if (mutation.amount === 0) return state;
    const targets = state.players.filter((player) => (
      !player.isEliminated
      && (mutation.scope === 'all_players' || player.participantKey !== mutation.sourceKey)
    ));
    if (targets.length === 0) return state;

    const actionId = mutation.actionId ?? mutation.eventId;
    const mode = mutation.mode ?? 'life';
    const next = targets.reduce((current, player, index) => applyLiveGameMutation(current, {
      type: 'adjust',
      targetKey: player.participantKey,
      sourceKey: mutation.sourceKey,
      amount: mutation.amount,
      mode,
      eventId: mutation.eventId ? `${mutation.eventId}:${index}` : undefined,
      occurredAt: mutation.occurredAt,
      actionId,
      groupScope: mutation.scope,
      isCorrection: mutation.isCorrection,
    }), state);

    const drainAmount = mutation.drain
      ? mutation.drainAmount ?? Math.abs(mutation.amount) * targets.length
      : 0;
    const withDrain = drainAmount > 0
      ? applyLiveGameMutation(next, {
        type: 'adjust',
        targetKey: mutation.sourceKey,
        sourceKey: mutation.amount > 0 ? mutation.sourceKey : undefined,
        amount: mutation.amount > 0 ? -drainAmount : drainAmount,
        mode: 'life',
        eventId: mutation.eventId ? `${mutation.eventId}:drain` : undefined,
        occurredAt: mutation.occurredAt,
        actionId,
        groupScope: mutation.scope,
        isCorrection: mutation.isCorrection,
      })
      : next;

    // A table-wide action is one optimistic/realtime mutation, regardless of
    // how many participant counters it updates.
    return { ...withDrain, version: state.version + 1 };
  }

  if (mutation.type === 'adjust') {
    const beforePlayer = state.players.find((player) => player.participantKey === mutation.targetKey);
    const next = mutation.amount >= 0
      ? applyDamage(state, mutation.targetKey, mutation.amount, mutation.mode, mutation.sourceKey)
      : applyHealing(state, mutation.targetKey, Math.abs(mutation.amount), mutation.mode, mutation.sourceKey);
    let withAutoKo = { ...autoEliminatePlayers(next), version: state.version + 1 };
    const afterPlayer = withAutoKo.players.find((player) => player.participantKey === mutation.targetKey);
    const appliedAmount = beforePlayer && afterPlayer
      ? mutation.mode === 'life'
        ? Math.abs(afterPlayer.life - beforePlayer.life)
        : mutation.mode === 'infect'
          ? Math.abs(afterPlayer.infect - beforePlayer.infect)
          : mutation.sourceKey
            ? Math.abs(
              (afterPlayer.commanderDamageFrom[mutation.sourceKey] ?? 0)
              - (beforePlayer.commanderDamageFrom[mutation.sourceKey] ?? 0),
            )
            : 0
      : 0;
    if (beforePlayer && afterPlayer && appliedAmount > 0) {
      const eventType: LiveGameEventType = mutation.amount < 0 && mutation.mode === 'life'
        ? 'lifegain'
        : mutation.mode === 'commander'
          ? 'commander_damage'
          : mutation.mode === 'infect' ? 'infect' : 'damage';
      withAutoKo = appendEvent(withAutoKo, {
        type: eventType,
        targetKey: mutation.targetKey,
        sourceKey: mutation.sourceKey ?? null,
        amount: appliedAmount,
        direction: mutation.mode === 'life'
          ? mutation.amount < 0 ? 'increase' : 'decrease'
          : mutation.amount < 0 ? 'decrease' : 'increase',
        groupScope: mutation.groupScope,
      });
      if (!beforePlayer.isEliminated && afterPlayer.isEliminated) {
        withAutoKo = appendEvent(withAutoKo, {
          type: 'elimination',
          targetKey: mutation.targetKey,
          sourceKey: mutation.sourceKey ?? null,
          amount: null,
        }, ':ko');
      }
    }
    const drainAmount = mutation.drain && mutation.sourceKey
      && mutation.sourceKey !== mutation.targetKey
      ? mutation.drainAmount ?? appliedAmount
      : 0;
    if (drainAmount > 0) {
      const withDrain = applyLiveGameMutation(withAutoKo, {
        type: 'adjust',
        targetKey: mutation.sourceKey!,
        sourceKey: mutation.amount > 0 ? mutation.sourceKey : undefined,
        amount: mutation.amount > 0 ? -drainAmount : drainAmount,
        mode: 'life',
        eventId: mutation.eventId ? `${mutation.eventId}:drain` : undefined,
        occurredAt: mutation.occurredAt,
        actionId: mutation.actionId ?? mutation.eventId,
        isCorrection: mutation.isCorrection,
      });
      return { ...withDrain, version: state.version + 1 };
    }
    return withAutoKo;
  }
  if (mutation.type === 'eliminate') {
    return appendEvent(eliminatePlayerAt(state, mutation.targetKey, mutation.eliminatedAt), {
      type: 'elimination',
      targetKey: mutation.targetKey,
      sourceKey: null,
      amount: null,
    });
  }
  if (mutation.type === 'revive') {
    return appendEvent(revivePlayer(state, mutation.targetKey, mutation.startingLife), {
      type: 'revive',
      targetKey: mutation.targetKey,
      sourceKey: null,
      amount: null,
    });
  }
  if (mutation.type === 'adjust_counter') {
    const players = state.players.map((player) => player.participantKey === mutation.targetKey
      ? {
          ...player,
          counters: {
            ...player.counters,
            [mutation.counter]: Math.max(0, (player.counters?.[mutation.counter] ?? 0) + mutation.amount),
          },
        }
      : player);
    return bumpLiveGameState({ ...state, players });
  }
  if (mutation.type === 'set_emblem' || mutation.type === 'restore_emblem') {
    const holderKey = mutation.type === 'restore_emblem'
      ? mutation.holderKey
      : mutation.active ? mutation.targetKey : null;
    const players = state.players.map((player) => ({
      ...player,
      counters: {
        ...player.counters,
        [mutation.emblem]: player.participantKey === holderKey,
      },
    }));
    return bumpLiveGameState({ ...state, players });
  }

  const players = state.players.map((player) => (
    player.participantKey === mutation.player.participantKey ? mutation.player : player
  ));
  return appendEvent(bumpLiveGameState({ ...state, players }), {
    type: 'correction',
    targetKey: mutation.player.participantKey,
    sourceKey: null,
    amount: null,
  });
}

export function autoEliminatePlayers(state: LiveGameState): LiveGameState {
  let next = state;
  state.players.forEach((player) => {
    if (!player.isEliminated && shouldAutoEliminate(player)) {
      next = eliminatePlayer(next, player.participantKey);
    }
  });
  return next;
}

export function pickRandomPlayer(state: LiveGameState, pool?: ParticipantKey[]): LiveGamePlayer | null {
  const keys = pool?.length
    ? pool
    : getActivePlayers(state).map((player) => player.participantKey);

  const active = state.players.filter(
    (player) => !player.isEliminated && keys.includes(player.participantKey),
  );

  if (active.length === 0) return null;
  return active[Math.floor(Math.random() * active.length)];
}

export function getSuggestedWinner(state: LiveGameState): LiveGamePlayer | null {
  const standing = getActivePlayers(state);
  if (standing.length === 1) return standing[0];
  return null;
}

export function getDefaultWinCondition(state: LiveGameState): WinCondition | null {
  return getSuggestedWinner(state) ? 'last_standing' : null;
}

export function isValidLiveGameResult(
  state: LiveGameState,
  result: { winnerKey: ParticipantKey | null; isDraw: boolean; winCondition: WinCondition | null },
): boolean {
  if (result.isDraw) return result.winnerKey === null && result.winCondition === null;
  if (!result.winnerKey || !result.winCondition) return false;
  if (!state.players.some((player) => player.participantKey === result.winnerKey)) return false;

  const suggested = getSuggestedWinner(state);
  if (suggested) {
    return result.winnerKey === suggested.participantKey && result.winCondition === 'last_standing';
  }
  if (result.winCondition === 'last_standing') {
    return state.players.some((player) => (
      player.participantKey === result.winnerKey && !player.isEliminated
    ));
  }
  return true;
}

export type LiveGameResultWarning =
  | 'draw_with_single_survivor'
  | 'winner_marked_eliminated'
  | 'winner_has_lethal_total';

export function getLiveGameResultWarnings(
  state: LiveGameState,
  result: { winnerKey: ParticipantKey | null; isDraw: boolean; winCondition: WinCondition | null },
): LiveGameResultWarning[] {
  const warnings: LiveGameResultWarning[] = [];
  const activePlayers = getActivePlayers(state);
  if (result.isDraw && activePlayers.length === 1) warnings.push('draw_with_single_survivor');
  if (!result.winnerKey) return warnings;
  const winner = state.players.find((player) => player.participantKey === result.winnerKey);
  if (!winner) return warnings;
  if (winner.isEliminated) warnings.push('winner_marked_eliminated');
  const commanderLethal = Object.values(winner.commanderDamageFrom).some((damage) => damage >= 21);
  if (winner.life <= 0 || winner.infect >= 10 || commanderLethal) warnings.push('winner_has_lethal_total');
  return warnings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeLiveGamePlayer(raw: unknown): LiveGamePlayer | null {
  if (!isRecord(raw)) return null;
  const player = raw as Partial<LiveGamePlayer>;
  const participantKey = typeof player.participantKey === 'string' ? player.participantKey : '';
  // The participant projection only accepts keys in this range (see the
  // live_games trigger); drop the row instead of creating a seat keyed by
  // `undefined`, which would break every keyed lookup at the table.
  if (participantKey.length < 6 || participantKey.length > 64) return null;
  const commanderDamageFrom = Object.fromEntries(
    Object.entries(isRecord(player.commanderDamageFrom) ? player.commanderDamageFrom : {})
      .filter(([key]) => key.length > 0)
      .map(([key, damage]) => [key, nonNegativeNumber(damage)]),
  ) as Record<ParticipantKey, number>;
  return {
    ...(player as LiveGamePlayer),
    participantKey: participantKey as ParticipantKey,
    slot: typeof player.slot === 'number' && Number.isFinite(player.slot) ? player.slot : 0,
    deckId: typeof player.deckId === 'string' ? player.deckId : '',
    displayName: typeof player.displayName === 'string' && player.displayName
      ? player.displayName
      : participantKey,
    commander: typeof player.commander === 'string' ? player.commander : '',
    commanderImage: typeof player.commanderImage === 'string' ? player.commanderImage : null,
    life: typeof player.life === 'number' && Number.isFinite(player.life) ? player.life : 0,
    infect: nonNegativeNumber(player.infect),
    commanderDamageFrom,
    counters: {
      energy: nonNegativeNumber(player.counters?.energy),
      experience: nonNegativeNumber(player.counters?.experience),
      commanderTax: nonNegativeNumber(player.counters?.commanderTax),
      monarch: Boolean(player.counters?.monarch),
      initiative: Boolean(player.counters?.initiative),
    },
    isEliminated: Boolean(player.isEliminated),
    eliminatedAt: typeof player.eliminatedAt === 'string' ? player.eliminatedAt : null,
  };
}

/**
 * Normalizes every persisted player field. Renderers and event handlers read
 * `counters` and `commanderDamageFrom` directly, so a legacy or partially
 * written row must never surface as an undefined dereference at the table.
 */
export function parseLiveGameState(raw: unknown): LiveGameState {
  if (!isRecord(raw)) return { version: 0, players: [], events: [] };
  const value = raw as Partial<LiveGameState>;
  const events = Array.isArray(value.events)
    ? value.events.filter(isRecord) as unknown as LiveGameEvent[]
    : [];
  const summaryValue = isRecord(value.summary) ? value.summary as Partial<LiveGameSummary> : null;
  const summary: LiveGameSummary = summaryValue?.schemaVersion === 1
    ? {
        schemaVersion: 1,
        totalEvents: nonNegativeNumber(summaryValue.totalEvents),
        firstOccurredAt: typeof summaryValue.firstOccurredAt === 'string' ? summaryValue.firstOccurredAt : null,
        lastOccurredAt: typeof summaryValue.lastOccurredAt === 'string' ? summaryValue.lastOccurredAt : null,
        byParticipant: Object.fromEntries(
          Object.entries(isRecord(summaryValue.byParticipant) ? summaryValue.byParticipant : {})
            .filter(([, metrics]) => isRecord(metrics))
            .map(([key, metrics]) => [
              key,
              { ...emptyParticipantSummary(), ...(metrics as Partial<LiveGameParticipantSummary>) },
            ]),
        ) as Partial<Record<ParticipantKey, LiveGameParticipantSummary>>,
      }
    : summarizeLiveGameEvents(events);
  return {
    version: nonNegativeNumber(value.version),
    players: Array.isArray(value.players)
      ? value.players.map(normalizeLiveGamePlayer).filter((player): player is LiveGamePlayer => player !== null)
      : [],
    layoutVariant: value.layoutVariant === 'opposed' ? 'opposed' : 'classic',
    startingPlayerKey: typeof value.startingPlayerKey === 'string'
      ? value.startingPlayerKey as ParticipantKey
      : null,
    startingDirection: value.startingDirection === 'clockwise' || value.startingDirection === 'counterclockwise'
      ? value.startingDirection
      : null,
    events: compactLiveGameHighlights(events),
    summary,
  };
}
