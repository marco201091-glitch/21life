import { describe, expect, it } from 'vitest';
import { compareMigrationManifest, type AppliedMigration, type ExpectedMigration } from '@/lib/migration-status';

const expected: ExpectedMigration[] = [
  { version: '20260101000000', name: '20260101000000_first.sql', checksum: 'a'.repeat(64) },
  { version: '20260102000000', name: '20260102000000_second.sql', checksum: 'b'.repeat(64) },
];
const record = (version: string, name: string, checksum: string): AppliedMigration => ({
  version, name, checksum, applied_at: '2026-01-02T00:00:00Z',
});

describe('migration registry comparison', () => {
  it('distinguishes verified, changed, unrecorded legacy, and outside-checkout migrations', () => {
    const result = compareMigrationManifest(expected, [
      record(expected[0].version, expected[0].name, expected[0].checksum),
      record(expected[1].version, expected[1].name, 'c'.repeat(64)),
      record('20250101000000', '20250101000000_removed.sql', 'd'.repeat(64)),
    ]);
    expect(result.registryAvailable).toBe(true);
    expect(result.migrations.map(({ status }) => status)).toEqual([
      'verified', 'checksum_mismatch', 'applied_not_in_checkout',
    ]);
    expect(result.migrations[0].appliedAt).toBe('2026-01-02T00:00:00Z');
  });

  it('labels missing rows as unverified legacy rather than unapplied', () => {
    expect(compareMigrationManifest(expected, []).migrations.map(({ status }) => status))
      .toEqual(['unverified_legacy', 'unverified_legacy']);
  });

  it('does not present any applied status when the registry is unavailable', () => {
    expect(compareMigrationManifest(expected, null)).toEqual({ registryAvailable: false, migrations: [] });
  });
});
