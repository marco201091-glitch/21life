import { describe, expect, it } from 'vitest';
import {
  applyLiveGameMutation,
  createLiveGamePlayer,
  getDefaultWinCondition,
  isValidLiveGameResult,
  parseLiveGameState,
  type LiveGameState,
} from '@/lib/live-game';

const keys = ['user:a', 'user:b'] as const;

function makeState(): LiveGameState {
  return {
    version: 0,
    events: [],
    startingPlayerKey: keys[0],
    players: keys.map((participantKey, slot) => createLiveGamePlayer({
      slot,
      participantKey,
      deckId: `00000000-0000-0000-0000-00000000000${slot + 1}`,
      displayName: participantKey,
      commander: `Commander ${slot + 1}`,
      commanderImage: null,
      startingLife: 40,
      allParticipantKeys: [...keys],
    })),
  };
}

describe('live game mutations', () => {
  it('keeps the selected table layout through realtime serialization', () => {
    expect(parseLiveGameState({ ...makeState(), layoutVariant: 'opposed' }).layoutVariant).toBe('opposed');
    expect(parseLiveGameState(makeState()).layoutVariant).toBe('classic');
  });

  it('replays damage operations without replacing unrelated player state', () => {
    const first = applyLiveGameMutation(makeState(), {
      type: 'adjust', targetKey: keys[0], amount: 4, mode: 'life',
    });
    const second = applyLiveGameMutation(first, {
      type: 'adjust', targetKey: keys[1], amount: 2, mode: 'infect', sourceKey: keys[0],
    });

    expect(second.version).toBe(2);
    expect(second.players[0]?.life).toBe(36);
    expect(second.players[1]?.life).toBe(40);
    expect(second.players[1]?.infect).toBe(2);
  });

  it('tracks and reverses commander damage as a semantic mutation', () => {
    const damage = {
      type: 'adjust' as const,
      targetKey: keys[1],
      amount: 7,
      mode: 'commander' as const,
      sourceKey: keys[0],
    };
    const applied = applyLiveGameMutation(makeState(), damage);
    const undone = applyLiveGameMutation(applied, { ...damage, amount: -7 });

    expect(applied.players[1]?.commanderDamageFrom[keys[0]]).toBe(7);
    expect(applied.players[1]?.life).toBe(33);
    expect(undone.players[1]?.commanderDamageFrom[keys[0]]).toBe(0);
    expect(undone.players[1]?.life).toBe(40);
    expect(undone.version).toBe(2);
  });

  it('applies and reverses lifelink on commander damage', () => {
    const initial = makeState();
    initial.players[0] = { ...initial.players[0]!, life: 30 };
    const mutation = {
      type: 'adjust' as const,
      targetKey: keys[1],
      sourceKey: keys[0],
      amount: 7,
      mode: 'commander' as const,
      drain: true,
      drainAmount: 7,
      eventId: 'commander-lifelink',
      occurredAt: '2026-08-13T12:00:00.000Z',
    };
    const applied = applyLiveGameMutation(initial, mutation);
    const undone = applyLiveGameMutation(applied, { ...mutation, amount: -7 });

    expect(applied.players.map((player) => player.life)).toEqual([37, 33]);
    expect(applied.players[1]?.commanderDamageFrom[keys[0]]).toBe(7);
    expect(applied.summary?.byParticipant[keys[0]]?.lifeGained).toBe(7);
    expect(undone.players.map((player) => player.life)).toEqual([30, 40]);
    expect(undone.players[1]?.commanderDamageFrom[keys[0]]).toBe(0);
  });

  it('aggregates only the commander correction that was actually applied', () => {
    const damaged = applyLiveGameMutation(makeState(), {
      type: 'adjust', targetKey: keys[1], sourceKey: keys[0], amount: 2, mode: 'commander',
      eventId: 'damage-two', occurredAt: '2026-07-14T11:00:00.000Z',
    });
    const corrected = applyLiveGameMutation(damaged, {
      type: 'adjust', targetKey: keys[1], sourceKey: keys[0], amount: -5, mode: 'commander',
      eventId: 'correct-five', occurredAt: '2026-07-14T11:01:00.000Z',
    });

    expect(corrected.players[1]?.life).toBe(40);
    expect(corrected.events).toEqual([]);
    expect(corrected.summary?.byParticipant[keys[1]]?.lifeLost).toBe(0);
  });

  it('aggregates attributed damage, other damage, and lifegain without a raw log', () => {
    const commanderDamage = applyLiveGameMutation(makeState(), {
      type: 'adjust',
      targetKey: keys[1],
      sourceKey: keys[0],
      amount: 5,
      mode: 'commander',
      eventId: 'event-1',
      occurredAt: '2026-07-14T10:00:00.000Z',
    });
    const otherDamage = applyLiveGameMutation(commanderDamage, {
      type: 'adjust',
      targetKey: keys[1],
      amount: 2,
      mode: 'life',
      eventId: 'event-2',
      occurredAt: '2026-07-14T10:00:05.000Z',
    });
    const lifegain = applyLiveGameMutation(otherDamage, {
      type: 'adjust',
      targetKey: keys[1],
      amount: -3,
      mode: 'life',
      eventId: 'event-3',
      occurredAt: '2026-07-14T10:00:10.000Z',
    });

    expect(lifegain.events).toEqual([]);
    expect(lifegain.summary?.byParticipant[keys[1]]).toMatchObject({
      lifeLost: 7,
      lifeGained: 3,
      commanderDamageTaken: 5,
    });
    expect(lifegain.summary?.byParticipant[keys[0]]?.commanderDamageDealt).toBe(5);
  });

  it('distinguishes infect and commander damage from their manual corrections', () => {
    const state = makeState();
    const commanderDamage = applyLiveGameMutation(state, {
      type: 'adjust', targetKey: keys[1], sourceKey: keys[0], mode: 'commander', amount: 4,
      eventId: 'commander-up', occurredAt: '2026-07-14T12:00:00.000Z',
    });
    const commanderCorrection = applyLiveGameMutation(commanderDamage, {
      type: 'adjust', targetKey: keys[1], sourceKey: keys[0], mode: 'commander', amount: -2,
      eventId: 'commander-down', occurredAt: '2026-07-14T12:01:00.000Z',
    });
    const infect = applyLiveGameMutation(commanderCorrection, {
      type: 'adjust', targetKey: keys[1], sourceKey: keys[0], mode: 'infect', amount: 3,
      eventId: 'infect-up', occurredAt: '2026-07-14T12:02:00.000Z',
    });
    const infectCorrection = applyLiveGameMutation(infect, {
      type: 'adjust', targetKey: keys[1], sourceKey: keys[0], mode: 'infect', amount: -1,
      eventId: 'infect-down', occurredAt: '2026-07-14T12:03:00.000Z',
    });

    expect(infectCorrection.events).toEqual([]);
    expect(infectCorrection.summary?.byParticipant[keys[1]]).toMatchObject({
      lifeLost: 2,
      commanderDamageTaken: 2,
      infectReceived: 2,
      corrections: 2,
    });
    expect(infectCorrection.summary?.byParticipant[keys[0]]).toMatchObject({
      lifeDamageDealt: 2,
      commanderDamageDealt: 2,
      infectDealt: 2,
    });
  });

  it('keeps no routine raw events while preserving exact bounded aggregates', () => {
    let state = makeState();
    for (let index = 0; index < 505; index += 1) {
      state = applyLiveGameMutation(state, {
        type: 'adjust',
        targetKey: keys[1],
        sourceKey: keys[0],
        amount: -1,
        mode: 'life',
        eventId: `overflow-${index}`,
        occurredAt: new Date(Date.UTC(2026, 6, 14, 12, 0, index)).toISOString(),
      });
    }

    expect(state.events).toEqual([]);
    expect(state.summary?.totalEvents).toBe(505);
    expect(state.summary?.byParticipant[keys[1]]?.lifeGained).toBe(505);
  });

  it('rebuilds a summary for legacy states before trimming their raw log', () => {
    const parsed = parseLiveGameState({
      ...makeState(),
      events: [
        {
          id: 'legacy-damage', type: 'damage', occurredAt: '2026-07-14T12:00:00.000Z',
          targetKey: keys[1], sourceKey: null, amount: 4,
        },
        {
          id: 'legacy-gain', type: 'lifegain', occurredAt: '2026-07-14T12:01:00.000Z',
          targetKey: keys[1], sourceKey: null, amount: 2,
        },
      ],
    });

    expect(parsed.summary?.totalEvents).toBe(2);
    expect(parsed.events).toEqual([]);
    expect(parsed.summary?.byParticipant[keys[1]]).toMatchObject({
      lifeLost: 4,
      lifeGained: 2,
      unattributedLifeLost: 4,
    });
  });

  it('normalizes malformed persisted players instead of throwing at the table', () => {
    const parsed = parseLiveGameState({
      version: 'broken',
      players: [null, 'invalid', { participantKey: 'x' }, {
        participantKey: keys[0],
        life: 'not-a-number',
        counters: null,
        commanderDamageFrom: 'invalid',
      }],
      events: [null, { type: 'damage' }],
      summary: { schemaVersion: 1, byParticipant: null },
    });

    expect(parsed.version).toBe(0);
    expect(parsed.players).toHaveLength(1);
    expect(parsed.players[0]).toMatchObject({
      participantKey: keys[0],
      life: 0,
      infect: 0,
      commanderDamageFrom: {},
      isEliminated: false,
      eliminatedAt: null,
    });
    expect(parsed.players[0]?.counters).toMatchObject({
      energy: 0,
      experience: 0,
      commanderTax: 0,
      monarch: false,
      initiative: false,
    });
    expect(parsed.summary?.byParticipant).toEqual({});
  });

  it('restores a player snapshot without overwriting another player', () => {
    const state = makeState();
    const snapshot = state.players[0]!;
    const eliminated = applyLiveGameMutation(state, {
      type: 'eliminate', targetKey: keys[0], eliminatedAt: '2026-07-13T12:00:00.000Z',
    });
    const withOtherDamage = applyLiveGameMutation(eliminated, {
      type: 'adjust', targetKey: keys[1], amount: 3, mode: 'life',
    });
    const restored = applyLiveGameMutation(withOtherDamage, {
      type: 'restore-player', player: snapshot,
    });

    expect(restored.players[0]?.isEliminated).toBe(false);
    expect(restored.players[0]?.life).toBe(40);
    expect(restored.players[1]?.life).toBe(37);
  });

  it('keeps one version increment when damage also triggers auto-KO', () => {
    const state = makeState();
    const next = applyLiveGameMutation(state, {
      type: 'adjust', targetKey: keys[0], amount: 40, mode: 'life',
    });

    expect(next.version).toBe(1);
    expect(next.players[0]?.isEliminated).toBe(true);
  });

  it('applies and reverses table-wide damage atomically', () => {
    const damaged = applyLiveGameMutation(makeState(), {
      type: 'adjust_many', sourceKey: keys[0], amount: 6, scope: 'opponents',
      eventId: 'group-hit', occurredAt: '2026-07-16T12:00:00.000Z',
    });
    const restored = applyLiveGameMutation(damaged, {
      type: 'adjust_many', sourceKey: keys[0], amount: -6, scope: 'opponents',
      eventId: 'undo-group-hit', occurredAt: '2026-07-16T12:00:01.000Z', isCorrection: true,
    });

    expect(damaged.version).toBe(1);
    expect(damaged.players.map((player) => player.life)).toEqual([40, 34]);
    expect(damaged.summary?.byParticipant[keys[0]]?.groupDamageDealt).toBe(6);
    expect(restored.version).toBe(2);
    expect(restored.players.map((player) => player.life)).toEqual([40, 40]);
    expect(restored.summary?.byParticipant[keys[0]]?.groupDamageDealt).toBe(0);
  });

  it('applies infect to every opponent as one atomic mutation', () => {
    const infected = applyLiveGameMutation(makeState(), {
      type: 'adjust_many',
      sourceKey: keys[0],
      amount: 3,
      scope: 'opponents',
      mode: 'infect',
      eventId: 'group-infect',
      occurredAt: '2026-07-19T12:00:00.000Z',
    });

    expect(infected.version).toBe(1);
    expect(infected.players.map((player) => player.infect)).toEqual([0, 3]);
    expect(infected.players.map((player) => player.life)).toEqual([40, 40]);
    expect(infected.events).toEqual([]);
    expect(infected.summary?.byParticipant[keys[0]]?.infectDealt).toBe(3);
  });

  it('drains the total life damage dealt to all opponents', () => {
    const initial = makeState();
    initial.players[0] = { ...initial.players[0]!, life: 30 };
    const drained = applyLiveGameMutation(initial, {
      type: 'adjust_many',
      sourceKey: keys[0],
      amount: 6,
      scope: 'opponents',
      mode: 'life',
      drain: true,
      eventId: 'group-drain',
      occurredAt: '2026-07-19T12:00:00.000Z',
    });
    const reversed = applyLiveGameMutation(drained, {
      type: 'adjust_many',
      sourceKey: keys[0],
      amount: -6,
      scope: 'opponents',
      mode: 'life',
      drain: true,
      drainAmount: 6,
      eventId: 'undo-group-drain',
      occurredAt: '2026-07-19T12:00:01.000Z',
      isCorrection: true,
    });

    expect(drained.version).toBe(1);
    expect(drained.players.map((player) => player.life)).toEqual([36, 34]);
    expect(drained.events).toEqual([]);
    expect(drained.summary?.byParticipant[keys[0]]).toMatchObject({
      lifeDamageDealt: 6,
      lifeGained: 6,
    });
    expect(reversed.players.map((player) => player.life)).toEqual([30, 40]);
    expect(reversed.summary?.byParticipant[keys[0]]?.lifeDamageDealt).toBe(0);
  });

  it('drains life from a single target and reverses both totals', () => {
    const initial = makeState();
    initial.players[0] = { ...initial.players[0]!, life: 30 };
    const drained = applyLiveGameMutation(initial, {
      type: 'adjust',
      sourceKey: keys[0],
      targetKey: keys[1],
      amount: 5,
      mode: 'life',
      drain: true,
    });
    const reversed = applyLiveGameMutation(drained, {
      type: 'adjust',
      sourceKey: keys[0],
      targetKey: keys[1],
      amount: -5,
      mode: 'life',
      drain: true,
      drainAmount: 5,
    });

    expect(drained.players.map((player) => player.life)).toEqual([35, 35]);
    expect(reversed.players.map((player) => player.life)).toEqual([30, 40]);
  });

  it('keeps routine damage only in compact participant summaries', () => {
    const damaged = applyLiveGameMutation(makeState(), {
      type: 'adjust',
      sourceKey: keys[0],
      targetKey: keys[1],
      amount: 5,
      mode: 'life',
      eventId: 'damage',
      occurredAt: '2026-07-19T12:00:00.000Z',
    });

    expect(damaged.events).toEqual([]);
    expect(damaged.summary?.totalEvents).toBe(1);
    expect(damaged.summary?.byParticipant[keys[0]]?.lifeDamageDealt).toBe(5);
    expect(damaged.summary?.byParticipant[keys[1]]?.lifeLost).toBe(5);
  });

  it('accepts Last Standing explicitly and applies lethal damage to every opponent', () => {
    const activeState = makeState();
    expect(getDefaultWinCondition(activeState)).toBeNull();
    expect(isValidLiveGameResult(activeState, {
      winnerKey: keys[0], isDraw: false, winCondition: 'combo',
    })).toBe(true);
    expect(isValidLiveGameResult(activeState, {
      winnerKey: keys[0], isDraw: false, winCondition: 'last_standing',
    })).toBe(true);

    const thirdKey = 'user:c' as const;
    const threePlayerState = {
      ...activeState,
      players: [
        ...activeState.players,
        createLiveGamePlayer({
          slot: 2,
          participantKey: thirdKey,
          deckId: 'deck-c',
          displayName: 'Player 3',
          commander: 'Commander 3',
          commanderImage: null,
          startingLife: 40,
          allParticipantKeys: [...keys, thirdKey],
        }),
      ],
    };
    const resolvedAsLastStanding = applyLiveGameMutation(threePlayerState, {
      type: 'last_standing',
      winnerKey: keys[0],
      eventId: 'last-standing',
      occurredAt: '2026-08-29T10:00:00.000Z',
    });
    expect(resolvedAsLastStanding.players[0].life).toBe(40);
    expect(resolvedAsLastStanding.players[0].isEliminated).toBe(false);
    expect(resolvedAsLastStanding.players[1].life).toBe(0);
    expect(resolvedAsLastStanding.players[1].isEliminated).toBe(true);
    expect(resolvedAsLastStanding.players[2].life).toBe(0);
    expect(resolvedAsLastStanding.players[2].isEliminated).toBe(true);
    expect(resolvedAsLastStanding.summary?.byParticipant[keys[0]]?.lifeDamageDealt).toBe(80);
    expect(resolvedAsLastStanding.summary?.byParticipant[keys[1]]?.lifeLost).toBe(40);
    expect(resolvedAsLastStanding.summary?.byParticipant[thirdKey]?.lifeLost).toBe(40);

    const lastStanding = applyLiveGameMutation(activeState, {
      type: 'eliminate', targetKey: keys[1], eliminatedAt: '2026-07-14T12:00:00.000Z',
    });
    expect(getDefaultWinCondition(lastStanding)).toBe('last_standing');
    expect(isValidLiveGameResult(lastStanding, {
      winnerKey: keys[0], isDraw: false, winCondition: 'last_standing',
    })).toBe(true);
    expect(isValidLiveGameResult(lastStanding, {
      winnerKey: keys[0], isDraw: false, winCondition: 'combo',
    })).toBe(false);
    expect(isValidLiveGameResult(lastStanding, {
      winnerKey: null, isDraw: true, winCondition: null,
    })).toBe(true);
  });
});
