import { FlatList, StyleSheet, View } from 'react-native';
import { MatchCard } from '@/components/table/match-card';
import { MatchDayGroup } from '@/components/table/match-day-group';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { spacing } from '@/constants/theme';
import type { ArenaMatch } from '@/lib/types/arena';

export type MatchDayGroupData = {
  dayKey: string;
  label: string;
  matchCount: number;
  matches: ArenaMatch[];
};

type TableMatchesListProps = {
  dayGroups: MatchDayGroupData[];
  expandedDayKeys: Set<string>;
  emptyTitle: string;
  emptyBody: string;
  recordBattleLabel: string;
  matchCountLabel: (count: number) => string;
  onToggleDay: (dayKey: string, open: boolean) => void;
  onEditMatch: (match: ArenaMatch) => void;
  onShareMatch: (match: ArenaMatch) => void;
  onDeleteMatch: (matchId: string) => void;
  onDetailsMatch: (match: ArenaMatch) => void;
  onRecordBattle: () => void;
  exportDayLabel: string;
  drawLabel: string;
  onExportDay: (dayKey: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreLabel: string;
  loadingMoreLabel: string;
  onLoadMore: () => void;
};

export function TableMatchesList({
  dayGroups,
  expandedDayKeys,
  emptyTitle,
  emptyBody,
  recordBattleLabel,
  matchCountLabel,
  onToggleDay,
  onEditMatch,
  onShareMatch,
  onDeleteMatch,
  onDetailsMatch,
  onRecordBattle,
  exportDayLabel,
  drawLabel,
  onExportDay,
  hasMore,
  loadingMore,
  loadMoreLabel,
  loadingMoreLabel,
  onLoadMore,
}: TableMatchesListProps) {
  if (dayGroups.length === 0) {
    return (
      <EmptyState
        icon="trophy-outline"
        title={emptyTitle}
        body={emptyBody}
        actionLabel={recordBattleLabel}
        onAction={onRecordBattle}
      />
    );
  }

  return (
    <FlatList
      data={dayGroups}
      keyExtractor={(item) => item.dayKey}
      scrollEnabled={false}
      contentContainerStyle={styles.list}
      renderItem={({ item: dayGroup }) => (
        <MatchDayGroup
          label={dayGroup.label}
          matchCount={dayGroup.matchCount}
          matchCountLabel={matchCountLabel(dayGroup.matchCount)}
          exportLabel={exportDayLabel}
          expanded={expandedDayKeys.has(dayGroup.dayKey)}
          onToggle={(open) => onToggleDay(dayGroup.dayKey, open)}
          onExport={() => onExportDay(dayGroup.dayKey)}
        >
          {dayGroup.matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              drawLabel={drawLabel}
              onEdit={() => onEditMatch(match)}
              onShare={() => onShareMatch(match)}
              onDelete={() => onDeleteMatch(match.id)}
              onDetails={(match.tracking_version || match.duration_seconds != null) ? () => onDetailsMatch(match) : undefined}
            />
          ))}
        </MatchDayGroup>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListFooterComponent={hasMore ? (
        <Button
          label={loadingMore ? loadingMoreLabel : loadMoreLabel}
          icon={loadingMore ? 'hourglass-outline' : 'arrow-down-circle-outline'}
          variant="outline"
          disabled={loadingMore}
          onPress={onLoadMore}
          style={styles.loadMore}
        />
      ) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  separator: {
    height: spacing.md,
  },
  loadMore: {
    marginTop: spacing.md,
  },
});
