import { OccasionalDeckForm } from '@/components/table/occasional-deck-form';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { RichTextInput } from '@/components/ui/rich-text-input';
import { Modal } from '@/components/ui/modal';
import { colors, spacing } from '@/constants/theme';
import type { ArenaGuest } from '@/lib/arena-participants';
import {
  getParticipantDisplayName,
  getParticipantKey,
  resolveWinnerParticipantKey,
} from '@/lib/arena-participants';
import { isoToMatchDateValue, matchDateToIso } from '@/lib/match-datetime';
import type { ParticipantKey } from '@/lib/participant-keys';
import { getProfileDisplayName } from '@/lib/profile-display';
import type { ArenaMatch, ArenaProfile, MemberDeck } from '@/lib/types/arena';
import {
  MatchParticipantRow,
  toDeckOption,
  type DeckOption,
} from '@/components/table/match-participant-row';

type EditMatchModalProps = {
  groupId: string;
  visible: boolean;
  saving: boolean;
  match: ArenaMatch | null;
  members: ArenaProfile[];
  guests: ArenaGuest[];
  decks: MemberDeck[];
  labels: {
    title: string;
    hint: string;
    selectWinner: string;
    draw: string;
    battleDate: string;
    notes: string;
    notesPlaceholder: string;
    richTextHint: string;
    selectDeck: string;
    cancel: string;
    save: string;
    saving: string;
    winnerError: string;
    dateError: string;
    guestBadge: string;
    deckCount: (count: number) => string;
    searchPlaceholder: string;
    showDeckList: string;
    hideDeckList: string;
    selectDeckPrompt: string;
    deckListHiddenSelected: string;
    deckListHiddenEmpty: string;
    noDecksMatchSearch: string;
    swipeDecksHint: string;
    winCondition: string;
    winConditions: Record<Exclude<NonNullable<ArenaMatch['win_condition']>, 'last_standing'> | 'last_standing', string>;
    replacePlayer: string;
    selectPlayer: string;
  };
  canManage: boolean;
  onClose: () => void;
  onError: (message: string) => void;
  onSave: (input: {
    matchId: string;
    winnerKey: string | null;
    isDraw: boolean;
    participantDecks: Record<string, string>;
    matchPlayedAtIso: string;
    matchNotes: string;
    winCondition: ArenaMatch['win_condition'];
    isArenaManager: boolean;
    participants: {
      id: string;
      participantKey: string | null;
      isGuest: boolean;
      replacementKey: string | null;
    }[];
  }) => Promise<void>;
};

function getDeckOptions(
  key: string,
  decksByUser: Map<string, MemberDeck[]>,
  guests: ArenaGuest[],
): DeckOption[] {
  if (key.startsWith('guest:')) {
    const guestId = key.slice(6);
    const guestDecks = guests.find((guest) => guest.id === guestId)?.arena_guest_decks || [];
    return guestDecks.map(toDeckOption);
  }

  return (decksByUser.get(key.slice(5)) || []).map(toDeckOption);
}

function filterDecks(decks: DeckOption[], query: string): DeckOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return decks;
  return decks.filter(
    (deck) =>
      deck.name.toLowerCase().includes(normalized) ||
      deck.commander.toLowerCase().includes(normalized),
  );
}

