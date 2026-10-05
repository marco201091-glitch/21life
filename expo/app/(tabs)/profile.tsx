import { CollapsiblePanel } from '@/components/ui/collapsible-panel';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { showAppAlert } from '@/lib/app-alert';
import { AddDeckModal } from '@/components/profile/add-deck-modal';
import { DeckCard } from '@/components/profile/deck-card';
import { DeckPerformanceModal } from '@/components/profile/deck-performance-modal';
import { DeckCollectionInsights } from '@/components/profile/deck-collection-insights';
import { EditDeckModal } from '@/components/profile/edit-deck-modal';
import { Button } from '@/components/ui/button';
import { FilterPanel } from '@/components/ui/filter-panel';
import { FilterChip } from '@/components/ui/filter-chip';
import { Input } from '@/components/ui/input';
import { ManaColorFilterChip } from '@/components/ui/mana-color-filter-chip';
import { ProfileSkeleton } from '@/components/ui/screen-skeletons';

import { Screen } from '@/components/ui/screen';
import { PhyrexianPanel } from '@/components/ui/phyrexian-panel';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts/toast-context';
import { useLanguage } from '@/contexts/language-context';
import { hapticSuccess } from '@/lib/haptics';
import { colors, sectionStackGap, spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useProfileDecks } from '@/hooks/use-profile-decks';
import { useScreenInsets } from '@/hooks/use-screen-insets';
import type { CommanderMetadataOption } from '@/lib/deck-metadata';
import { getDeckDisplayColors } from '@/lib/deck-metadata';
import { getDeckMastery } from '@/lib/deck-mastery';
import { MANA_COLOR_ORDER } from '@/lib/mana-colors';
import { getProfileDisplayName } from '@/lib/profile-display';
import { getSupabaseErrorMessage } from '@/lib/supabase-errors';
import type { ProfileDeck } from '@/lib/types/profile';

