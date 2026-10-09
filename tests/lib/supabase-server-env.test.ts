import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseServerAnonKey, getSupabaseServerConfig, getSupabaseServerUrl } from '@/lib/supabase/server-env';

afterEach(() => vi.unstubAllEnvs());

function configure(serverUrl?: string, serverKey?: string, publicUrl?: string, publicKey?: string) {
  vi.stubEnv('SUPABASE_URL', serverUrl);
  vi.stubEnv('SUPABASE_ANON_KEY', serverKey);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', publicUrl);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', publicKey);
}

describe('server Supabase configuration', () => {
  it('prefers server credentials over browser configuration', () => {
    configure('https://private.example', 'server-anon', 'https://public.example', 'public-anon');
    expect(getSupabaseServerConfig()).toEqual({ url: 'https://private.example', anonKey: 'server-anon' });
  });
  it('falls back to public configuration when server variables are absent', () => {
    configure(undefined, undefined, 'https://public.example', 'public-anon');
    expect(getSupabaseServerConfig()).toEqual({ url: 'https://public.example', anonKey: 'public-anon' });
  });
  it('returns empty values and rejects entirely missing configuration', () => {
    configure();
    expect(getSupabaseServerUrl()).toBe('');
    expect(getSupabaseServerAnonKey()).toBe('');
    expect(() => getSupabaseServerConfig()).toThrow('Missing server-side Supabase');
  });
  it('rejects a missing URL even with a valid key', () => {
    configure(undefined, 'server-anon');
    expect(() => getSupabaseServerConfig()).toThrow('Missing server-side Supabase');
  });
  it('rejects a missing key even with a valid URL', () => {
    configure('https://private.example');
    expect(() => getSupabaseServerConfig()).toThrow('Missing server-side Supabase');
  });
});
