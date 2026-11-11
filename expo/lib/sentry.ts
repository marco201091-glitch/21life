import * as Sentry from '@sentry/react-native';
import { getSentryEnvironment } from './sentry-environment';

export const sentryEnabled =
  process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'true'
  && Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN);

if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    enabled: true,
    environment: getSentryEnvironment(
      process.env.EXPO_PUBLIC_SITE_URL || process.env.EXPO_PUBLIC_API_BASE_URL,
      __DEV__ ? 'development' : 'production',
    ),
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

export { Sentry };
