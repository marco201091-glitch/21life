import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommanderPicker } from '@/components/commander/commander-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { colors } from '@/constants/theme';
import type { ArenaGuest } from '@/lib/arena-participants';
import type { CommanderSearchResult } from '@/lib/commander-types';

export type GuestModalMode = 'pick-existing' | 'create-new' | 'add-deck-to-guest';

type GuestSaveInput = {
  displayName: string;
  commander: CommanderSearchResult;
  partnerCommander?: CommanderSearchResult | null;
  deckName: string;
  selectedArtUrl?: string | null;
};

type AddGuestModalProps = {
  visible: boolean;
  /** Render within an existing native modal. */
  embedded?: boolean;
  saving: boolean;
  guests: ArenaGuest[];
  initialMode?: GuestModalMode;
  initialGuestId?: string | null;
  labels: {
    title: string;
    addDeckTitle: string;
    hint: string;
    addDeckHint: string;
    pickExistingHint: string;
    existingGuests: string;
    createNewGuest: string;
    backToExistingGuests: string;
    guestName: string;
    guestNamePlaceholder: string;
    deckName: string;
    deckNamePlaceholder: string;
    searchCommander: string;
    searchPlaceholder: string;
    searching: string;
    noResults: string;
    selectedCommander: string;
    partnerHint: string;
    chooseCommanderArt: string;
    loadingArts: string;
    noArtsFound: string;
    printing: string;
    cancel: string;
    save: string;
    saveDeck: string;
    saving: string;
    nameRequired: string;
    commanderRequired: string;
    decks: string;
    addDeckToGuest: string;
  };
  onClose: () => void;
  onSaveCreate: (input: GuestSaveInput) => Promise<void>;
  onSaveAddDeck: (input: GuestSaveInput & { guestId: string }) => Promise<void>;
  onPickExisting: (guestId: string) => void;
  onError: (message: string) => void;
};

