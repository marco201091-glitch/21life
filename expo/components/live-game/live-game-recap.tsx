import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import { buildLiveGameRecap } from '@/lib/live-game-recap';
import type { LiveGameRecord } from '@/lib/live-game';
import { colors, radii, spacing, touchSlop } from '@/constants/theme';
import { useLanguage } from '@/contexts/language-context';

const PLAYER_COLORS = ['#72d17b', '#22d3ee', '#fb7185', '#fbbf24', '#4ade80', '#f472b6'];

export function LiveGameRecapView({
  record,
  labels,
}: {
  record: LiveGameRecord;
  labels: { timeline: string; highlights: string; empty: string };
}) {
  const { language } = useLanguage();
  const recapRef = useRef<ViewInstance>(null);
  const [sharing, setSharing] = useState(false);
  const recap = buildLiveGameRecap(record);
  const duration = recap.durationSeconds == null ? '—' : `${Math.floor(recap.durationSeconds / 60)}:${String(recap.durationSeconds % 60).padStart(2, '0')}`;
  const shareRecap = async () => {
    if (!await Sharing.isAvailableAsync() || !recapRef.current) return;
    setSharing(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const path = await captureRef(recapRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(path, { mimeType: 'image/png', dialogTitle: language === 'it' ? 'Condividi riepilogo' : 'Share recap' });
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
    } finally {
      setSharing(false);
    }
  };
  return <View ref={recapRef} collapsable={false} style={styles.root}>
    <View style={styles.summaryRow}>
      <Text style={styles.summaryChip}>⏱ {duration}</Text>
      {recap.startingPlayerName ? <Text style={styles.summaryChip}>① {recap.startingPlayerName} · {recap.startingDirection === 'clockwise' ? '↻' : '↺'}</Text> : null}
      {!sharing ? <Pressable onPress={() => void shareRecap().catch(() => undefined)} hitSlop={touchSlop(32)} accessibilityRole="button" accessibilityLabel={language === 'it' ? 'Condividi riepilogo' : 'Share recap'} style={styles.shareButton}><Ionicons name="share-social-outline" size={15} color={colors.primaryMuted} /></Pressable> : null}
    </View>
    <Text style={styles.title}>{labels.timeline}</Text>
    {recap.players.map((player, index) => (
      <View key={player.participantKey} style={styles.player}>
        <View style={styles.playerHeader}>
          <View style={[styles.dot, { backgroundColor: PLAYER_COLORS[index % PLAYER_COLORS.length] }]} />
          <Text style={styles.name} numberOfLines={1}>{player.displayName}</Text>
          <View style={styles.finalMetrics}>
            <Text style={[styles.finalLife, { color: PLAYER_COLORS[index % PLAYER_COLORS.length] }]}>{player.finalLife}</Text>
            {player.finalInfect > 0 ? <Text style={styles.infect}>☠ {player.finalInfect}</Text> : null}
          </View>
        </View>
        <Text style={styles.commander} numberOfLines={1}>{player.commander}</Text>
        <View style={styles.metrics}>
          {player.damageDealt > 0 ? <Text style={styles.metric}>⚔ {player.damageDealt}</Text> : null}
          {player.lifeGained > 0 ? <Text style={styles.metric}>♥ +{player.lifeGained}</Text> : null}
          {player.eliminationsCaused > 0 ? <Text style={styles.metric}>☠ {player.eliminationsCaused}</Text> : null}
          {player.commanderDamageDealt > 0 ? <Text style={styles.metric}>CMD ⚔ {player.commanderDamageDealt}</Text> : null}
          {player.infectDealt > 0 ? <Text style={styles.metric}>INF ⚔ {player.infectDealt}</Text> : null}
          {player.events > 0 ? <Text style={styles.metric}>• {player.events}</Text> : null}
        </View>
      </View>
    ))}
    <Text style={[styles.title, styles.highlightsTitle]}>{labels.highlights}</Text>
    {recap.highlights.length ? <View style={styles.highlights}>
      {recap.highlights.map((event) => {
        const target = recap.players.find((player) => player.participantKey === event.targetKey);
        return <View key={event.id} style={styles.highlight}><Text style={styles.highlightText}>{target?.displayName ?? event.targetKey} · {event.type.replace('_', ' ')}</Text></View>;
      })}
    </View> : <Text style={styles.empty}>{labels.empty}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, borderWidth: 1, borderColor: colors.selectionBorder, borderRadius: radii.lg, backgroundColor: colors.primarySurface, padding: spacing.md },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  summaryChip: { color: colors.muted, fontSize: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5 },
  shareButton: { marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.selectionBorder, backgroundColor: colors.selectionTint },
  title: { color: colors.primaryMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
  player: { gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  playerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { flex: 1, color: colors.foreground, fontSize: 12, fontWeight: '800' },
  finalLife: { fontSize: 17, fontWeight: '900' },
  finalMetrics: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  infect: { color: colors.success, fontSize: 11, fontWeight: '800' },
  commander: { color: colors.muted, fontSize: 10 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  highlightsTitle: { color: colors.foreground, marginTop: spacing.xs },
  highlights: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  highlight: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  highlightText: { color: colors.muted, fontSize: 10 },
  empty: { color: colors.muted, fontSize: 11 },
});
