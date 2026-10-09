/** Keep installed clients' sessions when the same backend gets a new hostname. */
export function getSupabaseAuthStorageKey(url: string): string {
  const host = new URL(url).hostname;
  switch (host) {
    case 'supabase-staging.phyrexianarena.dpdns.org':
    case 'supabase-dev.21life.win':
      return 'sb-supabase-staging-auth-token';
    case 'phyrexianarena.dpdns.org':
    case 'supabase.21life.win':
      return 'sb-phyrexianarena-auth-token';
    default:
      return `sb-${host.split('.')[0]}-auth-token`;
  }
}
