import { NextResponse } from 'next/server';
import packageJson from '@/package.json';
import { isPlatformAdministrator } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';

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
  const databaseResult = await admin.from('profiles').select('id', { head: true }).limit(1);
  const databaseLatencyMs = Date.now() - startedAt;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
  const [accessResult, deliveryResult, configResult, telemetryResult] = await Promise.all([
    admin.from('access_logs').select('source, app_version').gte('accessed_at', since).limit(10_000),
    admin.from('notification_delivery_attempts').select('status').gte('attempted_at', new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString()).limit(10_000),
    admin.from('app_runtime_configuration').select('minimum_supported_version, recommended_version, feature_flags, updated_at').eq('id', true).maybeSingle(),
    admin.from('live_game_telemetry').select('mutation_syncs, version_conflicts, failed_syncs, max_queue_depth, slowest_sync_ms, client_platform').gte('updated_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1_000).toISOString()).limit(10_000),
  ]);

  const versions: Record<string, number> = {};
  let webVisits = 0;
  for (const row of accessResult.data ?? []) {
    if (row.source === 'web') webVisits += 1;
    if (row.source === 'app' && row.app_version) versions[row.app_version] = (versions[row.app_version] ?? 0) + 1;
  }
  const deliveries: Record<string, number> = {};
  for (const row of deliveryResult.data ?? []) deliveries[row.status] = (deliveries[row.status] ?? 0) + 1;
  const telemetryRows = telemetryResult.data ?? [];
  const syncAttempts = telemetryRows.reduce((sum, row) => sum + row.mutation_syncs + row.failed_syncs, 0);
  const failedSyncs = telemetryRows.reduce((sum, row) => sum + row.failed_syncs, 0);
  const successfulSyncs = telemetryRows.reduce((sum, row) => sum + row.mutation_syncs, 0);

  return NextResponse.json({
    backend: { version: packageJson.version, commit: process.env.GIT_COMMIT_SHA || 'unknown' },
    database: { ok: !databaseResult.error, latencyMs: databaseLatencyMs },
    expectedLatestMigration: '20260930071738_archidekt_live_game_sync_requests.sql',
    runtimeConfiguration: configResult.data ?? null,
    clientAdoption30d: { appVersions: versions, webVisits, queryLimited: (accessResult.data?.length ?? 0) === 10_000 },
    notificationDeliveries24h: { counts: deliveries, available: !deliveryResult.error },
    liveGameSync14d: {
      available: !telemetryResult.error,
      sessions: telemetryRows.length,
      successfulSyncs,
      failedSyncs,
      failureRate: syncAttempts > 0 ? Math.round((failedSyncs / syncAttempts) * 1_000) / 10 : 0,
      recoveredSessions: telemetryRows.filter((row) => row.failed_syncs > 0 && row.mutation_syncs > 0).length,
      sessionsWithQueue: telemetryRows.filter((row) => row.max_queue_depth > 0).length,
      maxQueueDepth: telemetryRows.reduce((max, row) => Math.max(max, row.max_queue_depth), 0),
      versionConflicts: telemetryRows.reduce((sum, row) => sum + row.version_conflicts, 0),
      slowestSyncMs: telemetryRows.reduce((max, row) => Math.max(max, row.slowest_sync_ms), 0),
      queryLimited: telemetryRows.length === 10_000,
    },
    backupLastSuccessAt: process.env.SUPABASE_BACKUP_LAST_SUCCESS_AT || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
