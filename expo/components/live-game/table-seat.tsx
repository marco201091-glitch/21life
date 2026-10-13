import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { DeckImage } from '@/components/deck/deck-image';
import { HoldPressable } from '@/components/ui/hold-pressable';
import { colors, radii } from '@/constants/theme';
import {
  type LiveGamePlayer,
  type PlayDirection,
} from '@/lib/live-game';
import type { ParticipantKey } from '@/lib/participant-keys';
import { isIPadViewport } from '@/lib/layout';
import { useReducedMotion } from '@/lib/reduced-motion';
import { accumulateLifeDelta, LIFE_DELTA_DURATION, type LifeDeltaBurst, lifeFeedback } from '@/lib/life-feedback';

export type TableSeatLabels = {
  commanderDamage: string;
  infect: string;
  eliminated: string;
  revive: string;
  ko: string;
};

type TableSeatProps = {
  player: LiveGamePlayer;
  seatRotation: number;
  isSource: boolean;
  isDragHover: boolean;
  isActiveSelector: boolean;
  highlightLabel?: string | null;
  highlightTone?: 'starting' | 'random';
  startingDirection?: PlayDirection | null;
  startingBadgeLabel?: string;
  damagePulse: number;
  onAdjust: (delta: number) => void;
  onEliminate: () => void;
  onOpenDetails?: () => void;
  onSelectActivePlayer?: () => void;
  onRevive?: () => void;
  onDamageDragStart?: (key: ParticipantKey, x: number, y: number) => void;
  onDamageDragMove?: (x: number, y: number) => void;
  onDamageDragEnd?: (x: number, y: number) => void;
  onDamageDragCancel?: () => void;
  labels: TableSeatLabels;
};

const AnimatedView = Animated.createAnimatedComponent(View);