export function AddGuestModal({
  visible,
  embedded = false,
  saving,
  guests,
  initialMode,
  initialGuestId,
  labels,
  onClose,
  onSaveCreate,
  onSaveAddDeck,
  onPickExisting,
  onError,
}: AddGuestModalProps) {
  const [mode, setMode] = useState<GuestModalMode>('pick-existing');
  const [guestName, setGuestName] = useState('');
  const [deckName, setDeckName] = useState('');
  const [guestTargetId, setGuestTargetId] = useState<string | null>(null);
  const [selectedCommander, setSelectedCommander] = useState<CommanderSearchResult | null>(null);
  const [selectedPartnerCommander, setSelectedPartnerCommander] = useState<CommanderSearchResult | null>(null);
  const [selectedArtUrl, setSelectedArtUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    const nextMode = guests.length === 0
      ? 'create-new'
      : (initialMode || 'pick-existing');

    setMode(nextMode);
    setGuestTargetId(initialGuestId || null);
    setGuestName(
      initialGuestId
        ? guests.find((guest) => guest.id === initialGuestId)?.display_name || ''
        : '',
    );
    setDeckName('');
    setSelectedCommander(null);
    setSelectedPartnerCommander(null);
    setSelectedArtUrl(null);
  }, [visible, guests, initialMode, initialGuestId]);

  const openAddDeckMode = (guest: ArenaGuest) => {
    setGuestTargetId(guest.id);
    setGuestName(guest.display_name);
    setDeckName('');
    setSelectedCommander(null);
    setSelectedPartnerCommander(null);
    setSelectedArtUrl(null);
    setMode('add-deck-to-guest');
  };

  const commanderLabels = {
    deckName: labels.deckName,
    deckNamePlaceholder: labels.deckNamePlaceholder,
    searchCommander: labels.searchCommander,
    searchPlaceholder: labels.searchPlaceholder,
    searching: labels.searching,
    noResults: labels.noResults,
    selectedCommander: labels.selectedCommander,
    partnerHint: labels.partnerHint,
    chooseCommanderArt: labels.chooseCommanderArt,
    loadingArts: labels.loadingArts,
    noArtsFound: labels.noArtsFound,
    printing: labels.printing,
  };

  const handleSave = async () => {
    if (!selectedCommander) {
      onError(labels.commanderRequired);
      return;
    }

    if (mode === 'add-deck-to-guest') {
      if (!guestTargetId) {
        onError(labels.commanderRequired);
        return;
      }

      await onSaveAddDeck({
        guestId: guestTargetId,
        displayName: guestName,
        commander: selectedCommander,
        partnerCommander: selectedPartnerCommander,
        deckName: deckName.trim(),
        selectedArtUrl,
      });
      return;
    }

    if (!guestName.trim()) {
      onError(labels.nameRequired);
      return;
    }

    await onSaveCreate({
      displayName: guestName.trim(),
      commander: selectedCommander,
      partnerCommander: selectedPartnerCommander,
      deckName: deckName.trim(),
      selectedArtUrl,
    });
  };

  const title = mode === 'add-deck-to-guest' ? labels.addDeckTitle : labels.title;
  const hint = mode === 'add-deck-to-guest'
    ? labels.addDeckHint
    : mode === 'pick-existing'
      ? labels.pickExistingHint
      : labels.hint;

  const content = (
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint}>{hint}</Text>

        {mode === 'pick-existing' && guests.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{labels.existingGuests}</Text>
            {guests.map((guest) => (
              <View key={guest.id} style={styles.guestRow}>
                <Pressable style={styles.guestPickButton} onPress={() => onPickExisting(guest.id)}>
                  <Text style={styles.guestName}>{guest.display_name}</Text>
                  <Text style={styles.guestMeta}>
                    {guest.arena_guest_decks?.length || 0} {labels.decks}
                  </Text>
                </Pressable>
                <Pressable style={styles.addDeckButton} onPress={() => openAddDeckMode(guest)}>
                  <Ionicons name="add" size={18} color={colors.primaryMuted} />
                </Pressable>
              </View>
            ))}
            <Button label={labels.createNewGuest} variant="ghost" onPress={() => setMode('create-new')} />
          </View>
        ) : null}

        {(mode === 'create-new' || mode === 'add-deck-to-guest' || guests.length === 0) ? (
          <View style={styles.section}>
            {guests.length > 0 && mode !== 'add-deck-to-guest' ? (
              <Button
                label={labels.backToExistingGuests}
                variant="ghost"
                onPress={() => setMode('pick-existing')}
              />
            ) : null}
            {guests.length > 0 && mode === 'add-deck-to-guest' ? (
              <Button
                label={labels.backToExistingGuests}
                variant="ghost"
                onPress={() => {
                  setGuestTargetId(null);
                  setMode('pick-existing');
                }}
              />
            ) : null}

            <Input
              label={labels.guestName}
              value={guestName}
              onChangeText={setGuestName}
              placeholder={labels.guestNamePlaceholder}
              editable={!saving && mode !== 'add-deck-to-guest'}
            />

            <CommanderPicker
              deckName={deckName}
              onDeckNameChange={setDeckName}
              selectedCommander={selectedCommander}
              onSelectCommander={setSelectedCommander}
              selectedPartnerCommander={selectedPartnerCommander}
              onSelectPartnerCommander={setSelectedPartnerCommander}
              selectedArtUrl={selectedArtUrl}
              onSelectArtUrl={setSelectedArtUrl}
              disabled={saving}
              labels={commanderLabels}
            />

            <View style={styles.actions}>
              <Button label={labels.cancel} variant="ghost" onPress={onClose} style={styles.actionButton} />
              <Button
                label={saving ? labels.saving : mode === 'add-deck-to-guest' ? labels.saveDeck : labels.save}
                disabled={saving || !selectedCommander || (mode !== 'add-deck-to-guest' && !guestName.trim())}
                onPress={handleSave}
                style={styles.actionButton}
              />
            </View>
          </View>
        ) : null}
      </View>
  );
  return embedded ? content : <Modal visible={visible} onClose={onClose}>{content}</Modal>;
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingBottom: 8,
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
  section: {
    gap: 12,
  },
  sectionLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: 4,
  },
  guestPickButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  guestName: {
    color: colors.foreground,
    fontWeight: '600',
    fontSize: 14,
  },
  guestMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  addDeckButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    minWidth: 132,
  },
});
