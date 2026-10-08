import { describe, expect, it } from 'vitest';
import {
  DEV_SITE_ORIGIN,
  TEST_SITE_ORIGIN,
} from '@/lib/canonical-host';
import {
  getSafeOAuthReturnOrigin,
  PRODUCTION_SITE_ORIGIN,
} from '@/lib/oauth-return-origin';

describe('oauth-return-origin', () => {
  it('accepts the new 21Life origins alongside installed-client origins', () => {
    for (const origin of ['https://app.21life.win', 'https://dev.21life.win', 'https://test.21life.win', 'https://app.phyrexianarena.dpdns.org', 'https://dev.phyrexianarena.dpdns.org']) {
      expect(getSafeOAuthReturnOrigin(`${origin}/auth/callback`)).toBe(origin);
    }
    expect(getSafeOAuthReturnOrigin('https://dev.21life.win.attacker.example')).toBeNull();
    expect(getSafeOAuthReturnOrigin('http://dev.21life.win')).toBeNull();
  });
  it('accepts only the self-hosted application origins and localhost', () => {
    for (const origin of [
      PRODUCTION_SITE_ORIGIN,
      TEST_SITE_ORIGIN,
      DEV_SITE_ORIGIN,
      'http://localhost:3000',
    ]) {
      expect(getSafeOAuthReturnOrigin(`${origin}/auth/callback`)).toBe(origin);
    }
  });

  it('rejects external, malformed and legacy hosting origins', () => {
    expect(getSafeOAuthReturnOrigin('https://example.com')).toBeNull();
    expect(getSafeOAuthReturnOrigin('https://untrusted.example')).toBeNull();
    expect(getSafeOAuthReturnOrigin('not-a-url')).toBeNull();
    expect(getSafeOAuthReturnOrigin(null)).toBeNull();
  });
});
