import { useMemo } from 'react';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { DeckCard } from '@/components/profile/deck-card';
import { Button } from '@/components/ui/button';
import { PhyrexianPanel } from '@/components/ui/phyrexian-panel';
import { Screen } from '@/components/ui/screen';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';
import { useToast } from '@/contexts/toast-context';
import { colors, spacing } from '@/constants/theme';
import { useProfileDecks } from '@/hooks/use-profile-decks';
import { getSupabaseErrorMessage } from '@/lib/supabase-errors';

export default function ArchivedDecksScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { copy, language } = useLanguage();
  const { showToast } = useToast();
  const { decks, winRates, setDeckArchived, toggleDeckFavorite, loading } = useProfileDecks(user?.id);
  const archivedDecks = useMemo(() => decks.filter((deck) => deck.is_archived), [decks]);

  return (
    <Screen scroll={false}>
      <View style={styles.content}>
        <Button label={language === 'it' ? 'Profilo' : 'Profile'} icon="arrow-back" variant="ghost" onPress={() => router.back()} />
        <Text style={styles.title}>{copy('archivedDecks')}</Text>
        {archivedDecks.length === 0 && !loading ? (
          <PhyrexianPanel style={styles.empty}><Text style={styles.emptyTitle}>{copy('noArchivedDecks')}</Text></PhyrexianPanel>
        ) : (
          <FlashList
            style={styles.deckList}
            data={archivedDecks}
            keyExtractor={(deck) => deck.id}
            contentContainerStyle={styles.list}
            renderItem={({ item: deck }) => (
              <DeckCard
                deck={deck}
                winRate={winRates[deck.id]}
                language={language}
                openDeckLabel={copy('openDeck')}
                viewOnEdhrecLabel={copy('viewOnEdhrec')}
                detailsLabel={copy('details')}
                onDetails={() => undefined}
                hideDetails
                hideDelete
                onDelete={() => undefined}
                onToggleFavorite={() => void toggleDeckFavorite(deck.id, !deck.is_favorite).catch(() => undefined)}
                onArchive={() => void setDeckArchived(deck.id, false).then(() => showToast(copy('deckRestored'))).catch((error) => showToast(getSupabaseErrorMessage(error, copy('saveDeckFailed'))))}
                archiveLabel={copy('restoreDeck')}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: spacing.md },
  deckList: { flex: 1 },
  title: { color: colors.foreground, fontSize: 24, fontWeight: '800' },
  empty: { padding: spacing.xl },
  emptyTitle: { color: colors.foreground, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  list: { paddingBottom: spacing.xl },
});
