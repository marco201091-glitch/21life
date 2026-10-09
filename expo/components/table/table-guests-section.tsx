import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommanderArt } from '@/components/deck/commander-art';
import { Button } from '@/components/ui/button';
import { colors } from '@/constants/theme';
import type { ArenaGuest } from '@/lib/arena-participants';

type TableGuestsSectionProps = {
  guests: ArenaGuest[];
  canManage: boolean;
  labels: {
    guestManagement: string;
    addGuest: string;
    noGuestsBody: string;
    guestBadge: string;
    upgradeGuest: string;
    addDeckToGuest: string;
    deleteGuest: string;
  };
  onAddGuest: () => void;
  onAddDeckToGuest: (guestId: string) => void;
  onDeleteGuest: (guestId: string) => void;
  onUpgradeGuest: (guestId: string) => void;
};

export function TableGuestsSection({
  guests,
  canManage,
  labels,
  onAddGuest,
  onAddDeckToGuest,
  onDeleteGuest,
  onUpgradeGuest,
}: TableGuestsSectionProps) {
  return (
    <View style={styles.section}>
      {canManage ? (
        <Button label={labels.addGuest} onPress={onAddGuest} />
      ) : null}
      {guests.length === 0 ? (
        <Text style={styles.emptyBody}>{labels.noGuestsBody}</Text>
      ) : (
        guests.map((guest) => (
          <View key={guest.id} style={styles.guestRow}>
            <View style={styles.guestInfo}>
              <View style={styles.guestTitleRow}>
                <Text style={styles.guestName}>{guest.display_name}</Text>
                <Text style={styles.guestBadge}>{labels.guestBadge}</Text>
              </View>
              {(guest.arena_guest_decks || []).map((deck) => (
                <View key={deck.id} style={styles.guestDeckRow}>
                  <CommanderArt uri={deck.commander_image} alt={deck.commander} size="xs" />
                  <View style={styles.guestDeckInfo}>
                    <Text style={styles.guestDeckName} numberOfLines={1}>{deck.name}</Text>
                    <Text style={styles.guestDeckCommander} numberOfLines={1}>{deck.commander}</Text>
                  </View>
                </View>
              ))}
            </View>
            {canManage ? (
              <View style={styles.guestActions}>
                <Pressable onPress={() => onUpgradeGuest(guest.id)} hitSlop={4} accessibilityRole="button" accessibilityLabel={labels.upgradeGuest} style={({ pressed }) => [styles.guestActionButton, styles.upgradeActionButton, pressed && styles.guestActionButtonPressed]}>
                  <Ionicons name="link-outline" size={24} color={colors.successBright} />
                </Pressable>
                <Pressable
                  onPress={() => onAddDeckToGuest(guest.id)}
                  accessibilityLabel={labels.addDeckToGuest}
                  hitSlop={4}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.guestActionButton,
                    pressed && styles.guestActionButtonPressed,
                  ]}
                >
                  <Ionicons name="add-circle-outline" size={24} color={colors.primaryMuted} />
                </Pressable>
                <Pressable
                  onPress={() => onDeleteGuest(guest.id)}
                  accessibilityLabel={labels.deleteGuest}
                  hitSlop={4}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.guestActionButton,
                    pressed && styles.guestActionButtonPressed,
                  ]}
                >
                  <Ionicons name="trash-outline" size={22} color={colors.muted} />
                </Pressable>
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.successSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.successBorder,
    padding: 12,
  },
  guestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  guestActionButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  guestActionButtonPressed: {
    opacity: 0.66,
    transform: [{ scale: 0.96 }],
  },
  upgradeActionButton: { borderColor: colors.successBorder, backgroundColor: colors.successSurface },
  guestInfo: {
    flex: 1,
    gap: 4,
  },
  guestTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guestName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  guestBadge: {
    color: colors.successBright,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  guestDeckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  guestDeckInfo: {
    flex: 1,
    gap: 1,
  },
  guestDeckName: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600',
  },
  guestDeckCommander: {
    color: colors.muted,
    fontSize: 11,
  },
});
