import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('mobile production dependencies', () => {
  it('pins the fixed URI decoder used by Expo Router', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      overrides?: Record<string, string>;
    };
    expect(packageJson.overrides?.['decode-uri-component']).toBe('0.5.1');
  });
});