const MASTERY_TIER_RANK: Record<string, number> = {
  diamond: 5,
  platinum: 4,
  gold: 3,
  silver: 2,
  bronze: 1,
  unranked: 0,
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { copy, language } = useLanguage();
  const { showToast } = useToast();
  const { profile, loading: profileLoading } = useProfile(user?.id);
  const {
    decks,
    winRates,
    performance,
    loading: decksLoading,
    refresh,
    deleteDeck,
    toggleDeckFavorite,
    setDeckArchived,
    saveImportedDeck,
    saveManualDeck,
    refreshImportedDeck,
    refreshAllDecks,
    updateDeck,
    linkDeckSource,
    saveArchidektUserDecks,
    getDeckCommanderOptions,
  } = useProfileDecks(user?.id);

  const [refreshing, setRefreshing] = useState(false);
  const { scrollContentStyle } = useScreenInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [deckColorFilter, setDeckColorFilter] = useState<string[]>([]);
  const [deckSort, setDeckSort] = useState<'alpha' | 'mastery'>('alpha');
  const [detailsDeck, setDetailsDeck] = useState<ProfileDeck | null>(null);
  const [refreshingAllDecks, setRefreshingAllDecks] = useState(false);
  const [showAddDeck, setShowAddDeck] = useState(false);
  const [savingDeck, setSavingDeck] = useState(false);
  const [editingDeck, setEditingDeck] = useState<ProfileDeck | null>(null);
  const [editingDeckOptions, setEditingDeckOptions] = useState<CommanderMetadataOption[]>([]);
  const [savingDeckEdit, setSavingDeckEdit] = useState(false);
  const [refreshingDeckIds, setRefreshingDeckIds] = useState<string[]>([]);
  const existingSourceUrls = useMemo(
    () => decks.map((deck) => deck.source_url).filter((url): url is string => Boolean(url)),
    [decks],
  );

  const filteredDecks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = decks.filter((deck) => {
      if (deck.is_archived) return false;
      if (query) {
        const matchesQuery =
          deck.name.toLowerCase().includes(query) ||
          deck.commander.toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }

      if (deckColorFilter.length) {
        const colors = getDeckDisplayColors(deck);
        if (!deckColorFilter.every((color) => colors.includes(color))) return false;
      }

      return true;
    });
    return filtered.sort((a, b) => {
      const favoriteOrder = Number(b.is_favorite) - Number(a.is_favorite);
      if (favoriteOrder !== 0) return favoriteOrder;
      if (deckSort === 'alpha') return a.name.localeCompare(b.name, language, { sensitivity: 'base' });
      const left = performance[a.id];
      const right = performance[b.id];
      if (deckSort === 'mastery') {
        const leftM = getDeckMastery(left?.gamesPlayed ?? 0, left?.wins ?? 0);
        const rightM = getDeckMastery(right?.gamesPlayed ?? 0, right?.wins ?? 0);
        const tierDiff = (MASTERY_TIER_RANK[rightM.tier] ?? 0) - (MASTERY_TIER_RANK[leftM.tier] ?? 0);
        if (tierDiff !== 0) return tierDiff;
        return rightM.points - leftM.points;
      }
      return a.name.localeCompare(b.name, language, { sensitivity: 'base' });
    });
  }, [deckColorFilter, deckSort, decks, language, performance, searchQuery]);

  const activeDecks = useMemo(() => decks.filter((deck) => !deck.is_archived), [decks]);

  const memberSince = useMemo(() => {
    if (!profile?.created_at) return '';
    const locale = language === 'it' ? 'it-IT' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      year: 'numeric',
    }).format(new Date(profile.created_at));
  }, [language, profile]);

  const personalSnapshot = useMemo(() => {
    const entries = Object.values(performance);
    const games = entries.reduce((sum, item) => sum + item.gamesPlayed, 0);
    const wins = entries.reduce((sum, item) => sum + item.wins, 0);
    const favorite = decks.find((deck) => deck.is_favorite) || decks[0];
    return { games, winRate: games ? Math.round((wins / games) * 100) : 0, favorite };
  }, [decks, performance]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleDeleteDeck = useCallback((deckId: string) => {
    showAppAlert(copy('deleteDeck'), copy('deleteDeckConfirm'), [
      { text: copy('cancel'), style: 'cancel' },
      {
        text: copy('deleteDeck'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDeck(deckId);
            showToast(copy('deckDeleted'));
          } catch (error) {
            showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('saveDeckFailed')));
          }
        },
      },
    ]);
  }, [copy, deleteDeck, showToast]);

  const openEditDeck = useCallback(async (deck: ProfileDeck) => {
    setEditingDeck(deck);
    setEditingDeckOptions([]);
    const options = await getDeckCommanderOptions(deck);
    setEditingDeckOptions(options);
  }, [getDeckCommanderOptions]);

  const handleRefreshAllDecks = async () => {
    setRefreshingAllDecks(true);
    try {
      const result = await refreshAllDecks();
      if (result.skipped) {
        showAppAlert(copy('noRefreshNeeded'));
        return;
      }
      showToast(`${copy('refreshDecksDone')}: ${result.imported} imported · ${result.edhrec} EDHREC`);
    } catch (error) {
      showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('saveDeckFailed')));
    } finally {
      setRefreshingAllDecks(false);
    }
  };

  const handleRefreshDeck = useCallback(async (deck: ProfileDeck) => {
    setRefreshingDeckIds((ids) => [...ids, deck.id]);
    try {
      const update = await refreshImportedDeck(deck);
      if (!update) {
        showAppAlert(copy('deckNotRefreshed'));
        return;
      }
      showToast(`${copy('deckRefreshed')}: ${update.name}`);
    } catch (error) {
      showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('saveDeckFailed')));
    } finally {
      setRefreshingDeckIds((ids) => ids.filter((id) => id !== deck.id));
    }
  }, [copy, refreshImportedDeck, showToast]);

  const renderDeckItem = useCallback(({ item: deck }: { item: ProfileDeck }) => (
    <View style={styles.deckListItem}>
      <DeckCard
        deck={deck}
        winRate={winRates[deck.id]}
        language={language}
        openDeckLabel={copy('openDeck')}
        viewOnEdhrecLabel={copy('viewOnEdhrec')}
        refreshing={refreshingDeckIds.includes(deck.id)}
        detailsLabel={copy('details')}
        onDetails={() => setDetailsDeck(deck)}
        onEdit={() => openEditDeck(deck)}
        onRefresh={() => handleRefreshDeck(deck)}
        onDelete={() => handleDeleteDeck(deck.id)}
        onArchive={() => void setDeckArchived(deck.id, true).then(() => showToast(copy('deckArchived'))).catch((error) => showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('saveDeckFailed'))))}
        archiveLabel={copy('archiveDeck')}
        onToggleFavorite={() => void toggleDeckFavorite(deck.id, !deck.is_favorite).catch((error) => {
          showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('saveDeckFailed')));
        })}
      />
    </View>
  ), [copy, handleDeleteDeck, handleRefreshDeck, language, openEditDeck, refreshingDeckIds, setDeckArchived, showToast, toggleDeckFavorite, winRates]);

  const listHeader = (
    <View style={styles.listHeader}>
        <PhyrexianPanel style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.profileMeta}>
              <Text style={styles.displayName} numberOfLines={1}>
                {getProfileDisplayName(profile)}
              </Text>
              <Text style={styles.username} numberOfLines={1}>@{profile?.username}</Text>
              {user?.email ? <Text style={styles.email} numberOfLines={1}>{user.email}</Text> : null}
              {memberSince ? (
                <Text style={styles.memberSince}>{copy('memberSince')} {memberSince}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.snapshotRow}>
            <View style={styles.snapshot}><Text style={styles.snapshotLabel}>{language === 'it' ? 'Partite' : 'Matches'}</Text><Text style={styles.snapshotValue}>{personalSnapshot.games}</Text></View>
            <View style={styles.snapshot}><Text style={styles.snapshotLabel}>Win rate</Text><Text style={styles.snapshotValue}>{personalSnapshot.winRate}%</Text></View>
            <View style={styles.snapshot}><Text style={styles.snapshotLabel}>{language === 'it' ? 'Mazzi' : 'Decks'}</Text><Text style={styles.snapshotValue}>{activeDecks.length}</Text></View>
          </View>
          <Button label={`${copy('archivedDecks')} (${decks.length - activeDecks.length})`} icon="archive-outline" variant="ghost" size="sm" onPress={() => router.push('/archived-decks')} />
          {personalSnapshot.favorite ? <Text style={styles.favorite}>{language === 'it' ? 'Preferito' : 'Favorite'} · {personalSnapshot.favorite.name}</Text> : null}
        </PhyrexianPanel>

        {activeDecks.length > 0 ? (
          <CollapsiblePanel title={language === 'it' ? 'Analisi mazzi' : 'Decks insights'}>
          <DeckCollectionInsights
            initiallyExpanded
            decks={activeDecks}
            language={language}
            labels={{
              avgBracket: copy('avgBracket'),
              avgCommanderCmc: copy('avgCommanderCmc'),
              decksAnalyzed: (count) =>
                `${count} ${copy(count === 1 ? 'deckAnalyzed' : 'decksAnalyzed')}`,
              details: copy('details'),
              collapse: copy('collapse'),
              mostCommonColors: copy('mostCommonColors'),
              fullColorCombos: copy('fullColorCombos'),
              sources: copy('sources'),
              bracketSpread: copy('bracketSpread'),
              avgColorsPerDeck: (value) => copy('avgColorsPerDeck').replace('{value}', String(value)),
              sourceMoxfield: copy('sourceMoxfield'),
              sourceArchidekt: copy('sourceArchidekt'),
              sourceManual: copy('sourceManual'),
              sourceOther: copy('sourceOther'),
            }}
          />
          </CollapsiblePanel>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{copy('deckArsenal')}</Text>
        </View>

        {activeDecks.length > 0 ? (
          <FilterPanel
            actions={(
              <>
                <Button
                  label={copy('addDeck')}
                  icon="add"
                  size="sm"
                  onPress={() => setShowAddDeck(true)}
                  style={styles.panelActionButton}
                />
                <Button
                  label={refreshingAllDecks ? copy('refreshingDecks') : copy('refreshDecks')}
                  icon="refresh"
                  variant="ghost"
                  size="sm"
                  onPress={() => void handleRefreshAllDecks()}
                  disabled={refreshingAllDecks}
                  style={styles.panelActionButton}
                />
              </>
            )}
            groups={[
              {
                key: 'search',
                title: copy('searchDecks'),
                content: (
                  <Input
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={copy('searchDecksPlaceholder')}
                  />
                ),
              },
              {
                key: 'sort',
                title: copy('sortBy'),
                content: (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                    {([
                      ['alpha', copy('alphabetical')],
                      ['mastery', copy('mastery')],
                    ] as const).map(([value, label]) => (
                      <FilterChip key={value} label={label} active={deckSort === value} onPress={() => setDeckSort(value)} />
                    ))}
                  </ScrollView>
                ),
              },
              {
                key: 'color',
                title: copy('filterByColor'),
                content: (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                    <ManaColorFilterChip
                      label={copy('allColors')}
                      active={deckColorFilter.length === 0}
                      onPress={() => setDeckColorFilter([])}
                    />
                    {MANA_COLOR_ORDER.map((color) => (
                      <ManaColorFilterChip
                        key={color}
                        color={color}
                        active={deckColorFilter.includes(color)}
                        onPress={() => setDeckColorFilter((current) => current.includes(color) ? current.filter((item) => item !== color) : [...current, color])}
                      />
                    ))}
                  </ScrollView>
                ),
              },
            ]}
          />
        ) : null}

      {filteredDecks.length === 0 ? (
        <PhyrexianPanel style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{copy('noDecksTitle')}</Text>
          <Text style={styles.emptyBody}>{copy('noDecksBody')}</Text>
          <Button label={copy('addDeck')} onPress={() => setShowAddDeck(true)} />
        </PhyrexianPanel>
      ) : null}
    </View>
  );

  if (profileLoading && decksLoading && !profile) {
    return <ProfileSkeleton contentStyle={scrollContentStyle} />;
  }

  return (
    <Screen scroll={false} padded={false}>
      <FlashList
        data={filteredDecks}
        keyExtractor={(deck) => deck.id}
        renderItem={renderDeckItem}
        drawDistance={500}
        ListHeaderComponent={listHeader}
        ItemSeparatorComponent={() => <View style={styles.deckSeparator} />}
        contentContainerStyle={scrollContentStyle}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      />

      <AddDeckModal
        visible={showAddDeck}
        saving={savingDeck}
        existingSourceUrls={existingSourceUrls}
        initialArchidektUsername={profile?.archidekt_username || ''}
        labels={{
          title: copy('addDeckTitle'),
          importTab: copy('importTab'),
          manualTab: copy('manualTab'),
          archidektTab: copy('archidektTab'),
          importHint: copy('importDeckHint'),
          deckUrl: copy('deckUrl'),
          deckUrlPlaceholder: copy('deckUrlPlaceholder'),
          import: copy('importDeck'),
          importing: copy('importingDeck'),
          importFailed: copy('importDeckFailed'),
          preview: copy('importPreview'),
          deckName: copy('deckName'),
          deckNamePlaceholder: copy('deckNamePlaceholder'),
          searchCommander: copy('searchCommander'),
          searchPlaceholder: copy('searchPlaceholder'),
          searching: copy('searching'),
          noResults: copy('noCommanderResults'),
          selectedCommander: copy('selectedCommander'),
          partnerHint: copy('partnerHint'),
          chooseCommanderArt: copy('chooseCommanderArt'),
          loadingArts: copy('loadingArts'),
          noArtsFound: copy('noArtsFound'),
          printing: copy('printing'),
          chooseCommanderToDisplay: copy('chooseCommanderToDisplay'),
          commanderRequired: copy('commanderRequired'),
          archidektUsername: copy('archidektUsername'),
          archidektUsernamePlaceholder: copy('archidektUsernamePlaceholder'),
          archidektPublicHint: copy('archidektPublicHint'),
          loadDecks: copy('loadDecks'),
          loadingDecks: copy('loadingDecks'),
          decksSelected: copy('decksSelected'),
          archidektBatchCommanderHint: copy('archidektBatchCommanderHint'),
          all: copy('all'),
          none: copy('none'),
          alreadySaved: copy('alreadySaved'),
          saveDecks: copy('saveDecks'),
          noNewDecks: copy('noNewDecks'),
          overwriteDeckTitle: copy('overwriteDeckTitle'),
          overwriteDeckMessage: copy('overwriteDeckMessage'),
          overwriteDecksTitle: copy('overwriteDecksTitle'),
          overwriteDecksMessage: copy('overwriteDecksMessage'),
          overwrite: copy('overwrite'),
          skipDuplicates: copy('skipDuplicates'),
          cancel: copy('cancel'),
          save: copy('save'),
          saving: copy('saving'),
          back: copy('back'),
        }}
        onClose={() => setShowAddDeck(false)}
        onError={(message) => showAppAlert(copy('error'), message)}
        onSaveImported={async (imported, options) => {
          setSavingDeck(true);
          try {
            const result = await saveImportedDeck(imported, options);
            if (result.inserted === 0 && result.updated === 0) {
              return result;
            }
            setShowAddDeck(false);
            void hapticSuccess();
            showToast(result.updated > 0 ? copy('deckUpdated') : copy('deckAdded'));
            return result;
          } catch (error) {
            showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('saveDeckFailed')));
            return { inserted: 0, updated: 0, skipped: 0 };
          } finally {
            setSavingDeck(false);
          }
        }}
        onSaveManual={async (input) => {
          setSavingDeck(true);
          try {
            await saveManualDeck(input);
            setShowAddDeck(false);
            void hapticSuccess();
            showToast(copy('deckCreated'));
          } catch (error) {
            showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('saveDeckFailed')));
          } finally {
            setSavingDeck(false);
          }
        }}
        onSaveArchidektBatch={async (input) => {
          setSavingDeck(true);
          try {
            const result = await saveArchidektUserDecks(input);
            if (result.inserted > 0 || result.updated > 0) {
              setShowAddDeck(false);
              void hapticSuccess();
              if (result.inserted > 0 && result.updated > 0) {
                showToast(copy('decksImportedAndUpdated')
                  .replace('{inserted}', String(result.inserted))
                  .replace('{updated}', String(result.updated)));
              } else if (result.updated > 0) {
                showToast(copy('decksUpdated').replace('{count}', String(result.updated)));
              } else {
                showToast(copy('deckAdded'));
              }
            }
            return result;
          } catch (error) {
            showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('saveDeckFailed')));
            return { inserted: 0, updated: 0, skipped: 0 };
          } finally {
            setSavingDeck(false);
          }
        }}
      />

      <EditDeckModal
        visible={Boolean(editingDeck)}
        saving={savingDeckEdit}
        deck={editingDeck}
        commanderOptions={editingDeckOptions}
        labels={{
          title: copy('editCommander'),
          commanderToDisplay: copy('commanderToDisplay'),
          chooseCommanderArt: copy('chooseCommanderArt'),
          loadingArts: copy('loadingArts'),
          noArtsFound: copy('noArtsFound'),
          printing: copy('printing'),
          saveSelectedCommander: copy('saveSelectedCommander'),
          close: copy('close'),
          saving: copy('saving'),
          linkSource: language === 'it' ? 'Collega lista esterna' : 'Link external list',
          linkSourceHint: language === 'it'
            ? 'Archidekt o Moxfield: il mazzo mantiene nome e comandante, poi puo aggiornarsi dalla sorgente.'
            : 'Archidekt or Moxfield: the deck keeps its name and commander, then can refresh from its source.',
          linkSourceAction: language === 'it' ? 'Collega lista' : 'Link list',
        }}
        onClose={() => {
          setEditingDeck(null);
          setEditingDeckOptions([]);
        }}
        onLoadOptions={getDeckCommanderOptions}
        onSave={async (input) => {
          if (!editingDeck) return;
          setSavingDeckEdit(true);
          try {
            await updateDeck(editingDeck.id, {
              commander: input.commander,
              commanderImage: input.commanderImage,
              commanderOptions: input.commanderOptions,
            });
            setEditingDeck(null);
            setEditingDeckOptions([]);
            showToast(copy('commanderUpdated'));
          } catch (error) {
            showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('saveDeckFailed')));
          } finally {
            setSavingDeckEdit(false);
          }
        }}
        onLinkSource={async (sourceUrl) => {
          if (!editingDeck) return;
          setSavingDeckEdit(true);
          try {
            await linkDeckSource(editingDeck, sourceUrl);
            void hapticSuccess();
            showToast(language === 'it' ? 'Lista collegata' : 'List linked');
          } catch (error) {
            showAppAlert(copy('error'), getSupabaseErrorMessage(error, copy('saveDeckFailed')));
          } finally {
            setSavingDeckEdit(false);
          }
        }}
      />

      <DeckPerformanceModal
        visible={Boolean(detailsDeck)}
        deck={detailsDeck}
        performance={detailsDeck ? performance[detailsDeck.id] : undefined}
        onClose={() => setDetailsDeck(null)}
        labels={{
          title: copy('deckPerformance'),
          games: copy('games'),
          wins: copy('wins'),
          draws: language === 'it' ? 'Patte' : 'Draws',
          losses: language === 'it' ? 'Sconfitte' : 'Losses',
          winRate: copy('winRate'),
          secondPlaces: copy('secondPlaces'),
          damageDealt: copy('damageDealt'),
          lifeLost: copy('lifeLost'),
          lifeGained: copy('lifeGained'),
          commanderDamage: copy('commanderDamage'),
          infectDealt: copy('infectDealt'),
          eliminations: copy('eliminations'),
          fastestWin: copy('fastestWin'),
          trackingCoverage: copy('trackingCoverage'),
        }}
      />

    </Screen>
  );
}

const styles = StyleSheet.create({
  snapshotRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  snapshot: { flex: 1, borderRadius: 10, backgroundColor: colors.surfaceRaised, padding: 10 },
  snapshotLabel: { color: colors.muted, fontSize: 11 },
  snapshotValue: { color: colors.foreground, fontSize: 20, fontWeight: '900', marginTop: 2 },
  favorite: { color: '#fde68a', fontSize: 12, fontWeight: '700', marginTop: spacing.xs },
  listHeader: {
    gap: sectionStackGap,
  },
  profileCard: {
    gap: spacing.sm,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileMeta: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  panelActionButton: {
    flex: 1,
  },
  filterRow: {
    gap: 8,
    paddingBottom: 4,
  },
  displayName: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '700',
  },
  username: {
    color: colors.primaryMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  email: {
    color: colors.muted,
    fontSize: 13,
  },
  memberSince: {
    color: colors.muted,
    fontSize: 12,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '700',
  },
  deckSeparator: {
    height: 10,
  },
  deckListItem: {
    width: '100%',
    minWidth: 0,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '600',
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
