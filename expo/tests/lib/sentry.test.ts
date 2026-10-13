import { afterEach, expect, it, vi } from 'vitest';

import { Sentry, sentryEnabled } from '@/lib/sentry';

afterEach(() => vi.unstubAllEnvs());

it('keeps diagnostics disabled even when build variables request them', async () => {
  vi.stubEnv('EXPO_PUBLIC_SENTRY_ENABLED', 'true');
  vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://example.invalid/diagnostics');
  vi.resetModules();
  const runtime = await import('@/lib/sentry');
  expect(runtime.sentryEnabled).toBe(false);
});

it('preserves the root component without introducing a diagnostics wrapper', () => {
  const Root = () => null;
  expect(sentryEnabled).toBe(false);
  expect(Sentry.wrap(Root)).toBe(Root);
});
