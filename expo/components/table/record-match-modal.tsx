import { OccasionalDeckForm } from '@/components/table/occasional-deck-form';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { RichTextInput } from '@/components/ui/rich-text-input';
import { Modal } from '@/components/ui/modal';
import { colors, spacing } from '@/constants/theme';
import type { ArenaGuest } from '@/lib/arena-participants';
import { getLastDeckSelectionForParticipant } from '@/lib/arena-participants';
import { getPreferredDeckId } from '@/lib/arena-deck-selection';
import { matchDateToIso, toMatchDateValue } from '@/lib/match-datetime';
import { toGuestParticipantKey, toUserParticipantKey, type ParticipantKey } from '@/lib/participant-keys';
import { getProfileDisplayName } from '@/lib/profile-display';
import type { ArenaMatch, ArenaProfile, MemberDeck } from '@/lib/types/arena';
import {
  MatchParticipantRow,
  toDeckOption,
  type DeckOption,
} from '@/components/table/match-participant-row';

type RecordMatchModalProps = {
  groupId: string;
  visible: boolean;
  saving: boolean;
  members: ArenaProfile[];
  guests: ArenaGuest[];
  decks: MemberDeck[];
  matches: ArenaMatch[];
  labels: {
    title: string;
    hint: string;
    selectPlayers: string;
    selectGuests: string;
    selectWinner: string;
    winCondition: string;
    winLastStanding: string;
    winCombo: string;
    winConcession: string;
    winAlternate: string;
    winOther: string;
    draw: string;
    battleDate: string;
    notes: string;
    notesPlaceholder: string;
    richTextHint: string;
    selectDeck: string;
    cancel: string;
    save: string;
    saving: string;
    minPlayersError: string;
    winnerError: string;
    deckError: string;
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
  };
  onClose: () => void;
  onSave: (input: {
    selectedParticipantKeys: string[];
    winnerKey: string | null;
    isDraw: boolean;
    participantDecks: Record<string, string>;
    matchPlayedAtIso: string;
    matchNotes: string;
    winCondition: NonNullable<ArenaMatch['win_condition']>;
  }) => Promise<void>;
  onError: (message: string) => void;
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

export function RecordMatchModal({
  groupId,
  visible,
  saving,
  members,
  guests,
  decks,
  matches,
  labels,
  onClose,
  onSave,
  onError,
}: RecordMatchModalProps) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [winnerKey, setWinnerKey] = useState('');
  const [isDraw, setIsDraw] = useState(false);
  const [winCondition, setWinCondition] = useState<NonNullable<ArenaMatch['win_condition']>>('other');
  const [participantDecks, setParticipantDecks] = useState<Record<string, string>>({});
  const [matchPlayedAt, setMatchPlayedAt] = useState(toMatchDateValue());
  const [matchNotes, setMatchNotes] = useState('');
  const [deckSearch, setDeckSearch] = useState<Record<string, string>>({});
  const [hiddenDeckLists, setHiddenDeckLists] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    if (!visible) return;
    setSelectedKeys([]);
    setWinnerKey('');
    setIsDraw(false);
    setWinCondition('other');
    setParticipantDecks({});
    setMatchPlayedAt(toMatchDateValue());
    setMatchNotes('');
    setDeckSearch({});
    setHiddenDeckLists({});
  }, [visible]);

  const toggleParticipant = (key: string, deckOptions: DeckOption[]) => {
    if (creatingDeck) return;
    setSelectedKeys((current) => {
      if (current.includes(key)) {
        const next = current.filter((value) => value !== key);
        if (winnerKey === key) setWinnerKey('');
        setParticipantDecks((decksState) => {
          const copy = { ...decksState };
          delete copy[key];
          return copy;
        });
        setDeckSearch((state) => {
          const copy = { ...state };
          delete copy[key];
          return copy;
        });
        setHiddenDeckLists((state) => {
          const copy = { ...state };
          delete copy[key];
          return copy;
        });
        return next;
      }

      const next = [...current, key];
      const preferredDeck = getPreferredDeckId(
        deckOptions,
        getLastDeckSelectionForParticipant(key as ParticipantKey, matches),
      );
      if (preferredDeck) {
        setParticipantDecks((state) => ({ ...state, [key]: preferredDeck }));
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedKeys.length < 2) {
      onError(labels.minPlayersError);
      return;
    }
    if (!isDraw && !winnerKey) {
      onError(labels.winnerError);
      return;
    }

    const missingDeck = selectedKeys.find((key) => {
      const deckOptions = getDeckOptions(key, decksByUser, guests);
      return deckOptions.length > 0 && !participantDecks[key];
    });

    if (missingDeck) {
      onError(labels.deckError);
      return;
    }

    const playedAtIso = matchDateToIso(matchPlayedAt);
    if (!playedAtIso) {
      onError(labels.dateError);
      return;
    }

    await onSave({
      selectedParticipantKeys: selectedKeys,
      winnerKey: isDraw ? null : winnerKey,
      isDraw,
      participantDecks,
      matchPlayedAtIso: playedAtIso,
      matchNotes,
      winCondition,
    });
  };

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

  return (
    <Modal visible={visible} onClose={() => { if (!creatingDeck) onClose(); }} footer={(        <View style={styles.actions}>
          <Button label={labels.cancel} variant="ghost" disabled={creatingDeck} onPress={onClose} style={styles.actionButton} />
          <Button
            label={saving ? labels.saving : labels.save}
            disabled={saving || creatingDeck}
            onPress={handleSave}
            style={styles.actionButton}
          />
        </View>)} >
      <View style={styles.content}>
        <Text style={styles.title}>{labels.title}</Text>
        <Text style={styles.hint}>{labels.hint}</Text>

        <Text style={styles.sectionLabel}>{labels.selectPlayers}</Text>
        <View style={styles.participantList}>
          {members.map((member) => {
            const key = toUserParticipantKey(member.id);
            const deckOptions = getDeckOptions(key, decksByUser, guests);
            const selected = selectedKeys.includes(key);
            const selectedDeckId = participantDecks[key] || '';
            const selectedDeck = deckOptions.find((deck) => deck.id === selectedDeckId) || null;

            return (
              <View key={member.id}>
              <MatchParticipantRow
                participantKey={key}
                displayName={getProfileDisplayName(member)}
                deckCount={deckOptions.length}
                selected={selected}
                readOnly={creatingDeck}
                selectedDeck={selectedDeck}
                deckListHidden={Boolean(hiddenDeckLists[key])}
                searchValue={deckSearch[key] || ''}
                selectedDeckId={selectedDeckId}
                filteredDecks={filterDecks(deckOptions, deckSearch[key] || '')}
                labels={participantRowLabels}
                onToggle={() => toggleParticipant(key, deckOptions)}
                onSearchChange={(value) => setDeckSearch((state) => ({ ...state, [key]: value }))}
                onToggleDeckList={() =>
                  setHiddenDeckLists((state) => ({ ...state, [key]: !state[key] }))
                }
                onSelectDeck={(deckId) => {
                    if (creatingDeck) return;
                  setParticipantDecks((state) => ({ ...state, [key]: deckId }));
                }}
              />
              {selected ? <OccasionalDeckForm disabled={creatingDeck} onSavingChange={saving => setCreatingDecks(current => ({ ...current, [key]: saving }))} groupId={groupId} userId={member.id} selectedDeckId={selectedDeckId} onCreated={deck => {
                setOccasionalDecks(current => [...current.filter(item => item.id !== deck.id), deck]);
                setParticipantDecks(current => ({ ...current, [key]: deck.id }));
              }} /> : null}
              </View>
            );
          })}
        </View>

        {guests.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>{labels.selectGuests}</Text>
            <View style={styles.participantList}>
              {guests.map((guest) => {
                const key = toGuestParticipantKey(guest.id);
                const deckOptions = getDeckOptions(key, decksByUser, guests);
                const selected = selectedKeys.includes(key);
                const selectedDeckId = participantDecks[key] || '';
                const selectedDeck = deckOptions.find((deck) => deck.id === selectedDeckId) || null;

                return (
                  <MatchParticipantRow
                    key={guest.id}
                    participantKey={key}
                    displayName={guest.display_name}
                    isGuest
                    deckCount={deckOptions.length}
                    selected={selected}
                readOnly={creatingDeck}
                    selectedDeck={selectedDeck}
                    deckListHidden={Boolean(hiddenDeckLists[key])}
                    searchValue={deckSearch[key] || ''}
                    selectedDeckId={selectedDeckId}
                    filteredDecks={filterDecks(deckOptions, deckSearch[key] || '')}
                    labels={participantRowLabels}
                    onToggle={() => toggleParticipant(key, deckOptions)}
                    onSearchChange={(value) => setDeckSearch((state) => ({ ...state, [key]: value }))}
                    onToggleDeckList={() =>
                      setHiddenDeckLists((state) => ({ ...state, [key]: !state[key] }))
                    }
                    onSelectDeck={(deckId) => {
                    if (creatingDeck) return;
                      setParticipantDecks((state) => ({ ...state, [key]: deckId }));
                    }}
                  />
                );
              })}
            </View>
          </>
        ) : null}

        {selectedKeys.length > 0 ? (
          <>
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
              {selectedKeys.map((key) => {
                const selected = winnerKey === key;
                const label = key.startsWith('guest:')
                  ? guests.find((guest) => toGuestParticipantKey(guest.id) === key)?.display_name || key
                  : (() => {
                      const member = members.find((item) => toUserParticipantKey(item.id) === key);
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
            <View style={styles.chipRow}>
              {([
                ['last_standing', labels.winLastStanding],
                ['combo', labels.winCombo],
                ['concession', labels.winConcession],
                ['alternate_card', labels.winAlternate],
                ['other', labels.winOther],
              ] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  style={[styles.chip, winCondition === value && styles.conditionChip]}
                  onPress={() => setWinCondition(value)}
                >
                  <Text style={[styles.chipLabel, winCondition === value && styles.chipLabelSelected]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            </>
            ) : null}
          </>
        ) : null}

        <DateField
          label={labels.battleDate}
          value={matchPlayedAt}
          onChange={setMatchPlayedAt}
          maximumDate={new Date()}
          testID="record-match-date"
        />
        <RichTextInput
          label={labels.notes}
          value={matchNotes}
          onChangeText={setMatchNotes}
          placeholder={labels.notesPlaceholder}
          hint={labels.richTextHint}
        />


      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '700',
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
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
  sectionLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  participantList: {
    gap: spacing.sm,
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
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  winnerChip: {
    borderColor: '#fbbf24',
    backgroundColor: colors.warningSurface,
  },
  conditionChip: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
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
    marginTop: spacing.xs,
  },
  actionButton: {
    flex: 1,
    minWidth: 132,
  },
});