export function TableSeat({
  player,
  seatRotation,
  isSource,
  isDragHover,
  isActiveSelector,
  highlightLabel,
  highlightTone = 'starting',
  startingDirection,
  startingBadgeLabel,
  damagePulse,
  onAdjust,
  onEliminate,
  onOpenDetails,
  onSelectActivePlayer,
  onRevive,
  onDamageDragStart,
  onDamageDragMove,
  onDamageDragEnd,
  onDamageDragCancel,
  labels,
}: TableSeatProps) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const isIPad = isIPadViewport(Platform.OS, viewportWidth, viewportHeight);
  const mainValue = player.life;
  const isLow = mainValue <= 5;
  const shake = useSharedValue(0);
  const flashOpacity = useSharedValue(0);
  const gainFlashOpacity = useSharedValue(0);
  const lifeScale = useSharedValue(1);
  const lastReportedDragX = useSharedValue(0);
  const lastReportedDragY = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const previousLife = useRef(player.life);
  const lifeDeltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recentLifeDelta, setRecentLifeDelta] = useState(0);

  const previousDamagePulse = useRef(damagePulse);
  const burst = useRef<LifeDeltaBurst | null>(null);
  const deltaOpacity = useSharedValue(1);
  const deltaY = useSharedValue(0);

  useEffect(() => {
    const change = player.life - previousLife.current;
    previousLife.current = player.life;
    const pulsed = damagePulse !== previousDamagePulse.current && damagePulse > 0;
    previousDamagePulse.current = damagePulse;
    const feedback = lifeFeedback(change);
    if (reducedMotion) {
      for (const value of [flashOpacity, gainFlashOpacity, shake, lifeScale, deltaOpacity, deltaY]) cancelAnimation(value);
      flashOpacity.value = gainFlashOpacity.value = shake.value = deltaY.value = 0;
      lifeScale.value = deltaOpacity.value = 1;
    }
    if (feedback) {
      burst.current = accumulateLifeDelta(burst.current, change, Date.now());
      setRecentLifeDelta(burst.current.delta);
      if (lifeDeltaTimer.current) clearTimeout(lifeDeltaTimer.current);
      lifeDeltaTimer.current = setTimeout(() => {
        lifeDeltaTimer.current = null;
        burst.current = null;
        setRecentLifeDelta(0);
      }, LIFE_DELTA_DURATION);
    }
    if (reducedMotion || (!feedback && !pulsed)) return;
    // One response per update: a damage pulse can accompany the same life loss.
    const gain = feedback?.gain ?? false;
    cancelAnimation(flashOpacity);
    cancelAnimation(gainFlashOpacity);
    flashOpacity.value = gainFlashOpacity.value = 0;
    const halo = gain ? gainFlashOpacity : flashOpacity;
    halo.value = withSequence(withTiming(feedback?.opacity ?? .35, { duration: 90 }), withTiming(0, { duration: 480 }));
    if (feedback) {
      cancelAnimation(lifeScale);
      lifeScale.value = 1;
      lifeScale.value = withSequence(withTiming(feedback.scale, { duration: 130 }), withTiming(1, { duration: 240 }));
      cancelAnimation(deltaOpacity);
      cancelAnimation(deltaY);
      deltaOpacity.value = 0;
      deltaY.value = 3;
      deltaOpacity.value = withSequence(withTiming(1, { duration: 120 }), withDelay(1_380, withTiming(0, { duration: 700 })));
      deltaY.value = withSequence(withTiming(0, { duration: 120 }), withDelay(1_380, withTiming(burst.current && burst.current.delta > 0 ? -10 : 7, { duration: 700 })));
    }
    cancelAnimation(shake);
    shake.value = 0;
    if (!gain) shake.value = withSequence(withTiming(-2, { duration: 45 }), withTiming(2, { duration: 60 }), withTiming(0, { duration: 65 }));
  }, [damagePulse, deltaOpacity, deltaY, flashOpacity, gainFlashOpacity, lifeScale, player.life, reducedMotion, shake]);

  useEffect(() => () => {
    if (lifeDeltaTimer.current) clearTimeout(lifeDeltaTimer.current);
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { translateY: shake.value * 0.3 }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));
  const gainFlashStyle = useAnimatedStyle(() => ({ opacity: gainFlashOpacity.value }));
  const lifeStyle = useAnimatedStyle(() => ({ transform: [{ scale: lifeScale.value }] }));

  const deltaStyle = useAnimatedStyle(() => ({ opacity: deltaOpacity.value, transform: [{ translateY: deltaY.value }] }));

  const dragGesture = useMemo(() => Gesture.Pan()
    .enabled(!player.isEliminated && Boolean(onDamageDragStart))
    .minDistance(8)
    .onStart((event) => {
      lastReportedDragX.value = event.absoluteX;
      lastReportedDragY.value = event.absoluteY;
      if (onDamageDragStart) runOnJS(onDamageDragStart)(player.participantKey, event.absoluteX, event.absoluteY);
    })
    .onUpdate((event) => {
      const moved = Math.abs(event.absoluteX - lastReportedDragX.value)
        + Math.abs(event.absoluteY - lastReportedDragY.value);
      if (moved < 4) return;
      lastReportedDragX.value = event.absoluteX;
      lastReportedDragY.value = event.absoluteY;
      if (onDamageDragMove) runOnJS(onDamageDragMove)(event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      if (onDamageDragEnd) runOnJS(onDamageDragEnd)(event.absoluteX, event.absoluteY);
    })
    .onFinalize((_event, success) => {
      if (!success && onDamageDragCancel) runOnJS(onDamageDragCancel)();
    }), [
      lastReportedDragX,
      lastReportedDragY,
      onDamageDragCancel,
      onDamageDragEnd,
      onDamageDragMove,
      onDamageDragStart,
      player.isEliminated,
      player.participantKey,
    ]);

  const [seatSize, setSeatSize] = useState({ width: 0, height: 0 });
  const isSideways = Math.abs(seatRotation) % 180 === 90;
  const canvasWidth = isSideways ? seatSize.height : seatSize.width;
  const canvasHeight = isSideways ? seatSize.width : seatSize.height;
  const canvasStyle = seatSize.width > 0
    ? {
        width: canvasWidth,
        height: canvasHeight,
        left: (seatSize.width - canvasWidth) / 2,
        top: (seatSize.height - canvasHeight) / 2,
        transform: [{ rotate: `${seatRotation}deg` }],
      }
    : styles.canvasHidden;

  const handleSeatLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSeatSize((current) => (
      current.width === width && current.height === height ? current : { width, height }
    ));
  };

  const isCompact = canvasWidth > 0 && canvasWidth < 280;
  const lifeFontSize = Math.max(46, Math.min(isCompact ? 58 : 76, Math.round(canvasHeight * 0.4)));

  return (
    <AnimatedView
      onLayout={handleSeatLayout}
      style={[
        styles.seat,
        isSource && styles.sourceSeat,
        isDragHover && styles.hoverSeat,
        isActiveSelector && styles.activeSelectorSeat,
        highlightLabel && (highlightTone === 'random' ? styles.randomSeat : styles.startingSeat),
        player.isEliminated && styles.eliminatedSeat,
        cardStyle,
      ]}
    >
      <View style={[styles.playerCanvas, canvasStyle]}>
        <View style={[styles.backgroundWrap, player.backgroundColor ? { backgroundColor: player.backgroundColor } : null]} pointerEvents="none">
          <DeckImage
            uri={player.commanderImage}
            alt={player.commander}
            style={styles.backgroundImage}
            containerStyle={styles.backgroundImageWrap}
            contentFit="cover"
            contentPosition={isIPad && isSideways ? 'center' : 'top'}
          />
        </View>
        <View style={styles.scrim} pointerEvents="none" />
        <View style={[styles.edgeShade, styles.edgeShadeLeft]} pointerEvents="none" />
        <View style={[styles.edgeShade, styles.edgeShadeRight]} pointerEvents="none" />
        <AnimatedView pointerEvents="none" style={[styles.flash, flashStyle]} />
        <AnimatedView pointerEvents="none" style={[styles.gainFlash, gainFlashStyle]} />

        {onSelectActivePlayer && !player.isEliminated ? (
          <Pressable
            style={styles.selectSurface}
            onPress={onSelectActivePlayer}
            accessibilityRole="button"
            accessibilityLabel={player.displayName}
            accessibilityState={{ selected: isActiveSelector }}
          />
        ) : null}

        {highlightLabel ? (
          <View
            pointerEvents="none"
            style={[
              styles.playerHighlight,
              highlightTone === 'random' ? styles.randomHighlight : styles.startingHighlight,
            ]}
          >
            <Text style={styles.playerHighlightText}>{highlightLabel}</Text>
          </View>
        ) : null}

        {startingDirection && startingBadgeLabel ? (
          <View
            pointerEvents="none"
            accessible
            accessibilityRole="image"
            accessibilityLabel={startingBadgeLabel}
            style={styles.startingBadge}
          >
            <Ionicons
              name="refresh-outline"
              size={29}
              color="#fef3c7"
              style={startingDirection === 'counterclockwise' ? styles.startingBadgeCounterclockwise : undefined}
            />
            <Text style={styles.startingBadgeText}>1</Text>
          </View>
        ) : null}

        {(player.counters.monarch || player.counters.initiative || player.counters.energy > 0 || player.counters.experience > 0 || player.counters.commanderTax > 0) ? (
          <View
            pointerEvents="none"
            style={styles.emblemBadges}
            accessible
            accessibilityLabel={[
              player.counters.monarch ? 'Monarca' : '',
              player.counters.initiative ? 'Iniziativa' : '',
            ].filter(Boolean).join(', ')}
          >
            {player.counters.monarch ? (
              <View style={[styles.emblemBadge, styles.monarchBadge]}>
                <Ionicons name="ribbon-outline" size={18} color="#fef3c7" />
              </View>
            ) : null}
            {player.counters.initiative ? (
              <View style={[styles.emblemBadge, styles.initiativeBadge]}>
                <Ionicons name="trail-sign-outline" size={18} color="#cffafe" />
              </View>
            ) : null}
            {player.counters.energy > 0 ? <View style={[styles.numericCounterBadge, styles.energyBadge]}><Text style={styles.numericCounterText}>E {player.counters.energy}</Text></View> : null}
            {player.counters.experience > 0 ? <View style={[styles.numericCounterBadge, styles.experienceBadge]}><Text style={styles.numericCounterText}>XP {player.counters.experience}</Text></View> : null}
            {player.counters.commanderTax > 0 ? <View style={[styles.numericCounterBadge, styles.taxBadge]}><Text style={styles.numericCounterText}>T {player.counters.commanderTax}</Text></View> : null}
          </View>
        ) : null}

        {player.isEliminated ? (
          <View style={styles.eliminatedOverlay}>
            <Ionicons name="skull-outline" size={28} color="#fecaca" />
            <Text style={styles.eliminatedLabel}>{labels.eliminated}</Text>
            {onRevive ? (
              <Pressable
                style={styles.reviveBtn}
                onPress={onRevive}
                accessibilityRole="button"
                accessibilityLabel={`${labels.revive}: ${player.displayName}`}
              >
                <Text style={styles.reviveText}>{labels.revive}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <GestureDetector gesture={dragGesture}>
              <AnimatedView style={styles.dragSurface} />
            </GestureDetector>

            <HoldPressable
              style={[styles.edgeButton, styles.minusButton, isIPad && styles.edgeButtonIPad]}
              hitSlop={18}
              onShort={() => onAdjust(-1)}
              onLong={() => onAdjust(-10)}
              accessibilityRole="button"
              accessibilityLabel={`${player.displayName} -1`}
            >
              <Text style={[styles.edgeButtonText, isIPad && styles.edgeButtonTextIPad]}>−</Text>
            </HoldPressable>

            <HoldPressable
              style={[styles.edgeButton, styles.plusButton, isIPad && styles.edgeButtonIPad]}
              hitSlop={18}
              onShort={() => onAdjust(1)}
              onLong={() => onAdjust(10)}
              accessibilityRole="button"
              accessibilityLabel={`${player.displayName} +1`}
            >
              <Text style={[styles.edgeButtonText, isIPad && styles.edgeButtonTextIPad]}>+</Text>
            </HoldPressable>

            <AnimatedView style={styles.lifeReadout} pointerEvents="none">
              <View style={styles.playerMetaRow}>
                <View style={styles.playerNamePill}>
                  <Text style={styles.playerName} numberOfLines={1}>{player.displayName}</Text>
                </View>
                {recentLifeDelta !== 0 ? (
                  <Animated.Text style={[
                    deltaStyle,
                    styles.recentLifeDelta,
                    isIPad && styles.recentLifeDeltaIPad,
                    recentLifeDelta < 0 ? styles.recentLifeLoss : styles.recentLifeGain,
                  ]}>
                    {recentLifeDelta > 0 ? '+' : '−'}{Math.abs(recentLifeDelta)}
                  </Animated.Text>
                ) : null}
              </View>
              <Animated.Text
                style={[
                  lifeStyle,
                  styles.lifeValue,
                  { fontSize: lifeFontSize, lineHeight: lifeFontSize + 4 },
                  isLow && styles.dangerLife,
                ]}
              >
                {mainValue}
              </Animated.Text>
            </AnimatedView>

            <Pressable
              style={[styles.damageDetailsButton, isIPad && styles.damageDetailsButtonIPad]}
              onPress={onOpenDetails}
              disabled={!onOpenDetails}
              accessibilityRole="button"
              accessibilityLabel={`${player.displayName} · ${labels.commanderDamage} · ${labels.infect}`}
            >
              <Ionicons name="shield-half-outline" size={isIPad ? 28 : 21} color="#ddd6fe" />
            </Pressable>

            <Pressable
              style={[styles.koButton, isIPad && styles.koButtonIPad]}
              onPress={onEliminate}
              accessibilityRole="button"
              accessibilityLabel={`${labels.ko}: ${player.displayName}`}
            >
              <Ionicons name="skull-outline" size={isIPad ? 20 : 15} color="rgba(254,202,202,0.86)" />
            </Pressable>
          </>
        )}
      </View>
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  seat: {
    flex: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#09090f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sourceSeat: {
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  hoverSeat: {
    borderWidth: 2,
    borderColor: '#22d3ee',
  },
  activeSelectorSeat: {
    borderWidth: 3,
    borderColor: '#22d3ee',
  },
  startingSeat: {
    borderWidth: 3,
    borderColor: '#fbbf24',
  },
  randomSeat: {
    borderWidth: 3,
    borderColor: colors.primaryMuted,
  },
  eliminatedSeat: {
    opacity: 0.82,
  },
  playerCanvas: {
    position: 'absolute',
    overflow: 'hidden',
  },
  canvasHidden: {
    opacity: 0,
  },
  backgroundWrap: {
    ...StyleSheet.absoluteFill,
  },
  backgroundImageWrap: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 3, 8, 0.25)',
    zIndex: 1,
  },
  edgeShade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '25%',
    backgroundColor: 'rgba(0,0,0,0.17)',
    zIndex: 2,
  },
  edgeShadeLeft: {
    left: 0,
  },
  edgeShadeRight: {
    right: 0,
  },
  flash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(239, 68, 68, 0.42)',
    zIndex: 3,
  },
  gainFlash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 185, 129, 0.34)',
    borderWidth: 4,
    borderColor: 'rgba(110, 231, 183, 0.86)',
    zIndex: 3,
  },
  selectSurface: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    elevation: 30,
  },
  playerHighlight: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  startingHighlight: {
    backgroundColor: 'rgba(251, 191, 36, 0.22)',
    borderColor: 'rgba(253, 230, 138, 0.95)',
  },
  randomHighlight: {
    backgroundColor: colors.selectionTintStrong,
    borderColor: colors.primaryLight,
  },
  startingBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    zIndex: 6,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.52)',
    backgroundColor: 'rgba(69,42,8,0.88)',
  },
  startingBadgeText: {
    position: 'absolute',
    color: '#fef3c7',
    fontSize: 11,
    fontWeight: '900',
  },
  startingBadgeCounterclockwise: {
    transform: [{ scaleX: -1 }],
  },
  emblemBadges: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    zIndex: 24,
    flexDirection: 'row',
    flexWrap: 'wrap-reverse',
    justifyContent: 'flex-end',
    maxWidth: 96,
    gap: 5,
  },
  emblemBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monarchBadge: {
    borderColor: 'rgba(253,230,138,0.72)',
    backgroundColor: 'rgba(69,42,8,0.9)',
  },
  initiativeBadge: {
    borderColor: 'rgba(165,243,252,0.68)',
    backgroundColor: 'rgba(8,51,68,0.9)',
  },
  numericCounterBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  numericCounterText: { color: '#f8fafc', fontSize: 10, fontWeight: '900' },
  energyBadge: { borderColor: 'rgba(253,224,71,0.65)', backgroundColor: 'rgba(66,32,6,0.9)' },
  experienceBadge: { borderColor: 'rgba(196,181,253,0.65)', backgroundColor: 'rgba(46,16,101,0.9)' },
  taxBadge: { borderColor: 'rgba(203,213,225,0.6)', backgroundColor: 'rgba(15,23,42,0.9)' },
  playerHighlightText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  edgeButton: {
    position: 'absolute',
    top: '50%',
    zIndex: 8,
    width: 58,
    height: 76,
    marginTop: -38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  edgeButtonIPad: {
    width: 64,
    height: 84,
    marginTop: -42,
  },
  minusButton: {
    left: 0,
  },
  plusButton: {
    right: 0,
  },
  edgeButtonText: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '300',
    lineHeight: 42,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 7,
  },
  edgeButtonTextIPad: {
    fontSize: 50,
    lineHeight: 56,
  },
  playerNamePill: {
    flexShrink: 1,
    maxWidth: 116,
    minHeight: 24,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(4, 5, 10, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  playerMetaRow: {
    minHeight: 28,
    maxWidth: 176,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  lifeReadout: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 7,
    width: 180,
    minHeight: 118,
    marginLeft: -90,
    marginTop: -64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lifeValue: {
    color: '#ffffff',
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -3,
    textShadowColor: 'rgba(0,0,0,0.92)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
    includeFontPadding: false,
  },
  recentLifeDelta: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    width: 70,
    marginLeft: -35,
    marginBottom: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: 'rgba(4,5,10,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  dragSurface: {
    ...StyleSheet.absoluteFill,
  },
  recentLifeDeltaIPad: {
    width: 90,
    marginLeft: -45,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 28,
    lineHeight: 32,
    textAlign: 'center',
  },
  recentLifeLoss: {
    color: '#f87171',
  },
  recentLifeGain: {
    color: '#6ee7b7',
  },
  dangerLife: {
    color: '#fecaca',
  },
  damageDetailsButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 9,
    width: 44,
    height: 40,
    marginLeft: -22,
    marginTop: 48,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4,5,10,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(221,214,254,0.32)',
  },
  damageDetailsButtonIPad: {
    width: 56,
    height: 50,
    marginLeft: -28,
    marginTop: 58,
    borderRadius: 25,
  },
  koButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(254,202,202,0.14)',
  },
  koButtonIPad: {
    top: 10,
    left: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  eliminatedOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  eliminatedLabel: {
    color: '#fecaca',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  reviveBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'rgba(10,10,15,0.88)',
  },
  reviveText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700',
  },
});
