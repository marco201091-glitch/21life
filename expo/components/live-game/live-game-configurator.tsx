import { OccasionalDeckForm } from '@/components/table/occasional-deck-form';
import type { MemberDeck } from '@/lib/types/arena';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CompactDeckCard } from '@/components/deck/compact-deck-card';
import type { DeckOption } from '@/components/table/match-participant-row';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ModalHeader } from '@/components/ui/modal-header';
import { colors, radii, spacing } from '@/constants/theme';
import {
  getSquareTableLayouts,
  getSeatRotation,
  getLandscapeSeatRotation,
  getViewportTableOrientation,
  type TableOrientation,
  type TableLayoutVariant,
} from '@/lib/live-game-table-layout';
import type { LiveGameSeatSetup } from '@/lib/live-game-setup';
import { matchesLiveGameDeckSearch } from '@/lib/live-game-deck-search';
import type { ParticipantKey } from '@/lib/participant-keys';
import { isCompactViewport, isTabletViewport } from '@/lib/layout';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';

export type SetupParticipant = {
  key: ParticipantKey;
  name: string;
  decks: DeckOption[];
  preferredDeckId: string | null;
};

type Labels = {
  playerCount: string;
  layout: string;
  classic: string;
  opposed: string;
  seats: string;
  seat: string;
  emptySeat: string;
  choosePlayer: string;
  chooseDeck: string;
  archidektSyncWaiting: string;
  archidektSyncCompleted: string;
  archidektSyncPartial: string;
  archidektSyncRetry: string;
  archidektSyncFailed: string;
  searchDecks: string;
  noDecksMatchSearch: string;
  clearSeat: string;
  confirm: string;
  reset: string;
  startingLife: string;
  custom: string;
  back: string;
  next: string;
  start: string;
  starting: string;
};

type Props = {
  groupId: string;
  onOccasionalDeckCreated: (deck: MemberDeck) => void;
  playerCount: number;
  layoutVariant: TableLayoutVariant;
  seats: LiveGameSeatSetup[];
  startingLife: number;
  participants: SetupParticipant[];
  labels: Labels;
  onPlayerCountChange: (count: number) => void;
  onLayoutChange: (variant: TableLayoutVariant) => void;
  onStartingLifeChange: (life: number) => void;
  onSelectParticipant?: (participantKey: ParticipantKey) => void;
  archidektSyncRequest?: { userId: string; status: 'syncing' | 'completed' | 'partial' | 'failed' } | null;
  onAssignSeat: (index: number, participantKey: ParticipantKey | null, deckId: string | null) => void;
  onReset: () => void;
  onStart: () => void;
  starting: boolean;
};

const SEAT_COLORS = ['#67e8f9', '#c4b5fd', '#fda4af', '#fcd34d', '#86efac', '#fdba74'];

function LayoutPreview({ count, variant, orientation }: {
  count: number; variant: TableLayoutVariant; orientation: TableOrientation;
}) {
  const width = 260;
  const height = 220;
  const table = { left: 43, top: 39, width: 174, height: 142 };
  const seats = getSquareTableLayouts(count, 400, 500, variant, orientation).map((seat, index) => ({
    index,
    rotation: orientation === 'landscape'
      ? getLandscapeSeatRotation(seat, 400)
      : getSeatRotation(seat.role, count, variant),
  }));
  return <View style={{ width, height, alignSelf: 'center' }} accessible={false}>
    <View style={[styles.previewTable, table]}>
      <View style={styles.previewTableInset} />
      <Ionicons name="sparkles-outline" size={18} color="#46685c" />
    </View>
    {seats.map((seat) => {
      const side = seats.filter((entry) => entry.rotation === seat.rotation);
      const fraction = (side.indexOf(seat) + 1) / (side.length + 1);
      const vertical = Math.abs(seat.rotation) === 90;
      const x = vertical ? (seat.rotation === 90 ? 20 : 240) : table.left + table.width * fraction;
      const y = vertical ? table.top + table.height * fraction : (seat.rotation === 180 ? 17 : 203);
      const cardX = vertical ? (seat.rotation === 90 ? 66 : 194) : x;
      const cardY = vertical ? y : (seat.rotation === 180 ? 63 : 157);
      const color = SEAT_COLORS[seat.index];
      return <View key={seat.index} style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.previewLink, vertical
          ? { left: Math.min(x, cardX), top: y, width: Math.abs(x - cardX), height: 1, backgroundColor: color }
          : { left: x, top: Math.min(y, cardY), width: 1, height: Math.abs(y - cardY), backgroundColor: color }]} />
        <View style={[styles.previewPerson, { left: x - 15, top: y - 15, borderColor: color }]}>
          <Ionicons name="person" size={17} color={color} />
        </View>
        <View style={[styles.previewCard, { left: cardX - 15, top: cardY - 18, borderColor: color, transform: [{ rotate: `${seat.rotation}deg` }] }]}>
          <View style={[styles.previewCardArt, { backgroundColor: color }]} />
          <Text style={[styles.previewCardNumber, { color }]}>{seat.index + 1}</Text>
          <View style={[styles.previewCardLine, { backgroundColor: color }]} />
        </View>
      </View>;
    })}
  </View>;
}

