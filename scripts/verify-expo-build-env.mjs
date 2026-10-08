const mode = process.argv[2];

if (mode !== 'dev' && mode !== 'production') {
  console.error('Usage: node scripts/verify-expo-build-env.mjs <dev|production>');
  process.exit(1);
}

const required = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_SITE_URL',
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing required build variables: ${missing.join(', ')}`);
  process.exit(1);
}

const values = required.map((name) => process.env[name].toLowerCase());
const containsTestTarget = values.some((value) =>
  value.includes('supabase-staging') ||
  value.includes('supabase-test') ||
  value.includes('dev.phyrexianarena'),
);

if (mode === 'production') {
  const expected = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://phyrexianarena.dpdns.org',
    EXPO_PUBLIC_API_BASE_URL: 'https://app.phyrexianarena.dpdns.org',
    EXPO_PUBLIC_SITE_URL: 'https://app.phyrexianarena.dpdns.org',
  };

  const invalid = Object.entries(expected)
    .filter(([name, value]) => process.env[name]?.replace(/\/$/, '') !== value)
    .map(([name]) => name);

  if (containsTestTarget || invalid.length || process.env.APP_VARIANT === 'dev') {
    console.error(`Refusing Production build: environment isolation failed${invalid.length ? ` (${invalid.join(', ')})` : ''}.`);
    process.exit(1);
  }
}

if (mode === 'dev') {
  const allowedApis = ['https://dev.21life.win', 'https://dev.phyrexianarena.dpdns.org'];
  const allowedBackends = ['https://supabase-dev.21life.win', 'https://supabase-staging.phyrexianarena.dpdns.org'];
  const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL.replace(/\/$/, '');
  const siteUrl = process.env.EXPO_PUBLIC_SITE_URL.replace(/\/$/, '');
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
  if (!allowedBackends.includes(supabaseUrl)
    || !allowedApis.includes(apiUrl) || siteUrl !== apiUrl) {
    console.error('Refusing Dev build: expected Supabase Test and Dev API.');
    process.exit(1);
  }
  if (process.env.APP_VARIANT !== 'dev') {
    console.error('Refusing Dev build: APP_VARIANT must be dev.');
    process.exit(1);
  }
}

console.log(`Environment gate passed for ${mode}.`);
