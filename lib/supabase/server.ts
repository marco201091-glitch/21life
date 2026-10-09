import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAuthCookieOptions } from '@/lib/auth-persistence';
import { getSupabaseAuthStorageKey } from '@/expo/lib/supabase-auth-storage-key';
import { getSupabaseServerConfig } from '@/lib/supabase/server-env';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseServerConfig();

  return createServerClient(
    url,
    anonKey,
    {
      cookieOptions: getAuthCookieOptions(),
      auth: {
        storageKey: getSupabaseAuthStorageKey(url),
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot always write cookies; middleware handles refresh.
          }
        },
      },
    },
  );
}
