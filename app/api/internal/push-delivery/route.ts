import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { processPushDeliveries } from "@/lib/push-delivery-worker";
import { logCriticalEvent } from "@/lib/critical-diagnostics";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const secret = process.env.PUSH_DELIVERY_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdminClient();
  if (!admin)
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  try {
    const start = Date.now();
    const result = await processPushDeliveries(admin);
    if (result.processed > 0) logCriticalEvent('push_delivery', 'worker', 'success', { processed: result.processed, durationMs: Date.now() - start });
    return NextResponse.json(result);
  } catch {
    logCriticalEvent('push_delivery', 'worker', 'failed');
    return NextResponse.json(
      { error: "Push processing failed" },
      { status: 503 },
    );
  }
}
