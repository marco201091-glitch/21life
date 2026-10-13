import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { applyIpRateLimit } from '@/app/api/_lib/with-rate-limit';
import { DEMO_ACCOUNT_EMAIL, isDemoModeEnabled } from '@/lib/demo';
import { getSupabaseServerConfig } from '@/lib/supabase/server-env';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json({ error: 'Demo mode is not enabled.' }, { status: 404 });
  }

  const rateLimited = await applyIpRateLimit(request, 'authDemoLogin');
  if (rateLimited) return rateLimited;

  const demoEmail = process.env.DEMO_USER_EMAIL || DEMO_ACCOUNT_EMAIL;
  const demoPassword = process.env.DEMO_USER_PASSWORD;

  if (!demoPassword) {
    return NextResponse.json({ error: 'Demo login is not configured.' }, { status: 500 });
  }

  const { url, anonKey } = getSupabaseServerConfig();
  // Signing in replaces a client's auth session. Never use the shared admin
  // client here: it must keep its service-role credentials for subsequent RPCs.
  const demoClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data, error } = await demoClient.auth.signInWithPassword({
    email: demoEmail,
    password: demoPassword,
  });

  if (error || !data.session) {
    console.error('Demo login failed:', error?.message);
    return NextResponse.json({ error: 'Demo login is temporarily unavailable.' }, { status: 503 });
  }

  if (data.user?.app_metadata?.is_demo !== true) {
    return NextResponse.json({ error: 'Demo account is misconfigured.' }, { status: 500 });
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
}
