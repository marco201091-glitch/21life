export const CANONICAL_SITE_ORIGIN = 'https://app.phyrexianarena.dpdns.org';

export const TEST_SITE_ORIGIN = 'https://test.phyrexianarena.dpdns.org';
export const DEV_SITE_ORIGIN = 'https://dev.phyrexianarena.dpdns.org';

// Additive rollout: canonical URLs switch only after DNS/TLS and Auth are ready.
export const NEW_SITE_ORIGINS = [
  'https://app.21life.win',
  'https://dev.21life.win',
  'https://test.21life.win',
] as const;