export function LiveGameConfigurator({
  groupId,
  onOccasionalDeckCreated,
  playerCount,
  layoutVariant,
  seats,
  startingLife,
  participants,
  labels,
  onPlayerCountChange,
  onLayoutChange,
  onStartingLifeChange,
  onSelectParticipant,
  archidektSyncRequest,
  onAssignSeat,
  onReset,
  onStart,
  starting,
}: Props) {
  const { featureFlags } = useRuntimeConfig();
  const deckSearchEnabled = featureFlags?.deckWizardSearch !== false;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const compact = isCompactViewport(windowWidth);
  const tablet = isTabletViewport(windowWidth);
  const previewOrientation = getViewportTableOrientation(windowWidth, windowHeight);
  const [editingSeat, setEditingSeat] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [customLife, setCustomLife] = useState(String(startingLife));
  const lifePresets = [20, 25, 30, 40, 60];
  useEffect(() => {
    if (playerCount === 2 && layoutVariant !== 'classic') onLayoutChange('classic');
  }, [playerCount, layoutVariant, onLayoutChange]);
  const isCustomLife = !lifePresets.includes(startingLife);
  const setupComplete = seats.length === playerCount
    && seats.every((seat) => Boolean(seat.participantKey && seat.deckId));
  const assignedSeats = seats.filter((seat) => Boolean(seat.participantKey && seat.deckId)).length;
  useEffect(() => setCustomLife(String(startingLife)), [startingLife]);
  const currentSeat = editingSeat === null ? null : seats[editingSeat];
  const [draftPlayer, setDraftPlayer] = useState<ParticipantKey | null>(null);
  const draftPlayerRef = useRef(draftPlayer);
  const [draftDeck, setDraftDeck] = useState<string | null>(null);
  const [deckSearch, setDeckSearch] = useState('');
  const [creatingDeck, setCreatingDeck] = useState(false);
  const participantByKey = useMemo(
    () => new Map(participants.map((participant) => [participant.key, participant])),
    [participants],
  );

  const openSeat = (index: number) => {
    if (creatingDeck) return;
    const seat = seats[index];
    setEditingSeat(index);
    draftPlayerRef.current = seat?.participantKey ?? null;
    setDraftPlayer(seat?.participantKey ?? null);
    setDraftDeck(seat?.deckId ?? null);
    setDeckSearch('');
  };

  const selectPlayer = (participant: SetupParticipant) => {
    if (creatingDeck) return;
    if (draftPlayer !== participant.key) onSelectParticipant?.(participant.key);
    draftPlayerRef.current = participant.key;
    setDraftPlayer(participant.key);
    const preferred = participant.decks.some((deck) => deck.id === participant.preferredDeckId)
        ? participant.preferredDeckId
        : null;
    setDraftDeck(preferred);
    setDeckSearch('');
  };

  const selectedParticipant = draftPlayer ? participantByKey.get(draftPlayer) ?? null : null;
  const selectedSyncStatus = draftPlayer?.startsWith('user:')
    && archidektSyncRequest?.userId === draftPlayer.slice('user:'.length)
    ? archidektSyncRequest.status : null;
  const filteredDecks = useMemo(() => {
    if (!selectedParticipant) return [];
    if (!deckSearchEnabled) return selectedParticipant.decks;
    return selectedParticipant.decks.filter((deck) => matchesLiveGameDeckSearch(deck, deckSearch));
  }, [deckSearch, deckSearchEnabled, selectedParticipant]);
  const occupiedElsewhere = new Set(
    seats
      .filter((_seat, index) => index !== editingSeat)
      .map((seat) => seat.participantKey)
      .filter(Boolean),
  );

  return (
    <View style={styles.root}>
      <View style={styles.wizardHeader}>
        <View style={styles.progressRow}>
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={[styles.progressStep, index <= step && styles.progressStepActive]}><Text style={[styles.progressNumber, index <= step && styles.progressNumberActive]}>{index + 1}</Text></View>
          ))}
        </View>
        <Pressable
          style={({ pressed }) => [styles.resetButton, pressed && styles.interactivePressed]}
          disabled={creatingDeck} onPress={() => { if (!creatingDeck) onReset(); }}
        >
          <Ionicons name="refresh-outline" size={15} color={colors.muted} />
          <Text style={styles.resetText}>{labels.reset}</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <View style={styles.stepBadge}><Text style={styles.stepText}>{step + 1}</Text></View>
        <Text style={styles.sectionTitle}>
          {[labels.playerCount, labels.startingLife, labels.layout, labels.seats][step]}
        </Text>
      </View>

      {step === 0 ? <View style={styles.choiceStage}>
        <View style={styles.choiceHero}><LayoutPreview count={playerCount} variant={playerCount === 2 ? 'classic' : layoutVariant} orientation="portrait" /></View>
        <View style={styles.countRow}>
        {[2, 3, 4, 5, 6].map((count) => (
          <Pressable
            key={count}
            disabled={creatingDeck} onPress={() => { if (!creatingDeck) onPlayerCountChange(count); }}
            style={({ pressed }) => [
              styles.countButton,
              count === playerCount && styles.countButtonActive,
              pressed && styles.interactivePressed,
            ]}
          >
            <Ionicons name="person" size={16} color={count === playerCount ? colors.primaryLight : colors.muted} />
            <Text style={[styles.countText, count === playerCount && styles.countTextActive]}>{count}</Text>
          </Pressable>
        ))}
      </View></View> : null}

      {step === 1 ? <View style={styles.lifeStep}>
        <View style={styles.lifeHero}>
          <View style={styles.lifeEmblem}><Ionicons name="heart" size={36} color="#fda4af" /></View>
          <Text style={styles.lifeHeroValue}>{startingLife}</Text>
          <Text style={styles.choiceCaption}>{labels.startingLife}</Text>
          <View style={styles.miniPlayers}>{Array.from({ length: playerCount }, (_, index) => <Ionicons key={index} name="person" size={18} color={SEAT_COLORS[index]} />)}</View>
        </View>
        <View style={styles.lifeRow}>
          {lifePresets.map((life) => (
            <Pressable
              key={life}
              disabled={creatingDeck} onPress={() => { if (!creatingDeck) onStartingLifeChange(life); }}
              style={({ pressed }) => [
                styles.lifeButton,
                startingLife === life && styles.lifeButtonActive,
                pressed && styles.interactivePressed,
              ]}
            >
                <Ionicons name="heart" size={14} color={startingLife === life ? '#fb7185' : colors.muted} />
                <Text style={[styles.countText, startingLife === life && styles.countTextActive]}>{life}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={isCustomLife ? customLife : ''}
          onChangeText={(value) => {
            setCustomLife(value);
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) onStartingLifeChange(parsed);
          }}
          placeholder={labels.custom}
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          style={[styles.customLifeInput, isCustomLife && styles.customLifeInputActive]}
        />
      </View> : null}

      {step === 2 ? <View style={styles.layoutOptions}>
        {(playerCount === 2 ? ['classic'] as const : ['classic', 'opposed'] as const).map((variant) => (
          <Pressable
            key={variant}
            accessibilityRole="radio"
            accessibilityState={{ checked: layoutVariant === variant }}
            disabled={creatingDeck} onPress={() => { if (!creatingDeck) onLayoutChange(variant); }}
            style={({ pressed }) => [
              styles.layoutOption,
              layoutVariant === variant && styles.layoutOptionActive,
              pressed && styles.interactivePressed,
            ]}
          >
            <View style={styles.layoutLabelRow}>
              <Text style={[styles.layoutLabel, layoutVariant === variant && styles.layoutLabelActive]}>
                {variant === 'classic' ? labels.classic : labels.opposed}
              </Text>
              <Ionicons
                name={layoutVariant === variant ? 'checkmark-circle' : 'ellipse-outline'}
                size={23}
                color={layoutVariant === variant ? colors.primaryLight : colors.muted}
              />
            </View>
            <LayoutPreview count={playerCount} variant={variant} orientation={playerCount === 2 ? 'portrait' : previewOrientation} />
          </Pressable>
        ))}
      </View> : null}

      {step === 3 ? <View style={styles.seatStage}>
        <View style={styles.seatStageHeader}><Ionicons name="people" size={18} color={colors.primaryLight} /><Text style={styles.seatStageTitle}>{labels.seats}</Text><View style={styles.seatProgress}><Text style={styles.seatProgressText}>{assignedSeats}/{playerCount}</Text></View></View>
        <LayoutPreview count={playerCount} variant={layoutVariant} orientation={playerCount === 2 ? 'portrait' : previewOrientation} />
        {seats.map((seat, index) => {
          const participant = seat.participantKey ? participantByKey.get(seat.participantKey) : null;
          const deck = participant?.decks.find((entry) => entry.id === seat.deckId);
          return <CompactDeckCard key={index} artUri={deck?.commander_image}
            title={participant?.name ?? `${labels.seat} ${index + 1}`}
            commander={deck?.commander ?? labels.choosePlayer}
            badge={index + 1} onPress={() => openSeat(index)}
            accessibilityLabel={`${labels.seat} ${index + 1}: ${participant?.name ?? labels.emptySeat}`}
            style={{ borderColor: SEAT_COLORS[index], borderRadius: 16 }}
            trailing={<Ionicons name={deck ? 'checkmark-circle' : 'add-circle-outline'} size={26} color={SEAT_COLORS[index]} />} />;
        })}
      </View> : null}

      <View style={styles.wizardActions}>
        {step > 0 ? (
          <Button label={labels.back} variant="outline" icon="arrow-back" disabled={creatingDeck} onPress={() => { if (!creatingDeck) setStep((value) => value - 1); }} style={styles.actionButton} />
        ) : <View style={styles.actionButton} />}
        {step < 3 ? (
          <Button label={labels.next} icon="arrow-forward" disabled={creatingDeck} onPress={() => { if (!creatingDeck) setStep((value) => value + 1); }} style={styles.actionButton} />
        ) : (
          <Button
            label={starting ? labels.starting : labels.start}
            icon="play"
            disabled={starting || creatingDeck || !setupComplete}
            onPress={onStart}
            style={styles.actionButton}
          />
        )}
      </View>

      <Modal
        visible={editingSeat !== null}
        onClose={() => { if (!creatingDeck) setEditingSeat(null); }}
        maxWidth={tablet ? 720 : 560}
      >
        <ModalHeader
          title={`${labels.seat} ${(editingSeat ?? 0) + 1}`}
          subtitle={labels.choosePlayer}
          icon="people-outline"
          onClose={() => { if (!creatingDeck) setEditingSeat(null); }}
        />
        <View style={[styles.seatPickerColumns, tablet && styles.seatPickerColumnsTablet]}>
          <ScrollView
            style={[styles.playerList, tablet && styles.playerListTablet]}
            contentContainerStyle={styles.optionListContent}
            nestedScrollEnabled
          >
            {participants.filter((participant) => !occupiedElsewhere.has(participant.key)).map((participant) => (
              <Pressable
                key={participant.key}
                disabled={creatingDeck}
                onPress={() => selectPlayer(participant)}
                style={({ pressed }) => [
                  styles.playerOption,
                  draftPlayer === participant.key && styles.playerOptionActive,
                  pressed && styles.interactivePressed,
                ]}
              >
                <Ionicons name="person-circle-outline" size={24} color={draftPlayer === participant.key ? colors.primaryLight : colors.muted} />
                <Text style={styles.playerName}>{participant.name}</Text>
                <Ionicons
                  name={draftPlayer === participant.key ? 'checkmark-circle' : 'ellipse-outline'}
                  size={21}
                  color={draftPlayer === participant.key ? colors.primaryLight : colors.muted}
                />
              </Pressable>
            ))}
          </ScrollView>
          {selectedParticipant ? (
            <View style={[styles.deckSection, tablet && styles.deckSectionTablet]}>
              <Text style={styles.deckSectionTitle}>{labels.chooseDeck}</Text>
              {selectedSyncStatus ? <View style={styles.archidektSyncNotice} accessibilityRole="text">
                {selectedSyncStatus === 'syncing'
                  ? <ActivityIndicator size="small" color={colors.primaryLight} />
                  : <Ionicons name={selectedSyncStatus === 'completed' ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={18} color={colors.primaryLight} />}
                <Text style={styles.archidektSyncText}>
                  {selectedSyncStatus === 'failed' ? labels.archidektSyncFailed
                    : selectedSyncStatus === 'completed' ? labels.archidektSyncCompleted
                      : selectedSyncStatus === 'partial' ? labels.archidektSyncPartial
                      : labels.archidektSyncWaiting}
                </Text>
                {selectedSyncStatus !== 'syncing' && onSelectParticipant ? <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={labels.archidektSyncRetry}
                  onPress={() => onSelectParticipant(selectedParticipant.key)}
                  hitSlop={8}
                ><Ionicons name="refresh-outline" size={22} color={colors.primaryLight} /></Pressable> : null}
              </View> : null}
              {deckSearchEnabled ? <View style={styles.deckSearchWrap}>
                <Ionicons name="search-outline" size={18} color={colors.muted} />
                <TextInput
                  value={deckSearch}
                  onChangeText={setDeckSearch}
                  placeholder={labels.searchDecks}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  accessibilityLabel={labels.searchDecks}
                  style={styles.deckSearchInput}
                />
                {deckSearch ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={labels.searchDecks}
                    onPress={() => setDeckSearch('')}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View> : null}
              <ScrollView style={[styles.deckList, tablet && styles.deckListTablet]} contentContainerStyle={styles.optionListContent} nestedScrollEnabled>
                {selectedParticipant.key.startsWith('user:') ? <OccasionalDeckForm onSavingChange={setCreatingDeck} key={selectedParticipant.key} groupId={groupId} userId={selectedParticipant.key.slice(5)} selectedDeckId={draftDeck || ''} onCreated={deck => {
                  onOccasionalDeckCreated(deck);
                  if (draftPlayerRef.current === `user:${deck.user_id}`) { setDraftDeck(deck.id); setDeckSearch(''); }
                }} /> : null}
                {filteredDecks.map((deck) => (
                  <CompactDeckCard
                    key={deck.id}
                    artUri={deck.commander_image}
                    title={deck.name}
                    commander={deck.commander}
                    onPress={() => { if (!creatingDeck) setDraftDeck(deck.id); }}
                    accessibilityLabel={`${labels.chooseDeck}: ${deck.name}`}
                    style={draftDeck === deck.id ? styles.deckOptionActive : undefined}
                    trailing={<Ionicons
                      name={draftDeck === deck.id ? 'checkmark-circle' : 'ellipse-outline'}
                      size={23}
                      color={draftDeck === deck.id ? colors.primaryLight : colors.muted}
                    />}
                  />
                ))}
                {filteredDecks.length === 0 ? (
                  <Text style={styles.emptyDeckSearch}>{labels.noDecksMatchSearch}</Text>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
        <View style={[styles.modalActions, compact && styles.modalActionsStacked]}>
          {currentSeat?.participantKey ? (
            <Button
              label={labels.clearSeat}
              variant="destructive"
              disabled={creatingDeck}
              icon="close-circle-outline"
              onPress={() => {
                if (creatingDeck) return;
                if (editingSeat !== null) onAssignSeat(editingSeat, null, null);
                setEditingSeat(null);
              }}
              style={styles.actionButton}
            />
          ) : null}
          <Button
            label={labels.confirm}
            icon="checkmark"
            disabled={creatingDeck || !draftPlayer || !draftDeck}
            onPress={() => {
              if (creatingDeck || editingSeat === null || !draftPlayer) return;
              onAssignSeat(editingSeat, draftPlayer, draftDeck);
              setEditingSeat(null);
            }}
            style={styles.actionButton}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  choiceStage: { gap: spacing.md },
  choiceHero: { borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardElevated, paddingVertical: 12 },
  lifeHero: { alignItems: 'center', gap: 10, borderRadius: 22, borderWidth: 1, borderColor: colors.lifeBorder, backgroundColor: colors.lifeSurface, padding: 24 },
  lifeEmblem: { width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lifeEmblem },
  lifeHeroValue: { color: '#fff1f2', fontSize: 52, fontWeight: '900', lineHeight: 60 },
  choiceCaption: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  miniPlayers: { flexDirection: 'row', gap: 14, paddingTop: 8 },
  wizardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progressRow: { flex: 1, flexDirection: 'row', gap: 5 },
  progressStep: { flex: 1, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border },
  progressStepActive: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.45, shadowRadius: 5, elevation: 2 },
  progressNumber: { color: colors.muted, fontSize: 10, fontWeight: '900' },
  progressNumberActive: { color: '#fff' },
  interactivePressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  stepBadge: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.primaryLight, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 7, elevation: 4 },
  stepText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  sectionTitle: { flex: 1, color: colors.foreground, fontSize: 20, fontWeight: '800' },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surfaceMuted },
  resetText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  countRow: { flexDirection: 'row', gap: spacing.sm },
  lifeStep: { gap: spacing.md },
  lifeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lifeButton: { minWidth: 58, minHeight: 62, gap: 3, paddingHorizontal: spacing.md, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardInset },
  lifeButtonActive: { borderColor: colors.primaryLight, backgroundColor: colors.primarySurface, shadowColor: colors.primary, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  customLifeInput: { minHeight: 48, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, color: colors.foreground, backgroundColor: colors.cardInset, fontWeight: '800' },
  customLifeInputActive: { borderColor: colors.primaryLight },
  countButton: { flex: 1, minHeight: 62, gap: 2, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardInset },
  countButtonActive: { borderColor: colors.primaryLight, backgroundColor: colors.primarySurface, shadowColor: colors.primary, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  countText: { color: colors.muted, fontSize: 16, fontWeight: '800' },
  countTextActive: { color: '#f0fdf4' },
  layoutOptions: { gap: spacing.md },
  layoutOption: { padding: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardElevated },
  layoutOptionActive: { borderColor: colors.primaryLight, backgroundColor: colors.primarySurface },
  previewTable: { position: 'absolute', borderRadius: 25, borderWidth: 2, borderColor: colors.primaryDark, backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  previewTableInset: { position: 'absolute', left: 5, right: 5, top: 5, bottom: 5, borderRadius: 19, borderWidth: 1, borderColor: '#243e32' },
  previewPerson: { position: 'absolute', width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  previewLink: { position: 'absolute', opacity: 0.35 },
  previewCard: { position: 'absolute', width: 30, height: 36, borderRadius: 5, borderWidth: 1, borderColor: colors.primaryDark, backgroundColor: colors.primarySurface, alignItems: 'center', justifyContent: 'center', gap: 2 },
  previewCardArt: { width: 18, height: 8, borderRadius: 2, opacity: 0.3 },
  previewCardNumber: { fontSize: 11, fontWeight: '900', lineHeight: 12 },
  previewCardLine: { width: 12, height: 2, opacity: 0.6, borderRadius: 1 },
  layoutLabelRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  layoutLabel: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  layoutLabelActive: { color: colors.foreground },
  seatStage: { gap: spacing.sm, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.cardInset, borderWidth: 1, borderColor: colors.border },
  seatStageHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  seatStageTitle: { flex: 1, color: colors.foreground, fontSize: 14, fontWeight: '900' },
  seatProgress: { minWidth: 42, alignItems: 'center', borderRadius: 12, backgroundColor: colors.selectionTint, paddingHorizontal: 8, paddingVertical: 4 },
  seatProgressText: { color: colors.primaryLight, fontSize: 11, fontWeight: '900' },
  wizardActions: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingTop: spacing.sm },
  seatPickerColumns: { gap: spacing.md },
  seatPickerColumnsTablet: { flexDirection: 'row', alignItems: 'stretch' },
  playerList: { gap: spacing.xs, maxHeight: 210 },
  playerListTablet: { flex: 1, maxHeight: 340 },
  optionListContent: { gap: spacing.xs },
  playerOption: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.cardInset, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  playerOptionActive: { borderColor: colors.primaryLight, backgroundColor: colors.selectionTint, shadowColor: colors.primary, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 },
  playerName: { flex: 1, color: colors.foreground, fontSize: 14, fontWeight: '800' },
  deckSection: { gap: spacing.sm },
  deckSectionTablet: { flex: 1, minWidth: 0 },
  deckSectionTitle: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  archidektSyncNotice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.primarySurface },
  archidektSyncText: { flex: 1, color: colors.foreground, fontSize: 12, lineHeight: 17 },
  deckSearchWrap: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardInset },
  deckSearchInput: { flex: 1, minWidth: 0, color: colors.foreground, fontSize: 14 },
  emptyDeckSearch: { paddingVertical: spacing.lg, color: colors.muted, fontSize: 13, textAlign: 'center' },
  deckList: { gap: spacing.xs, maxHeight: 245 },
  deckListTablet: { maxHeight: 310 },
  deckOptionActive: { borderColor: colors.primaryLight },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalActionsStacked: { flexDirection: 'column' },
  actionButton: { flex: 1 },
});
