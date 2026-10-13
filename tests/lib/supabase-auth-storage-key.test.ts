import { describe, expect, it } from 'vitest';
import { getSupabaseAuthStorageKey } from '../../expo/lib/supabase-auth-storage-key';

describe('Supabase session persistence across domain migration', () => {
  it('keeps existing Dev and production storage names on the new hosts', () => {
    expect(getSupabaseAuthStorageKey('https://supabase-dev.21life.win')).toBe('sb-supabase-staging-auth-token');
    expect(getSupabaseAuthStorageKey('https://supabase-staging.phyrexianarena.dpdns.org')).toBe('sb-supabase-staging-auth-token');
    expect(getSupabaseAuthStorageKey('https://supabase.21life.win')).toBe('sb-phyrexianarena-auth-token');
    expect(getSupabaseAuthStorageKey('https://phyrexianarena.dpdns.org')).toBe('sb-phyrexianarena-auth-token');
  });
  it('leaves unrelated installations to the SDK default', () => {
    expect(getSupabaseAuthStorageKey('https://other.supabase.co')).toBe('sb-other-auth-token');
    expect(getSupabaseAuthStorageKey('http://localhost:54321')).toBe('sb-localhost-auth-token');
    expect(getSupabaseAuthStorageKey('https://supabase-dev.21life.win.attacker.example')).toBe('sb-supabase-dev-auth-token');
  });
});
