import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const base = require('../../expo/app.json').expo;
const configure = require('../../expo/app.config.js');

for (const variant of ['production', 'dev', 'fdroid']) {
  test(`${variant}: new domains preserve identity and legacy links`, () => {
    const previous = process.env.APP_VARIANT;
    process.env.APP_VARIANT = variant;
    try {
      const config = configure({ config: base });
      const isDev = variant === 'dev';
      const prefix = isDev ? 'dev' : 'app';
      const packageId = `com.phyrexianarena.app${isDev ? '.dev' : ''}`;
      assert.equal(config.android.package, packageId);
      assert.equal(config.ios.bundleIdentifier, packageId);
      assert.equal(config.scheme, isDev ? 'phyrexianarena-dev' : 'phyrexianarena');
      const hosts = config.android.intentFilters.flatMap(f => f.data).map(d => d.host);
      assert.ok(hosts.includes(`${prefix}.21life.win`));
      assert.ok(hosts.includes(`${prefix}.phyrexianarena.dpdns.org`));
      assert.ok(!hosts.includes(`${isDev ? 'app' : 'dev'}.21life.win`));
      assert.ok(config.ios.associatedDomains.includes(`applinks:${prefix}.21life.win`));
      assert.ok(config.ios.associatedDomains.includes(`applinks:${prefix}.phyrexianarena.dpdns.org`));
      assert.equal(config.extra.eas.projectId, base.extra.eas.projectId);
    } finally {
      if (previous === undefined) delete process.env.APP_VARIANT;
      else process.env.APP_VARIANT = previous;
    }
  });
}