export function EditMatchModal({
  groupId,
  visible,
  saving,
  match,
  members,
  guests,
  decks,
  canManage,
  labels,
  onClose,
  onError,
  onSave,
}: EditMatchModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const formScrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  const availableHeight = windowHeight;
  const modalBodyHeight = Math.min(
    windowHeight * 0.86,
    760,
    Math.max(180, availableHeight - Math.max(insets.bottom, spacing.md) - spacing.sm),
  );
  const [winnerKey, setWinnerKey] = useState('');
  const [isDraw, setIsDraw] = useState(false);
  const [participantDecks, setParticipantDecks] = useState<Record<string, string>>({});
  const [matchPlayedAt, setMatchPlayedAt] = useState('');
  const [matchNotes, setMatchNotes] = useState('');
  const [winCondition, setWinCondition] = useState<ArenaMatch['win_condition']>(null);
  const [deckSearch, setDeckSearch] = useState<Record<string, string>>({});
  const [hiddenDeckLists, setHiddenDeckLists] = useState<Record<string, boolean>>({});
  const [replacementKeys, setReplacementKeys] = useState<Record<string, string>>({});
  const [replacementRowId, setReplacementRowId] = useState<string | null>(null);

  const [creatingDecks, setCreatingDecks] = useState<Record<string, boolean>>({});
  const creatingDeck = Object.values(creatingDecks).some(Boolean);
  const [occasionalDecks, setOccasionalDecks] = useState<MemberDeck[]>([]);
  const decksByUser = useMemo(() => {
    const map = new Map<string, MemberDeck[]>();
    [...decks, ...occasionalDecks].forEach((deck) => {
      const current = map.get(deck.user_id) || [];
      current.push(deck);
      map.set(deck.user_id, current);
    });
    return map;
  }, [decks, occasionalDecks]);

  const participantKeys = useMemo(() => {
    if (!match) return [] as ParticipantKey[];
    return match.match_participants
      .map((participant) => getParticipantKey(participant))
      .filter((key): key is ParticipantKey => key !== null);
  }, [match]);

  const effectiveParticipantKeys = useMemo(() => participantKeys.map((key) => {
    const row = match?.match_participants.find((participant) => getParticipantKey(participant) === key);
    return row ? replacementKeys[row.id] || key : key;
  }), [match, participantKeys, replacementKeys]);

  useEffect(() => {
    if (!visible || !match) return;

    setIsDraw(Boolean(match.is_draw));
    setWinnerKey(match.is_draw ? '' : (resolveWinnerParticipantKey(match) || ''));
    setMatchNotes(match.notes || '');
    setWinCondition(match.is_draw ? null : (match.win_condition || 'other'));
    setMatchPlayedAt(isoToMatchDateValue(match.played_at));
    setDeckSearch({});
    setHiddenDeckLists(Object.fromEntries(
      match.match_participants
        .map(getParticipantKey)
        .filter((key): key is ParticipantKey => Boolean(key))
        .map((key) => [key, true]),
    ));

    const deckMap: Record<string, string> = {};
    match.match_participants.forEach((participant) => {
      const participantKey = getParticipantKey(participant);
      const deckId = participant.deck_id || participant.guest_deck_id;
      if (participantKey && deckId) {
        deckMap[participantKey] = deckId;
      }
    });
    setParticipantDecks(deckMap);
    setReplacementKeys({});
    setReplacementRowId(null);
  }, [match, visible]);

  const replaceParticipant = (rowId: string, originalKey: string, nextKey: string) => {
    if (creatingDeck) return;
    const previousKey = replacementKeys[rowId] || originalKey;
    setReplacementKeys((current) => ({ ...current, [rowId]: nextKey === originalKey ? '' : nextKey }));
    if (winnerKey === previousKey) setWinnerKey(nextKey);
    const options = getDeckOptions(nextKey, decksByUser, guests);
    setParticipantDecks((current) => ({ ...current, [nextKey]: current[nextKey] || options[0]?.id || '' }));
    setHiddenDeckLists((current) => ({ ...current, [nextKey]: true }));
    setReplacementRowId(null);
  };

  const handleSave = async () => {
    if (!match) return;
    if (new Set(effectiveParticipantKeys).size !== effectiveParticipantKeys.length) {
      onError(labels.winnerError);
      return;
    }
    if (!isDraw && !winnerKey) {
      onError(labels.winnerError);
      return;
    }
    if (!isDraw && !effectiveParticipantKeys.includes(winnerKey)) {
      onError(labels.winnerError);
      return;
    }

    const playedAtIso = matchDateToIso(matchPlayedAt, match.played_at);
    if (!playedAtIso) {
      onError(labels.dateError);
      return;
    }

    await onSave({
      matchId: match.id,
      winnerKey: isDraw ? null : winnerKey,
      isDraw,
      participantDecks,
      matchPlayedAtIso: playedAtIso,
      matchNotes,
      winCondition: isDraw ? null : (winCondition || 'other'),
      isArenaManager: canManage,
      participants: match.match_participants.map((participant) => ({
        id: participant.id,
        participantKey: getParticipantKey(participant),
        isGuest: Boolean(participant.guest_id),
        replacementKey: replacementKeys[participant.id] || null,
      })),
    });
  };

  if (!match) return null;

  const participantRowLabels = {
    guestBadge: labels.guestBadge,
    deckCount: labels.deckCount,
    searchPlaceholder: labels.searchPlaceholder,
    showDeckList: labels.showDeckList,
    hideDeckList: labels.hideDeckList,
    selectDeckPrompt: labels.selectDeckPrompt,
    deckListHiddenSelected: labels.deckListHiddenSelected,
    deckListHiddenEmpty: labels.deckListHiddenEmpty,
    noDecksMatchSearch: labels.noDecksMatchSearch,
    swipeDecksHint: labels.swipeDecksHint,
  };

  const actionFooter = (
    <View style={styles.actions}>
      <Button label={labels.cancel} variant="ghost" disabled={creatingDeck} onPress={onClose} style={styles.actionButton} />
      <Button
        label={saving ? labels.saving : labels.save}
        disabled={saving || creatingDeck || (!isDraw && !winnerKey)}
        onPress={handleSave}
        style={styles.actionButton}
      />
    </View>
  );

  return (
    <Modal visible={visible} onClose={() => { if (!creatingDeck) onClose(); }} scroll={false}>
      <View style={[styles.shell, { height: modalBodyHeight }]}>
        <Text style={styles.title}>{labels.title}</Text>
        <Text style={styles.hint}>{labels.hint}</Text>

        <KeyboardAwareScrollView
          ref={formScrollRef}
          bottomOffset={spacing.lg}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          <DateField
            label={labels.battleDate}
            value={matchPlayedAt}
            onChange={setMatchPlayedAt}
            maximumDate={new Date()}
            testID="edit-match-date"
          />

          <View style={styles.participantList}>
            {match.match_participants.map((participant) => {
              const originalKey = getParticipantKey(participant);
              if (!originalKey) return null;
              const participantKey = (replacementKeys[participant.id] || originalKey) as ParticipantKey;

              const deckOptions = getDeckOptions(participantKey, decksByUser, guests);
              const selectedDeckId = participantDecks[participantKey] || '';
              const historicalDeck = participant.decks;
              if (participantKey === originalKey && historicalDeck && participant.deck_id && !deckOptions.some(deck => deck.id === participant.deck_id)) deckOptions.push(toDeckOption({ ...historicalDeck, id: participant.deck_id }));
              const selectedDeck = deckOptions.find((deck) => deck.id === selectedDeckId) || null;
              const isGuest = participantKey.startsWith('guest:');
              const displayName = participantKey === originalKey ? getParticipantDisplayName(participant)
                : isGuest ? guests.find(guest => `guest:${guest.id}` === participantKey)?.display_name || participantKey
                : getProfileDisplayName(members.find(member => `user:${member.id}` === participantKey)!);

              return (
                <View key={participant.id} style={styles.participantCard}>
                <MatchParticipantRow
                  participantKey={participantKey}
                  displayName={displayName}
                  isGuest={isGuest}
                  deckCount={deckOptions.length}
                  selected
                  readOnly
                  selectedDeck={selectedDeck}
                  deckListHidden={Boolean(hiddenDeckLists[participantKey])}
                  searchValue={deckSearch[participantKey] || ''}
                  selectedDeckId={selectedDeckId}
                  filteredDecks={filterDecks(deckOptions, deckSearch[participantKey] || '')}
                  labels={participantRowLabels}
                  onToggle={() => {}}
                  onSearchChange={(value) =>
                    setDeckSearch((state) => ({ ...state, [participantKey]: value }))
                  }
                  onToggleDeckList={() =>
                    setHiddenDeckLists((state) => ({
                      ...state,
                      [participantKey]: !state[participantKey],
                    }))
                  }
                  onSelectDeck={(deckId) => {
                    if (creatingDeck) return;
                    setParticipantDecks((state) => ({ ...state, [participantKey]: deckId }));
                  }}
                />
                {canManage ? (
                  <>
                    <Button testID={`replace-player-${participant.id}`} label={labels.replacePlayer} variant="ghost" size="sm"
                      onPress={() => setReplacementRowId(current => current === participant.id ? null : participant.id)} />
                    {replacementRowId === participant.id ? (
                      <View style={styles.replacementControl}>
                        <Text style={styles.replacementLabel}>{labels.selectPlayer}</Text>
                        {[{ key: originalKey, name: getParticipantDisplayName(participant) },
                          ...members.map(member => ({ key: `user:${member.id}`, name: getProfileDisplayName(member) })),
                          ...guests.map(guest => ({ key: `guest:${guest.id}`, name: guest.display_name })),
                        ].filter((option, index, options) => options.findIndex(item => item.key === option.key) === index
                          && (option.key === originalKey || !participantKeys.includes(option.key as ParticipantKey))
                          && (option.key === participantKey || !effectiveParticipantKeys.includes(option.key))).map(option => (
                          <Pressable key={option.key} testID={`replacement-${participant.id}-${option.key}`}
                            accessibilityRole="button" accessibilityState={{ selected: option.key === participantKey }}
                            style={styles.replacementOption} onPress={() => replaceParticipant(participant.id, originalKey, option.key)}>
                            <Text style={[styles.replacementText, option.key === participantKey && styles.replacementSelected]}>{option.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}
                {!isGuest ? <OccasionalDeckForm disabled={creatingDeck} key={participantKey} onSavingChange={saving => setCreatingDecks(current => ({ ...current, [participantKey]: saving }))} groupId={groupId || match.group_id} userId={participantKey.slice(5)} selectedDeckId={selectedDeckId} onCreated={deck => {
                  setOccasionalDecks(current => [...current.filter(item => item.id !== deck.id), deck]);
                  setParticipantDecks(current => ({ ...current, [participantKey]: deck.id }));
                }} /> : null}
                </View>
              );
            })}
          </View>

          <View style={styles.drawRow}>
            <Text style={styles.drawLabel}>{labels.draw}</Text>
            <Switch
              value={isDraw}
              onValueChange={(value) => {
                setIsDraw(value);
                if (value) setWinnerKey('');
              }}
            />
          </View>

          {!isDraw ? (
          <>
          <Text style={styles.sectionLabel}>{labels.selectWinner}</Text>
          <View style={styles.chipRow}>
            {effectiveParticipantKeys.map((key) => {
              const selected = winnerKey === key;
              const label = key.startsWith('guest:')
                ? guests.find((guest) => guest.id === key.slice(6))?.display_name || key
                : (() => {
                    const member = members.find((item) => item.id === key.slice(5));
                    return member ? getProfileDisplayName(member) : key;
                  })();

              return (
                <Pressable
                  key={key}
                  style={[styles.chip, selected && styles.winnerChip]}
                  onPress={() => setWinnerKey(key)}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.sectionLabel}>{labels.winCondition}</Text>
          <View style={styles.winConditionGrid}>
            {([
              ['last_standing', 'shield-checkmark-outline'],
              ['combo', 'git-merge-outline'],
              ['concession', 'flag-outline'],
              ['alternate_card', 'sparkles-outline'],
              ['other', 'ellipsis-horizontal-circle-outline'],
            ] as const).map(([value, icon]) => {
              const selected = winCondition === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.winConditionChip, selected && styles.winConditionChipSelected]}
                  onPress={() => setWinCondition(value)}
                >
                  <Ionicons name={icon} size={17} color={selected ? colors.foreground : colors.muted} />
                  <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{labels.winConditions[value]}</Text>
                </Pressable>
              );
            })}
          </View>
          </>
          ) : null}

          <RichTextInput
            label={labels.notes}
            value={matchNotes}
            onChangeText={setMatchNotes}
            placeholder={labels.notesPlaceholder}
            hint={labels.richTextHint}
            onFocus={() => {
              setTimeout(() => {
                formScrollRef.current?.assureFocusedInputVisible();
              }, 120);
            }}
          />

        </KeyboardAwareScrollView>
        <View style={styles.stickyActions}>{actionFooter}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    gap: spacing.md,
    paddingBottom: 92,
  },
  title: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '700',
  },
  drawRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawLabel: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  participantList: {
    gap: spacing.sm,
  },
  participantCard: { gap: spacing.xs },
  replacementControl: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  replacementLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  replacementOption: { paddingVertical: 12, paddingHorizontal: spacing.sm, minHeight: 44 },
  replacementText: { color: colors.foreground, fontSize: 13 },
  replacementSelected: { color: colors.primary, fontWeight: '800' },
  sectionLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  winnerChip: {
    borderColor: colors.amber,
    backgroundColor: colors.warningSurface,
  },
  winConditionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  winConditionChip: {
    minWidth: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  winConditionChipSelected: {
    borderColor: colors.selectionBorder,
    backgroundColor: colors.selectionTint,
  },
  chipLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipLabelSelected: {
    color: colors.foreground,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  stickyActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.modalSurface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    minWidth: 132,
  },
});
