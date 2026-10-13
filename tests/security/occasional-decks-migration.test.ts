import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const file = readdirSync('supabase/migrations').find(name => name.endsWith('_occasional_decks.sql'))!;
const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
describe('occasional decks SQL security contract', () => {
  it('requires authentication and both actor and registered player membership', () => {
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('public.is_group_member(p_group_id, v_actor)');
    expect(sql).toContain('public.is_group_member(p_group_id, p_user_id)');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('FROM PUBLIC, anon');
    expect(sql).toContain('TO authenticated');
  });
  it('serializes same-ID retries and refuses different input without overwriting', () => {
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).toContain('IS DISTINCT FROM p_user_id');
    expect(sql).toContain('IS DISTINCT FROM p_group_id');
    expect(sql).toContain('IS DISTINCT FROM pg_catalog.btrim(p_name)');
    expect(sql).not.toContain('DO UPDATE');
  });
  it('guards direct writes at both participant and live JSON boundaries', () => {
    expect(sql).toContain('ON public.match_participants');
    expect(sql).toContain('ON public.live_games');
    expect(sql).toContain('v_deck.user_id IS DISTINCT FROM NEW.user_id');
    expect(sql).toContain("player ->> 'participantKey' IS DISTINCT FROM ('user:' || v_deck.user_id::text)");
    expect(sql).toContain('v_deck.group_id IS DISTINCT FROM NEW.group_id');
    expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY/i);
  });
  it('keeps occasional identities immutable and refreshes edited deck snapshots', () => {
    expect(sql).toContain('NEW.id IS DISTINCT FROM OLD.id');
    const snapshots = readFileSync('supabase/migrations/20260720101717_sync_postgame_deck_snapshots.sql', 'utf8');
    expect(snapshots).toContain('NEW.deck_name_snapshot = v_deck_name');
    expect(snapshots).toContain('NEW.commander_snapshot = v_commander');
    expect(snapshots).toContain('UPDATE OF deck_id, guest_deck_id');
    expect(sql).toContain('deck.source_type IS DISTINCT FROM \'occasional\'');
  });
});
