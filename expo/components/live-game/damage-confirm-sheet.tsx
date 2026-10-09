import { useEffect, useState } from 'react';
import { Modal as RNModal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DeckImage } from '@/components/deck/deck-image';
import { Button } from '@/components/ui/button';
import { HoldPressable } from '@/components/ui/hold-pressable';
import { colors, radii, spacing } from '@/constants/theme';
import { isIPadViewport } from '@/lib/layout';
import type { DamageMode, GroupDamageScope, LiveGamePlayer } from '@/lib/live-game';

type DamageConfirmSheetProps = {
  visible: boolean;
  source: LiveGamePlayer | null;
  target: LiveGamePlayer | null;
  sourceRotation?: number;
  defaultMode?: DamageMode;
  commanderMode?: boolean;
  labels: {
    title: string;
    amount: string;
    lifeDamage: string;
    commanderDamage: string;
    infectDamage: string;
    apply: string;
    cancel: string;
    thisPlayer: string;
    eachOpponent: string;
    everyone: string;
    drain: string;
    drainHint: string;
    lifelink: string;
    lifelinkHint: string;
  };
  onClose: () => void;
  onConfirm: (input: { amount: number; mode: DamageMode; scope: 'single' | GroupDamageScope; drain: boolean }) => void;
};

export function DamageConfirmSheet({
  visible,
  source,
  target,
  sourceRotation = 0,
  defaultMode = 'life',
  commanderMode = true,
  labels,
  onClose,
  onConfirm,
}: DamageConfirmSheetProps) {
  const { width, height } = useWindowDimensions();
  const isIPad = isIPadViewport(Platform.OS, width, height);
  const quarterTurn = Math.abs(sourceRotation) % 180 === 90;
  const phoneCardWidth = Math.max(
    300,
    Math.min(620, (quarterTurn ? height : width) - 64),
  );
  const phoneCardHeight = Math.max(
    250,
    Math.min(quarterTurn ? 340 : 560, (quarterTurn ? width : height) - 64),
  );
  const widePhone = !isIPad && phoneCardWidth >= 440;
  const straightPhone = !isIPad && !quarterTurn;
  const compactPhone = !isIPad && phoneCardHeight < 310;
  const ipadCardDim = Math.min(
    Math.max(340, Math.min(width, height) - 80),
    600,
  );
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState<DamageMode>(defaultMode);
  const [scope, setScope] = useState<'single' | GroupDamageScope>('single');
  const [drain, setDrain] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmount(0);
    setMode(defaultMode);
    setScope('single');
    setDrain(false);
  }, [visible, defaultMode, source?.participantKey, target?.participantKey]);

  if (!source || !target) return null;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlayRoot}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[
        styles.damageCard,
        isIPad && styles.damageCardIPad,
        isIPad ? { width: ipadCardDim, height: ipadCardDim } : { width: phoneCardWidth, height: phoneCardHeight },
        { transform: [{ rotate: `${sourceRotation}deg` }] },
      ]}>
        {isIPad ? (
          <DeckImage
            uri={target.commanderImage}
            alt={target.commander}
            style={styles.stageImage}
            containerStyle={styles.stageImageWrap}
          />
        ) : null}
        <View style={styles.stageShade} pointerEvents="none" />
        <View style={[styles.damageCardContent, compactPhone && styles.damageCardContentCompact, isIPad && styles.damageCardContentIPad]}>
          <View style={[styles.compactHeader, compactPhone && styles.compactHeaderPhone, isIPad && styles.compactHeaderIPad]}>
            <Ionicons name="flash-outline" size={isIPad ? 26 : 20} color={colors.primaryLight} />
            <View style={styles.headerCopy}>
              <Text style={[styles.headerTitle, isIPad && styles.headerTitleIPad]}>{labels.title}</Text>
              <Text style={[styles.sourceTarget, isIPad && styles.sourceTargetIPad]} numberOfLines={1}>
                {source.displayName} → {target.displayName}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, compactPhone && styles.closeButtonCompact, isIPad && styles.closeButtonIPad]}
              accessibilityRole="button"
              accessibilityLabel={labels.cancel}
            >
              <Ionicons name="close" size={isIPad ? 26 : 20} color={colors.muted} />
            </Pressable>
          </View>

          <View style={[styles.editorBody, widePhone && styles.editorBodyWide]}>
          <View style={[
            styles.amountStage,
            compactPhone && styles.amountStageCompact,
            widePhone && styles.amountStageWide,
            isIPad && styles.amountStageIPad,
          ]}>
          <View style={[styles.stepperRow, widePhone && styles.stepperRowWide, isIPad && styles.stepperRowIPad]}>
            <HoldPressable
              style={[styles.stepButton, compactPhone && styles.stepButtonCompact, isIPad && styles.stepButtonIPad]}
              hitSlop={18}
              onShort={() => setAmount((value) => Math.max(0, value - 1))}
              onLong={() => setAmount((value) => Math.max(0, value - 10))}
              accessibilityRole="button"
              accessibilityLabel={`${labels.amount} -`}
            >
              <Ionicons name="remove" size={isIPad ? 40 : 30} color={colors.foreground} />
            </HoldPressable>
            <View style={styles.amountCopy}>
              <Text style={[styles.amountValue, compactPhone && styles.amountValueCompact, isIPad && styles.amountValueIPad]}>{amount}</Text>
              <Text style={[styles.amountContext, isIPad && styles.amountContextIPad]} numberOfLines={2}>
                {mode === 'life' ? labels.lifeDamage : mode === 'commander' ? labels.commanderDamage : labels.infectDamage}
                {' · '}
                {scope === 'opponents' ? labels.eachOpponent : scope === 'all_players' ? labels.everyone : target.displayName}
              </Text>
            </View>
            <HoldPressable
              style={[styles.stepButton, compactPhone && styles.stepButtonCompact, isIPad && styles.stepButtonIPad]}
              hitSlop={18}
              onShort={() => setAmount((value) => Math.min(99, value + 1))}
              onLong={() => setAmount((value) => Math.min(99, value + 10))}
              accessibilityRole="button"
              accessibilityLabel={`${labels.amount} +`}
            >
              <Ionicons name="add" size={isIPad ? 40 : 30} color={colors.foreground} />
            </HoldPressable>
          </View>
          </View>

          <View style={[styles.optionsColumn, widePhone && styles.optionsColumnWide]}>
          <View style={[
            styles.typeSegment,
            compactPhone && styles.typeSegmentCompact,
            widePhone && styles.typeSegmentWide,
            straightPhone && styles.typeSegmentStraight,
            isIPad && styles.typeSegmentIPad,
          ]}>
            {([
              { value: 'life' as const, label: labels.lifeDamage, icon: 'heart-dislike-outline' as const },
              { value: 'commander' as const, label: labels.commanderDamage, icon: 'shield-outline' as const },
              { value: 'infect' as const, label: labels.infectDamage, icon: 'skull-outline' as const },
            ].filter((option) => commanderMode || option.value !== 'commander')).map((option) => {
              const active = mode === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.typePill,
                    compactPhone && styles.typePillCompact,
                    widePhone && styles.typePillWide,
                    straightPhone && styles.typePillStraight,
                    isIPad && styles.typePillIPad,
                    active && styles.typePillActive,
                  ]}
                  onPress={() => {
                    setMode(option.value);
                    if (option.value === 'commander') setScope('single');
                  }}
                >
                  <Ionicons name={option.icon} size={isIPad ? 19 : (widePhone || straightPhone) ? 20 : 14} color={active ? colors.primaryForeground : colors.muted} />
                  <Text
                    style={[
                      styles.typePillText,
                      widePhone && styles.typePillTextWide,
                      straightPhone && styles.typePillTextStraight,
                      isIPad && styles.typePillTextIPad,
                      active && styles.typePillTextActive,
                    ]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode !== 'commander' ? (
            <View style={[styles.typeSegment, compactPhone && styles.typeSegmentCompact, isIPad && styles.typeSegmentIPad]}>
              {([
                { value: 'single' as const, label: labels.thisPlayer },
                { value: 'opponents' as const, label: labels.eachOpponent },
                { value: 'all_players' as const, label: labels.everyone },
              ]).map((option) => {
                const active = scope === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.scopePill, compactPhone && styles.scopePillCompact, isIPad && styles.scopePillIPad, active && styles.scopePillActive]}
                    onPress={() => {
                      setScope(option.value);
                      if (option.value === 'all_players') setDrain(false);
                    }}
                  >
                    <Text style={[styles.scopeText, isIPad && styles.scopeTextIPad, active && styles.scopeTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Pressable
              style={[styles.drainToggle, compactPhone && styles.drainToggleCompact, drain && styles.drainToggleActive]}
              onPress={() => {
                setDrain((current) => {
                  const next = !current;
                  if (next && scope === 'all_players') setScope('opponents');
                  return next;
                });
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: drain }}
              accessibilityLabel={mode === 'commander' ? labels.lifelink : labels.drain}
            >
              <Ionicons name="water-outline" size={17} color={drain ? '#f5d0fe' : colors.muted} />
              <View style={styles.drainCopy}>
                <Text style={[styles.drainLabel, drain && styles.drainLabelActive]}>{mode === 'commander' ? labels.lifelink : labels.drain}</Text>
                {!compactPhone ? <Text style={styles.drainHint} numberOfLines={1}>{mode === 'commander' ? labels.lifelinkHint : labels.drainHint}</Text> : null}
              </View>
              <Ionicons name={drain ? 'flash' : 'flash-outline'} size={19} color={drain ? '#f5d0fe' : colors.muted} />
            </Pressable>
          </View>
          </View>

          <View style={[styles.footerRow, compactPhone && styles.footerRowCompact, isIPad && styles.footerRowIPad]}>
            <Button label={labels.cancel} variant="outline" size={compactPhone ? 'sm' : 'default'} onPress={onClose} style={styles.footerButton} />
            <Button
              label={labels.apply}
              size={compactPhone ? 'sm' : 'default'}
              onPress={() => onConfirm({ amount, mode, scope, drain })}
              disabled={amount === 0}
              style={styles.footerButton}
            />
          </View>
        </View>
      </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.modalOverlay,
  },
  damageCard: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.38)',
    backgroundColor: colors.background,
  },
  damageCardContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    gap: 6,
    padding: spacing.sm,
    zIndex: 2,
    elevation: 2,
  },
  damageCardIPad: {
    maxWidth: 600,
    maxHeight: 600,
  },
  damageCardContentIPad: {
    gap: 10,
    padding: spacing.md,
  },
  damageCardContentCompact: {
    gap: 2,
    padding: 4,
  },
  compactHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactHeaderIPad: {
    minHeight: 52,
  },
  compactHeaderPhone: {
    minHeight: 28,
  },
  editorBody: {
    flex: 1,
    gap: 6,
    minHeight: 0,
  },
  editorBodyWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '900',
  },
  headerTitleIPad: {
    fontSize: 21,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  closeButtonIPad: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  closeButtonCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  amountStage: {
    width: '100%',
    flex: 1,
    minHeight: 92,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.38)',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  amountStageIPad: {
    minHeight: 150,
  },
  amountStageCompact: {
    flex: 0,
    height: 64,
    minHeight: 64,
  },
  amountStageWide: {
    flex: 1,
    width: '46%',
    height: '100%',
    minHeight: 0,
  },
  sourceTarget: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sourceTargetIPad: {
    fontSize: 13,
  },
  stageImageWrap: { ...StyleSheet.absoluteFill, zIndex: 0 },
  stageImage: { width: '100%', height: '100%' },
  stageShade: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    backgroundColor: 'rgba(24,4,12,0.76)',
  },
  stepperRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  stepperRowIPad: {
    paddingHorizontal: spacing.lg,
  },
  stepperRowWide: {
    paddingHorizontal: spacing.md,
  },
  stepButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  stepButtonIPad: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  stepButtonCompact: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  amountCopy: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  amountValue: {
    textAlign: 'center',
    color: colors.foreground,
    fontSize: 58,
    lineHeight: 62,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  amountValueIPad: {
    fontSize: 88,
    lineHeight: 94,
  },
  amountValueCompact: {
    fontSize: 40,
    lineHeight: 42,
  },
  amountContext: {
    color: colors.foreground,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountContextIPad: {
    fontSize: 13,
    lineHeight: 17,
  },
  typeSegment: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.cardInset,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    overflow: 'hidden',
  },
  typeSegmentIPad: {
    gap: 6,
    padding: 6,
  },
  typeSegmentCompact: {
    gap: 2,
    padding: 2,
  },
  typeSegmentWide: {
    minHeight: 68,
  },
  typeSegmentStraight: {
    minHeight: 174,
    flexDirection: 'column',
    gap: 4,
    padding: 4,
  },
  optionsColumn: {
    gap: 4,
  },
  optionsColumnWide: {
    flex: 1.2,
    justifyContent: 'center',
    gap: 5,
  },
  typePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.md,
    minHeight: 38,
    paddingVertical: 7,
    paddingHorizontal: spacing.xs,
    overflow: 'hidden',
  },
  typePillIPad: {
    minHeight: 52,
  },
  typePillCompact: {
    minHeight: 28,
    paddingVertical: 2,
  },
  typePillWide: {
    minHeight: 64,
    flexDirection: 'column',
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  typePillStraight: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  typePillActive: {
    backgroundColor: colors.primary,
  },
  typePillText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  typePillTextWide: {
    width: '100%',
    fontSize: 11,
    lineHeight: 13,
  },
  typePillTextStraight: {
    width: 'auto',
    fontSize: 12,
    lineHeight: 15,
  },
  typePillTextIPad: {
    fontSize: 13,
  },
  typePillTextActive: {
    color: colors.primaryForeground,
  },
  scopePill: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
  },
  scopePillIPad: {
    minHeight: 48,
  },
  scopePillCompact: {
    minHeight: 26,
  },
  scopePillActive: {
    backgroundColor: colors.selectionTintStrong,
  },
  scopeText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  scopeTextIPad: {
    fontSize: 13,
  },
  scopeTextActive: {
    color: colors.foreground,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 42,
  },
  footerRowIPad: {
    minHeight: 54,
  },
  footerRowCompact: {
    minHeight: 36,
  },
  drainToggle: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardInset,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  drainToggleCompact: {
    minHeight: 28,
    paddingVertical: 2,
  },
  drainToggleActive: {
    borderColor: '#e879f9',
    backgroundColor: 'rgba(192,38,211,0.22)',
  },
  drainCopy: {
    flex: 1,
    minWidth: 0,
  },
  drainLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  drainLabelActive: {
    color: colors.foreground,
  },
  drainHint: {
    color: colors.muted,
    fontSize: 9,
  },
  footerButton: {
    flex: 1,
  },
});
