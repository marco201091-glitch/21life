export type ExpectedMigration = { version: string; name: string; checksum: string };
export type AppliedMigration = { version: string; name: string; checksum: string; applied_at: string };

export type MigrationStatus = {
  registryAvailable: boolean;
  migrations: Array<ExpectedMigration & { status: 'verified' | 'checksum_mismatch' | 'unverified_legacy' | 'applied_not_in_checkout'; appliedAt?: string }>;
};

export function compareMigrationManifest(
  expected: ExpectedMigration[],
  applied: AppliedMigration[] | null,
): MigrationStatus {
  if (applied === null) return { registryAvailable: false, migrations: [] };
  const recorded = new Map(applied.map((migration) => [migration.version, migration]));
  const checkedOut = new Set(expected.map((migration) => migration.version));
  const migrations: MigrationStatus['migrations'] = expected.map((migration) => {
    const record = recorded.get(migration.version);
    return {
      ...migration,
      status: !record ? 'unverified_legacy' as const
        : record.checksum === migration.checksum ? 'verified' as const : 'checksum_mismatch' as const,
      ...(record ? { appliedAt: record.applied_at } : {}),
    };
  });
  for (const record of applied) {
    if (!checkedOut.has(record.version)) {
      migrations.push({ ...record, status: 'applied_not_in_checkout', appliedAt: record.applied_at });
    }
  }
  return { registryAvailable: true, migrations };
}
