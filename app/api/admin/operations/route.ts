import { NextResponse } from 'next/server';
import packageJson from '@/package.json';
import { isPlatformAdministrator } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import migrationManifest from '@/lib/migration-manifest.json';
import { compareMigrationManifest, type AppliedMigration } from '@/lib/migration-status';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isPlatformAdministrator(supabase, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const admin = getSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'Server unavailable' }, { status: 503 });

  const startedAt = Date.now();
  const rpcClient = admin as unknown as {
    rpc: (name: string) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const [metricsResult, configResult, registryResult] = await Promise.all([
    rpcClient.rpc('get_admin_operations_metrics'),
    admin.from('app_runtime_configuration').select('minimum_supported_version, recommended_version, feature_flags, updated_at').eq('id', true).maybeSingle(),
    rpcClient.rpc('get_admin_migration_registry'),
  ]);
  const databaseLatencyMs = Date.now() - startedAt;
  const metrics = metricsResult.error || !metricsResult.data || typeof metricsResult.data !== 'object'
    ? null
    : metricsResult.data as Record<string, unknown>;

  return NextResponse.json({
    backend: { version: packageJson.version, commit: process.env.GIT_COMMIT_SHA || 'unknown' },
    database: { ok: metrics !== null, latencyMs: databaseLatencyMs },
    expectedLatestMigration: migrationManifest.migrations.at(-1)?.name ?? 'unknown',
    migrationRegistry: compareMigrationManifest(
      migrationManifest.migrations,
      registryResult.error || !Array.isArray(registryResult.data)
        ? null
        : registryResult.data as AppliedMigration[],
    ),
    runtimeConfiguration: configResult.data ?? null,
    clientAdoption30d: metrics?.clientAdoption30d ?? { appVersions: {}, webVisits: 0, queryLimited: false, available: false },
    notificationDeliveries24h: metrics?.notificationDeliveries24h ?? { counts: {}, available: false },
    liveGameSync14d: metrics?.liveGameSync14d ?? {
      available: false,
      sessions: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      failureRate: 0,
      recoveredSessions: 0,
      sessionsWithQueue: 0,
      maxQueueDepth: 0,
      versionConflicts: 0,
      slowestSyncMs: 0,
      queryLimited: false,
    },
    metricsAsOf: metrics?.asOf ?? null,
    metricsError: metricsResult.error ? 'unavailable' : null,
    backupLastSuccessAt: process.env.SUPABASE_BACKUP_LAST_SUCCESS_AT || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
