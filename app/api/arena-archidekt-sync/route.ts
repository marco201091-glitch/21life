import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAuthOr401 } from '@/app/api/_lib/require-auth';
import { enforceUserRateLimit } from '@/lib/api-rate-limit';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { ArchidektImportTimeout, ArchidektRateLimited, fetchArchidektSyncDecks } from '@/lib/archidekt-sync-server';
import { logCriticalEvent } from '@/lib/critical-diagnostics';

export const maxDuration = 120;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const headers = { 'X-Request-Id': requestId };
  const auth = await requireAuthOr401(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.groupId !== 'string' || typeof body.userId !== 'string'
    || !UUID.test(body.groupId) || !UUID.test(body.userId)) {
    return NextResponse.json({ error: 'Invalid arena or player.' }, { status: 400 });
  }
  const limited = await enforceUserRateLimit(auth.user.id, 'arenaArchidektSync');
  if (limited) return limited;
  const admin = getSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'Server unavailable.' }, { status: 503 });
  const { data: members, error: membershipError } = await admin.from('group_members')
    .select('user_id').eq('group_id', body.groupId).in('user_id', [auth.user.id, body.userId]);
  if (membershipError) return NextResponse.json({ error: 'Could not verify arena membership.' }, { status: 503 });
  const memberIds = new Set((members || []).map((member) => member.user_id));
  if (!memberIds.has(auth.user.id) || !memberIds.has(body.userId)) {
    return NextResponse.json({ error: 'Both players must belong to this arena.' }, { status: 403 });
  }
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('archidekt_auto_import, archidekt_username').eq('id', body.userId).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Could not verify sync preferences.' }, { status: 503 });
  const username = profile?.archidekt_username?.trim();
  if (!profile?.archidekt_auto_import || !username) {
    return NextResponse.json({ error: 'This player must enable Archidekt sync and configure a username.' }, { status: 409 });
  }
  const targetLimited = await enforceUserRateLimit(body.userId, 'arenaArchidektSyncTarget');
  if (targetLimited) return targetLimited;
  let imported;
  try {
    imported = await fetchArchidektSyncDecks(username);
  } catch (error) {
    const timedOut = error instanceof ArchidektImportTimeout;
    logCriticalEvent('archidekt_sync', 'import', timedOut ? 'timeout' : 'failed', { durationMs: Date.now() - startedAt, requestId });
    return NextResponse.json({ code: timedOut ? 'UPSTREAM_TIMEOUT' : error instanceof ArchidektRateLimited ? 'UPSTREAM_RATE_LIMIT' : 'UPSTREAM_FAILED', error: 'Archidekt could not complete the import. Existing decks have been preserved; please retry.' }, { status: 502, headers });
  }
  const { data, error } = await admin.rpc('sync_archidekt_decks_for_arena', {
    p_group_id: body.groupId, p_user_id: body.userId, p_requested_by: auth.user.id,
    p_username: username, p_decks: imported.decks,
  });
  if (error) {
    logCriticalEvent('archidekt_sync', 'save', 'failed', { durationMs: Date.now() - startedAt, requestId });
    if (error.code === '42501') return NextResponse.json({ error: 'Arena membership or sync permission changed. Please refresh.' }, { status: 403 });
    return NextResponse.json({ code: 'SAVE_FAILED', error: 'Could not save the refreshed decks. Please retry.' }, { status: 500, headers });
  }
  if (!data || !['inserted', 'updated', 'unchanged'].every((key) => Number.isSafeInteger(data[key]) && data[key] >= 0)) {
    logCriticalEvent('archidekt_sync', 'save', 'failed', { durationMs: Date.now() - startedAt, requestId });
    return NextResponse.json({ code: 'SAVE_RESULT_UNCERTAIN', error: 'Could not confirm the sync result.' }, { status: 500, headers });
  }
  logCriticalEvent('archidekt_sync', 'complete', imported.skipped ? 'partial' : 'success', { durationMs: Date.now() - startedAt, skipped: imported.skipped, requestId });
  return NextResponse.json({
    inserted: data?.inserted ?? 0, updated: data?.updated ?? 0,
    unchanged: data?.unchanged ?? 0, skipped: imported.skipped,
  }, { headers });
}
