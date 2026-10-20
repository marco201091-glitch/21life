import { describe, expect, it } from 'vitest';
import { getSentryEnvironment } from '@/lib/sentry-environment';

describe('Sentry deployment environment', () => {
  it('separates deployed Dev and Test from production builds', () => {
    for (const origin of ['https://dev.21life.win', 'https://dev.phyrexianarena.dpdns.org']) {
      expect(getSentryEnvironment(origin, 'production')).toBe('development');
    }
    expect(getSentryEnvironment('https://test.21life.win', 'production')).toBe('test');
    expect(getSentryEnvironment('https://test.phyrexianarena.dpdns.org', 'production')).toBe('test');
    expect(getSentryEnvironment('http://localhost:3000', 'production')).toBe('development');
  });

  it('keeps production reporting and safe fallback when the site is missing', () => {
    expect(getSentryEnvironment('https://app.21life.win', 'production')).toBe('production');
    expect(getSentryEnvironment('https://app.phyrexianarena.dpdns.org', 'production')).toBe('production');
    expect(getSentryEnvironment(undefined, 'test')).toBe('test');
    expect(getSentryEnvironment('invalid', 'development')).toBe('development');
  });
});
