import { NextResponse } from 'next/server';
import packageJson from '@/package.json';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { compareAppVersions, getClientSupportState } from '@/lib/version-policy';
import { getLatestReleasedVersion } from '@/lib/latest-release';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FALLBACK = {
  minimumSupportedVersion: '8.1.0',
  recommendedVersion: packageJson.version,
  maintenanceMessageIt: null,
  maintenanceMessageEn: null,
  featureFlags: {},
  releaseNotes: [],
};

export async function GET(request: Request) {
  const requestedVersion = new URL(request.url).searchParams.get('version') || packageJson.version;
  const admin = getSupabaseAdminClient();
  let config = FALLBACK;
  let runtimeConfigurationSource: 'database' | 'fallback' = 'fallback';
  const latestRelease = getLatestReleasedVersion();

  if (admin) {
    const { data, error } = await admin
      .from('app_runtime_configuration')
      .select('minimum_supported_version, recommended_version, maintenance_message_it, maintenance_message_en, feature_flags, release_notes')
      .eq('id', true)
      .maybeSingle();
    if (error) {
      console.error('App runtime configuration unavailable; using package fallback.', error.code ?? 'database_error');
    } else if (data) {
      config = {
        minimumSupportedVersion: data.minimum_supported_version,
        recommendedVersion: data.recommended_version,
        maintenanceMessageIt: data.maintenance_message_it,
        maintenanceMessageEn: data.maintenance_message_en,
        featureFlags: data.feature_flags ?? {},
        releaseNotes: data.release_notes ?? [],
      };
      runtimeConfigurationSource = 'database';
    }
  }

  const latestReleasedVersion = await latestRelease;
  const recommendedVersion = latestReleasedVersion && compareAppVersions(latestReleasedVersion, config.recommendedVersion) > 0
    ? latestReleasedVersion
    : config.recommendedVersion;
  return NextResponse.json({
    ...config,
    recommendedVersion,
    runtimeConfigurationSource,
    currentVersion: requestedVersion,
    latestReleasedVersion,
    releaseUpdateAvailable: latestReleasedVersion !== null && compareAppVersions(requestedVersion, latestReleasedVersion) < 0,
    supportState: getClientSupportState(
      requestedVersion,
      config.minimumSupportedVersion,
      recommendedVersion,
    ),
  }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
