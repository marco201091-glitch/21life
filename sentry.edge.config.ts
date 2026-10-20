import * as Sentry from '@sentry/nextjs';
import { getSentryEnvironment } from './lib/sentry-environment';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true' && Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: getSentryEnvironment(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV),
  release: process.env.GIT_COMMIT_SHA || undefined,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
