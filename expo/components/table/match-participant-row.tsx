import { useLanguage } from '@/contexts/language-context';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DeckImage } from '@/components/deck/deck-image';
import { DeckCarousel, useDeckCarouselCardWidth } from '@/components/ui/deck-carousel';
import { Input } from '@/components/ui/input';
import { colors, spacing } from '@/constants/theme';
import type { ArenaGuestDeck } from '@/lib/arena-participants';
import type { ParticipantKey } from '@/lib/participant-keys';

export type DeckOption = {
  id: string;
  name: string;
  commander: string;
  commander_image: string | null;
  bracket: string | null;
  source_type?: string | null;
  is_favorite?: boolean;
};

type MatchParticipantRowProps = {
  participantKey: ParticipantKey;
  displayName: string;
  isGuest?: boolean;
  deckCount: number;
  selected: boolean;
  selectedDeck: DeckOption | null;
  deckListHidden: boolean;
  searchValue: string;
  selectedDeckId: string;
  filteredDecks: DeckOption[];
  labels: {
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
  onToggle: () => void;
  onSearchChange: (value: string) => void;
  onToggleDeckList: () => void;
  onSelectDeck: (deckId: string) => void;
  readOnly?: boolean;
};

function sourceTone(sourceType: string | null | undefined): { bg: string; text: string } {
  if (sourceType === 'archidekt') return { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' };
  if (sourceType === 'moxfield') return { bg: colors.selectionTintStrong, text: colors.primaryMuted };
  return { bg: colors.surfaceMuted, text: colors.muted };
}

export function MatchParticipantRow({
  displayName,
  isGuest = false,
  deckCount,
  selected,
  selectedDeck,
  deckListHidden,
  searchValue,
  selectedDeckId,
  filteredDecks,
  labels,
  onToggle,
  onSearchChange,
  onToggleDeckList,
  onSelectDeck,
  readOnly = false,
}: MatchParticipantRowProps) {
  const { language } = useLanguage();
  const deckCardWidth = useDeckCarouselCardWidth();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && !readOnly && styles.rowPressed,
      ]}
      onPress={() => {
        if (!readOnly && !selected) onToggle();
      }}
      disabled={readOnly}
    >
      <View style={styles.header}>
        {!readOnly ? (
          <Pressable
            style={[styles.checkbox, selected && styles.checkboxSelected]}
            onPress={onToggle}
            hitSlop={6}
          >
            {selected ? <Ionicons name="checkmark" size={12} color={colors.foreground} /> : null}
          </Pressable>
        ) : (
          <View style={styles.readOnlySpacer} />
        )}

        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
            {isGuest ? (
              <View style={styles.guestBadge}>
                <Text style={styles.guestBadgeText}>{labels.guestBadge}</Text>
              </View>
            ) : null}
            {deckCount > 0 ? (
              <Text style={styles.deckCount}>{labels.deckCount(deckCount)}</Text>
            ) : null}
          </View>
          {selectedDeck ? (
            <Text style={styles.selectedDeck} numberOfLines={2}>
              {selectedDeck.name === selectedDeck.commander
                ? selectedDeck.name
                : `${selectedDeck.name} — ${selectedDeck.commander}`}
            </Text>
          ) : null}
        </View>
      </View>

      {selected && deckCount > 0 ? (
        <View style={styles.deckControls}>
          <Input
            icon="search-outline"
            value={searchValue}
            onChangeText={onSearchChange}
            placeholder={labels.searchPlaceholder}
            autoCapitalize="none"
            returnKeyType="search"
          />
          <Pressable
            style={({ pressed }) => [styles.toggleButton, pressed && styles.toggleButtonPressed]}
            onPress={(event) => {
              event.stopPropagation();
              onToggleDeckList();
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={deckListHidden ? labels.showDeckList : labels.hideDeckList}
          >
            <Ionicons
              name={deckListHidden ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={colors.primaryMuted}
            />
            <Text style={styles.toggleButtonText}>
              {deckListHidden ? labels.showDeckList : labels.hideDeckList}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {selected && deckCount > 0 ? (
        <View style={styles.deckArea}>
          {deckListHidden ? (
            <Text style={styles.hiddenHint}>
              {selectedDeck ? labels.deckListHiddenSelected : labels.deckListHiddenEmpty}
            </Text>
          ) : (
            <>
              <Text style={styles.selectPrompt}>{labels.selectDeckPrompt}</Text>
              {filteredDecks.length > 0 ? (
                <DeckCarousel
                  itemCount={filteredDecks.length}
                  swipeHint={labels.swipeDecksHint}
                >
                  {filteredDecks.map((deck) => {
                    const isSelected = selectedDeckId === deck.id;
                    const tone = sourceTone(deck.source_type);
                    const showMeta = Boolean(deck.source_type || deck.bracket);
                    return (
                      <Pressable
                        key={deck.id}
                        style={({ pressed }) => [
                          styles.deckCard,
                          { width: deckCardWidth },
                          isSelected && styles.deckCardSelected,
                          pressed && styles.deckCardPressed,
                        ]}
                        onPress={() => onSelectDeck(deck.id === selectedDeckId ? '' : deck.id)}
                      >
                        <View style={styles.deckMain}>
                          <DeckImage
                            uri={deck.commander_image}
                            alt={deck.commander}
                            style={styles.deckArt}
                            containerStyle={styles.deckArt}
                            showLoader
                          />
                          <View style={styles.deckInfo}>
                            <Text style={styles.deckName} numberOfLines={2}>{deck.name}</Text>
                            {deck.commander !== deck.name ? (
                              <Text style={styles.deckCommander} numberOfLines={2}>{deck.commander}</Text>
                            ) : null}
                            {showMeta ? (
                              <View style={styles.deckMeta}>
                                {deck.source_type ? (
                                  <View style={[styles.sourceBadge, { backgroundColor: tone.bg }]}>
                                    <Text style={[styles.sourceText, { color: tone.text }]}>
                                      {deck.source_type === 'occasional' ? (language === 'it' ? 'Mazzo occasionale' : 'Occasional deck') : deck.source_type}
                                    </Text>
                                  </View>
                                ) : null}
                                {deck.bracket ? (
                                  <View style={styles.bracketBadge}>
                                    <Text style={styles.bracketText}>B{deck.bracket}</Text>
                                  </View>
                                ) : null}
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </DeckCarousel>
              ) : (
                <Text style={styles.hiddenHint}>{labels.noDecksMatchSearch}</Text>
              )}
            </>
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

export function toDeckOption(deck: DeckOption | ArenaGuestDeck): DeckOption {
  return {
    id: deck.id,
    name: deck.name,
    commander: deck.commander,
    commander_image: deck.commander_image,
    bracket: deck.bracket,
    source_type: 'source_type' in deck ? deck.source_type : 'guest',
    is_favorite: 'is_favorite' in deck ? Boolean(deck.is_favorite) : false,
  };
}

const styles = StyleSheet.create({
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardInset,
    padding: spacing.md,
    gap: spacing.md,
  },
  rowSelected: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.selectionTint,
  },
  rowPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.992 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  readOnlySpacer: {
    width: 20,
  },
  headerText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  displayName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  guestBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  guestBadgeText: {
    color: '#fde68a',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  deckCount: {
    color: colors.muted,
    fontSize: 12,
  },
  selectedDeck: {
    color: colors.primaryMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  deckControls: {
    gap: spacing.sm,
    marginLeft: 28,
  },
  toggleButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    minWidth: 112,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.selectionBorder,
    backgroundColor: colors.selectionTint,
    paddingHorizontal: spacing.md,
  },
  toggleButtonPressed: { opacity: 0.72 },
  toggleButtonText: { color: colors.primaryMuted, fontSize: 13, fontWeight: '800' },
  deckArea: {
    gap: spacing.sm,
    marginLeft: 28,
  },
  selectPrompt: {
    color: colors.muted,
    fontSize: 12,
  },
  hiddenHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  deckCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    minHeight: 108,
    overflow: 'hidden',
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  deckMain: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  deckCardSelected: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.selectionTint,
  },
  deckCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  deckArt: {
    width: 72,
    height: 96,
    borderRadius: 8,
    flexShrink: 0,
  },
  deckInfo: {
    flex: 1,
    gap: 4,
    minWidth: 0,
    justifyContent: 'flex-start',
  },
  deckName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  deckCommander: {
    color: colors.primaryMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  deckMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  sourceBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  bracketBadge: {
    borderRadius: 4,
    backgroundColor: colors.selectionTint,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bracketText: {
    color: colors.primaryMuted,
    fontSize: 11,
    fontWeight: '700',
  },
});
