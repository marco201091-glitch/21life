import {
  CANONICAL_SITE_ORIGIN,
  DEV_SITE_ORIGIN,
  TEST_SITE_ORIGIN,
  NEW_SITE_ORIGINS,
  LEGACY_DEV_SITE_ORIGIN,
} from '@/lib/canonical-host';

export const PRODUCTION_SITE_ORIGIN = CANONICAL_SITE_ORIGIN;

export const ALLOWED_OAUTH_RETURN_ORIGINS = [
  PRODUCTION_SITE_ORIGIN,
  TEST_SITE_ORIGIN,
  DEV_SITE_ORIGIN,
  LEGACY_DEV_SITE_ORIGIN,
  ...NEW_SITE_ORIGINS,
  'http://localhost:3000',
] as const;

export function getSafeOAuthReturnOrigin(origin: string | null | undefined) {
  if (!origin) return null;

  try {
    const normalized = new URL(origin).origin;
    return ALLOWED_OAUTH_RETURN_ORIGINS.includes(
      normalized as (typeof ALLOWED_OAUTH_RETURN_ORIGINS)[number],
    )
      ? normalized
      : null;
  } catch {
    return null;
  }
}
