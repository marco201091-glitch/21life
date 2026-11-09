import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logCriticalEvent } from '@/lib/critical-diagnostics';
import { requireAuthenticatedUser } from '@/app/api/_lib/auth';
import { applyUserRateLimit } from '@/app/api/_lib/with-rate-limit';
import { isDemoEmail } from '@/lib/demo';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getSupabaseServerAnonKey, getSupabaseServerUrl } from '@/lib/supabase/server-env';

export const runtime = 'nodejs';

interface DeleteAccountBody {
  password?: string;
  confirmation?: string;
}

function isProtectedPlatformAccount(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const platformAdmins = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return isDemoEmail(normalizedEmail) || platformAdmins.includes(normalizedEmail);
}

function usesPasswordProvider(user: { app_metadata?: Record<string, unknown> }) {
  const provider = user.app_metadata?.provider;
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers
    : [];

  return provider === 'email' || providers.includes('email');
}

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser(request);
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isProtectedPlatformAccount(user.email)) {
    return NextResponse.json({ error: 'This account cannot be deleted from the app.' }, { status: 403 });
  }

  const rateLimited = await applyUserRateLimit(user, 'accountDelete');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as DeleteAccountBody;
  const password = body.password || '';
  const confirmation = body.confirmation?.trim().toLowerCase() || '';
  const normalizedEmail = user.email.trim().toLowerCase();

  const supabaseUrl = getSupabaseServerUrl();
  const supabaseAnonKey = getSupabaseServerAnonKey();
  const adminClient = getSupabaseAdminClient();
  if (!supabaseUrl || !supabaseAnonKey || !adminClient) {
    return NextResponse.json({ error: 'Account deletion is not configured.' }, { status: 503 });
  }

  if (usesPasswordProvider(user)) {
    const verifier = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const { error: verificationError } = await verifier.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (verificationError) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 403 });
    }
  } else if (confirmation !== normalizedEmail) {
    return NextResponse.json({ error: 'Account confirmation does not match.' }, { status: 403 });
  }

  let stage: 'rate_limits' | 'storage_list' | 'storage_remove' | 'session_revoke' | 'auth_delete' = 'rate_limits';
  try {
    const { error: rateLimitDeleteError } = await adminClient
      .from('api_rate_limits')
      .delete()
      .like('bucket_key', `%:user:${user.id}`);
    if (rateLimitDeleteError) throw rateLimitDeleteError;

    stage = 'storage_list';
    const avatarBucket = adminClient.storage.from('avatars');
    const { data: avatarFiles, error: avatarListError } = await avatarBucket.list(user.id, { limit: 100 });
    if (avatarListError) throw avatarListError;

    if (avatarFiles?.length) {
      stage = 'storage_remove';
      const { error: avatarDeleteError } = await avatarBucket.remove(
        avatarFiles.map((file) => `${user.id}/${file.name}`),
      );
      if (avatarDeleteError) throw avatarDeleteError;
    }

    stage = 'session_revoke';
    const authHeader = request.headers.get('authorization') || '';
    const accessToken = authHeader.slice('Bearer '.length).trim();
    const { error: signOutError } = await adminClient.auth.admin.signOut(accessToken, 'global');
    if (signOutError) throw signOutError;

    stage = 'auth_delete';
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    logCriticalEvent('account_delete', 'delete', 'success');
    return NextResponse.json({ ok: true });
  } catch {
    logCriticalEvent('account_delete', stage, 'failed');
    return NextResponse.json({ error: 'Account deletion failed.' }, { status: 500 });
  }
}
