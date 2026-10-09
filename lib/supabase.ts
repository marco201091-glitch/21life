import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthCookieOptions } from '@/lib/auth-persistence';
import { getSupabaseAuthStorageKey } from '@/expo/lib/supabase-auth-storage-key';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: SupabaseClient | null = null;

export function createBrowserSupabaseClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getAuthCookieOptions(),
    auth: {
      storageKey: getSupabaseAuthStorageKey(supabaseUrl),
      // Callback exchange is handled explicitly in /auth/callback route.
      detectSessionInUrl: false,
    },
  });
}

function getClient() {
  if (!browserClient) {
    browserClient = createBrowserSupabaseClient();
  }
  return browserClient;
}

export function resetSupabaseClient() {
  browserClient = createBrowserSupabaseClient();
  return browserClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
