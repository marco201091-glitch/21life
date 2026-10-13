import { NextResponse } from 'next/server';
import packageJson from '@/package.json';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getClientSupportState } from '@/lib/version-policy';

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

  return NextResponse.json({
    ...config,
    runtimeConfigurationSource,
    currentVersion: requestedVersion,
    supportState: getClientSupportState(
      requestedVersion,
      config.minimumSupportedVersion,
      config.recommendedVersion,
    ),
  }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
