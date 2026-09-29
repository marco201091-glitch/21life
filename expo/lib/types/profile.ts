import type { CommanderMetadataOption } from '@/lib/deck-metadata';
import type { MatchRecord } from '@/lib/win-rate';

export interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  created_at: string;
  archidekt_username?: string | null;
  archidekt_auto_import?: boolean;
  archidekt_last_sync_at?: string | null;
}

export interface ProfileDeck {
  id: string;
  user_id: string;
  group_id: string | null;
  name: string;
  commander: string;
  commander_image: string | null;
  source_url: string | null;
  source_type: string | null;
  bracket: string | null;
  color_identity: string[] | null;
  commander_options: CommanderMetadataOption[] | null;
  commander_cmc: number | null;
  is_favorite?: boolean;
  is_archived?: boolean;
  created_at: string;
  updated_at: string;
}

export type DeckWinRate = MatchRecord;

export interface DeckPerformance extends DeckWinRate {
  masteryPoints: number;
  trackedGames: number;
  trackingCoverage: number;
  secondPlaces: number;
  damageDealt: number;
  damageTaken: number;
  lifeGained: number;
  commanderDamage: number;
  infectDealt: number;
  eliminations: number;
  medianWinningDurationSeconds: number | null;
}
