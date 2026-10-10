import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { colors, spacing } from '@/constants/theme';

export function SetupRestoreGate({ ready, error, language, onRetry, children }: {
 ready: boolean; error: boolean; language: 'en' | 'it'; onRetry: () => void; children: ReactNode;
}) {
 if (ready) return children;
 const it = language === 'it';
 return <View style={{ gap: spacing.sm }}>
  <Text accessibilityRole={error ? 'alert' : 'text'} style={{ color: colors.muted }}>
   {error ? (it ? 'Impossibile ripristinare la configurazione salvata. Controlla la connessione e riprova.' : 'Unable to restore the saved setup. Check your connection and retry.')
    : (it ? 'Ripristino della configurazione salvata...' : 'Restoring saved setup...')}
  </Text>
  {error ? <Button label={it ? 'Riprova' : 'Retry'} onPress={onRetry} /> : null}
 </View>;
}
