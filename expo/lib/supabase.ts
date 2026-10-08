import '@/lib/crypto-polyfill';
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { authStorage } from '@/lib/auth-persistence';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/env';
import { getSupabaseAuthStorageKey } from '@/lib/supabase-auth-storage-key';

export const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
  auth: {
    storageKey: getSupabaseAuthStorageKey(getSupabaseUrl()),
    flowType: 'pkce',
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
