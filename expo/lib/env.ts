export function getSupabaseUrl() {
  return process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
}

export function getSupabaseAnonKey() {
  return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
}

export function getApiBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://app.phyrexianarena.dpdns.org').replace(/\/$/, '');
}

export function getSiteUrl() {
  return (process.env.EXPO_PUBLIC_SITE_URL ?? getApiBaseUrl()).replace(/\/$/, '');
}

export function getTurnstileSiteKey() {
  return process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';
}

export function getSupportEmail() {
  return process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@21life.win';
}

export function isFdroidBuild() {
  return process.env.EXPO_PUBLIC_FDROID_BUILD === 'true';
}

export function assertExpoEnv() {
  if (!getSupabaseUrl() || !getSupabaseAnonKey()) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy expo/.env.example to expo/.env');
  }
}
