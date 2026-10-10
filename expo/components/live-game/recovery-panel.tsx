import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/button';
import { PhyrexianPanel } from '@/components/ui/phyrexian-panel';
import { colors, spacing } from '@/constants/theme';

export function LiveGameRecoveryPanel({ count, language, syncing, error, onSync, onDiscard }: {
  count: number;
  language: string;
  syncing: boolean;
  error: string | null;
  onSync: () => void;
  onDiscard: () => void;
}) {
  const italian = language === 'it';
  return (
    <PhyrexianPanel style={styles.panel}>
      <View style={styles.header}>
        <Ionicons name="cloud-upload-outline" size={21} color="#fcd34d" />
        <View style={styles.copy}>
          <Text style={styles.title}>{italian ? 'Centro recupero' : 'Recovery center'}</Text>
          <Text style={styles.hint}>{italian ? `${count} salvataggi in attesa. La partita resta protetta sul dispositivo.` : `${count} saves pending. The game remains protected on this device.`}</Text>
        </View>
      </View>
      {error ? <Text testID="recovery-sync-error" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button testID="recovery-sync" label={syncing ? italian ? 'Sincronizzazione…' : 'Syncing…' : italian ? 'Sincronizza ora' : 'Sync now'}
          icon="sync-outline" disabled={syncing} onPress={onSync} style={styles.action} />
        <Button label={italian ? 'Scarta' : 'Discard'} variant="ghost" disabled={syncing} onPress={onDiscard} style={styles.action} />
      </View>
    </PhyrexianPanel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm, borderColor: 'rgba(251,191,36,0.35)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  copy: { flex: 1, gap: 2 },
  title: { color: '#fde68a', fontSize: 14, fontWeight: '900' },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  error: { color: colors.destructive, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 140 },
});
