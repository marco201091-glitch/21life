import * as Sentry from '@sentry/nextjs';
import { getSentryEnvironment } from './lib/sentry-environment';

const enabled = process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true' && Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled,
  environment: getSentryEnvironment(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV),
  release: process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || undefined,
  tracesSampleRate: enabled ? 0.1 : 0,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
