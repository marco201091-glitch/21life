import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { processPushDeliveries } from "@/lib/push-delivery-worker";
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
    return NextResponse.json(await processPushDeliveries(admin));
  } catch {
    return NextResponse.json(
      { error: "Push processing failed" },
      { status: 503 },
    );
  }
}
