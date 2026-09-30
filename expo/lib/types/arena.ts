import type { MatchParticipantRecord } from '@/lib/arena-participants';

export interface ArenaProfile {
  id: string;
  username: string;
  display_name: string | null;
  archidekt_auto_import?: boolean;
}

export interface MemberDeck {
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
  is_favorite: boolean;
  created_at: string;
}

export interface ArenaMatch {
  id: string;
  group_id: string;
  winner_id: string | null;
  winner_guest_id?: string | null;
  is_draw?: boolean;
  played_at: string;
  created_by: string;
  notes: string | null;
  starting_life?: number | null;
  duration_seconds?: number | null;
  live_game_log?: unknown[];
  win_condition?: 'last_standing' | 'combo' | 'concession' | 'alternate_card' | 'other' | null;
  tracking_version?: number | null;
  winner: ArenaProfile | null;
  winner_guest?: { id: string; display_name: string } | null;
  match_participants: MatchParticipantRecord[];
}

export interface ArenaGroupMember {
  user_id: string;
  profiles: ArenaProfile;
}

export interface ArenaDetail {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  created_by: string;
  created_at: string;
  is_public?: boolean;
  seasons_enabled?: boolean;
  season_reset_month?: number;
  profiles: ArenaProfile;
  group_members: ArenaGroupMember[];
}

export interface PlayerStats {
  key: string;
  displayName: string;
  isGuest: boolean;
  profile: ArenaProfile | null;
  /** Every match, draws included. */
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  /** Matches that produced a winner: the win rate denominator. */
  decisiveGames: number;
  winRate: number;
}
