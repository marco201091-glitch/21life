CREATE OR REPLACE FUNCTION public.get_admin_operations_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH reference AS (
    SELECT pg_catalog.statement_timestamp() AS as_of
  ), adoption AS (
    SELECT
      coalesce((
        SELECT pg_catalog.jsonb_object_agg(versions.version, versions.visits)
        FROM (
          SELECT app_version AS version, pg_catalog.count(*) AS visits
          FROM public.access_logs, reference
          WHERE source = 'app' AND app_version IS NOT NULL
            AND accessed_at >= reference.as_of - interval '30 days'
          GROUP BY app_version
        ) AS versions
      ), '{}'::jsonb) AS app_versions,
      (
        SELECT pg_catalog.count(*)
        FROM public.access_logs, reference
        WHERE source = 'web' AND accessed_at >= reference.as_of - interval '30 days'
      ) AS web_visits
    FROM reference
  ), deliveries AS (
    SELECT coalesce(pg_catalog.jsonb_object_agg(status, attempts), '{}'::jsonb) AS counts
    FROM (
      SELECT status, pg_catalog.count(*) AS attempts
      FROM public.notification_delivery_attempts, reference
      WHERE attempted_at >= reference.as_of - interval '24 hours'
      GROUP BY status
    ) AS grouped
  ), telemetry AS (
    SELECT
      pg_catalog.count(*) AS sessions,
      coalesce(pg_catalog.sum(mutation_syncs), 0) AS successful_syncs,
      coalesce(pg_catalog.sum(failed_syncs), 0) AS failed_syncs,
      pg_catalog.count(*) FILTER (WHERE failed_syncs > 0 AND mutation_syncs > 0) AS recovered_sessions,
      pg_catalog.count(*) FILTER (WHERE max_queue_depth > 0) AS sessions_with_queue,
      coalesce(pg_catalog.max(max_queue_depth), 0) AS max_queue_depth,
      coalesce(pg_catalog.sum(version_conflicts), 0) AS version_conflicts,
      coalesce(pg_catalog.max(slowest_sync_ms), 0) AS slowest_sync_ms
    FROM public.live_game_telemetry, reference
    WHERE updated_at >= reference.as_of - interval '14 days'
  )
  SELECT pg_catalog.jsonb_build_object(
    'asOf', reference.as_of,
    'clientAdoption30d', pg_catalog.jsonb_build_object(
      'appVersions', adoption.app_versions,
      'webVisits', adoption.web_visits,
      'queryLimited', false,
      'available', true
    ),
    'notificationDeliveries24h', pg_catalog.jsonb_build_object(
      'counts', deliveries.counts,
      'available', true
    ),
    'liveGameSync14d', pg_catalog.jsonb_build_object(
      'available', true,
      'sessions', telemetry.sessions,
      'successfulSyncs', telemetry.successful_syncs,
      'failedSyncs', telemetry.failed_syncs,
      'failureRate', CASE
        WHEN telemetry.successful_syncs + telemetry.failed_syncs > 0
          THEN pg_catalog.round(telemetry.failed_syncs * 1000.0 /
            (telemetry.successful_syncs + telemetry.failed_syncs)) / 10
        ELSE 0
      END,
      'recoveredSessions', telemetry.recovered_sessions,
      'sessionsWithQueue', telemetry.sessions_with_queue,
      'maxQueueDepth', telemetry.max_queue_depth,
      'versionConflicts', telemetry.version_conflicts,
      'slowestSyncMs', telemetry.slowest_sync_ms,
      'queryLimited', false
    )
  )
  FROM reference CROSS JOIN adoption CROSS JOIN deliveries CROSS JOIN telemetry;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_operations_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_operations_metrics() TO service_role;
