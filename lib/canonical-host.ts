export const CANONICAL_SITE_ORIGIN = 'https://app.21life.win';

export const TEST_SITE_ORIGIN = 'https://test.21life.win';
export const DEV_SITE_ORIGIN = 'https://dev.21life.win';
export const LEGACY_DEV_SITE_ORIGIN = 'https://dev.phyrexianarena.dpdns.org';

// Installed clients can still return through the original OAuth origins.
export const LEGACY_SITE_ORIGINS = [
  'https://app.phyrexianarena.dpdns.org',
  LEGACY_DEV_SITE_ORIGIN,
  'https://test.phyrexianarena.dpdns.org',
] as const;
