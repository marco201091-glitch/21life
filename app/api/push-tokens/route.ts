import { verifiedPushSession } from "@/lib/push-session";
import { NextResponse } from "next/server";
import { requireAuthOr401 } from "@/app/api/_lib/require-auth";
import { enforceUserRateLimit } from "@/lib/api-rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const EXPO_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

export async function POST(request: Request) {
  const auth = await requireAuthOr401(request);
  if (auth.response) return auth.response;
  const sessionId = verifiedPushSession(request, auth.user.id);
  if (!sessionId)
    return NextResponse.json(
      { error: "Invalid push session" },
      { status: 401 },
    );
  const limited = await enforceUserRateLimit(auth.user.id, "pushToken");
  if (limited) return limited;
  const admin = getSupabaseAdminClient();
  if (!admin)
    return NextResponse.json({ error: "Server unavailable" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const platform =
    body.platform === "ios"
      ? "ios"
      : body.platform === "android"
        ? "android"
        : null;
  const locale = body.locale === "en" ? "en" : "it";
  if (!EXPO_TOKEN_RE.test(token) || !platform)
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 });
  const result = await admin.rpc("register_push_device", {
    p_user_id: auth.user.id,
    p_session_id: sessionId,
    p_token: token,
    p_platform: platform,
    p_locale: locale,
  });
  if (result.error)
    return NextResponse.json(
      { error: "Token registration failed" },
      { status: 500 },
    );
  if (result.data !== true)
    return NextResponse.json(
      { error: "Push session revoked" },
      { status: 409 },
    );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuthOr401(request);
  if (auth.response) return auth.response;
  const sessionId = verifiedPushSession(request, auth.user.id);
  if (!sessionId)
    return NextResponse.json(
      { error: "Invalid push session" },
      { status: 401 },
    );
  const limited = await enforceUserRateLimit(auth.user.id, "pushToken");
  if (limited) return limited;
  const admin = getSupabaseAdminClient();
  if (!admin)
    return NextResponse.json({ error: "Server unavailable" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.token !== "string" || !EXPO_TOKEN_RE.test(body.token))
    return NextResponse.json({ error: "Invalid push token" }, { status: 400 });
  const { error } = await admin.rpc("revoke_push_device", {
    p_user_id: auth.user.id,
    p_session_id: sessionId,
    p_token: body.token,
    p_revoke_session: body.revokeSession !== false,
  });
  return error
    ? NextResponse.json({ error: "Token removal failed" }, { status: 500 })
    : NextResponse.json({ ok: true });
}
