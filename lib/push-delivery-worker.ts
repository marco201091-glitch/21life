import type { SupabaseClient } from "@supabase/supabase-js";
import { localizeNotification } from "@/lib/notification-copy";
type ProviderResult = {
  status?: string;
  id?: string;
  details?: { error?: string };
};
const permanent = new Set([
  "DeviceNotRegistered",
  "MessageTooBig",
  "InvalidCredentials",
  "MismatchSenderId",
]);
export function deliveryOutcome(
  result: ProviderResult | undefined,
  receipt: boolean,
  attempts: number,
) {
  if (result?.status === "ok")
    return receipt
      ? { status: "delivered", provider_code: null }
      : result.id
        ? { status: "receipt", ticket_id: result.id, provider_code: null }
        : { status: "failed", provider_code: "MISSING_TICKET" };
  const code = result?.details?.error ?? "PROVIDER_UNAVAILABLE";
  return {
    status:
      permanent.has(code) || attempts >= 5
        ? "failed"
        : receipt
          ? "receipt"
          : "pending",
    provider_code: code,
  };
}
type QueueRow = {
  id: string;
  notification_id: string;
  token_id: string;
  user_id: string;
  status: string;
  ticket_id: string | null;
  lease_id: string;
  attempts: number;
  receipt_checks: number;
  created_at: string;
};
async function provider(path: string, body: unknown) {
  try {
    const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      return {
        status: "error",
        details: {
          error:
            response.status === 429 || response.status >= 500
              ? "PROVIDER_UNAVAILABLE"
              : "InvalidCredentials",
        },
      } as ProviderResult;
    const payload = await response.json();
    return payload.data;
  } catch {
    return undefined;
  }
}
export async function processPushDeliveries(admin: SupabaseClient) {
  const claimed = await admin.rpc("claim_push_deliveries", { batch_size: 50 });
  if (claimed.error) throw new Error("PUSH_QUEUE_CLAIM_FAILED");
  const rows = (claimed.data ?? []) as QueueRow[];
  const process = async (row: QueueRow) => {
    const receipt = row.status === "receipt";
    const [
      { data: token, error: tokenError },
      { data: notification, error: notificationError },
      { data: preference, error: preferenceError },
    ] = await Promise.all([
      admin
        .from("push_tokens")
        .select("id,user_id,expo_push_token,locale")
        .eq("id", row.token_id)
        .maybeSingle(),
      admin
        .from("app_notifications")
        .select("type,title,body,data")
        .eq("id", row.notification_id)
        .maybeSingle(),
      admin
        .from("notification_preferences")
        .select("*")
        .eq("user_id", row.user_id)
        .maybeSingle(),
    ]);
    if (tokenError || notificationError || preferenceError)
      throw new Error("PUSH_QUEUE_READ_FAILED");
    const expired =
      Date.now() - Date.parse(row.created_at) > 24 * 60 * 60 * 1000;
    let outcome: Record<string, unknown>;
    if (
      expired ||
      !token ||
      !notification ||
      token.user_id !== row.user_id ||
      preference?.push_enabled === false ||
      preference?.[notification.type] === false
    ) {
      outcome = {
        status: "skipped",
        provider_code: expired ? "EXPIRED" : "RECIPIENT_DISABLED",
      };
    } else {
      let result: ProviderResult | undefined;
      if (receipt) {
        const data = await provider("getReceipts", { ids: [row.ticket_id] });
        result = data?.[row.ticket_id ?? ""];
      } else {
        const content = localizeNotification(
          notification,
          token.locale === "en" ? "en" : "it",
        );
        const data = await provider("send", [
          {
            to: token.expo_push_token,
            title: content.title,
            body: content.body,
            data: { ...notification.data, type: notification.type },
            sound: "default",
            channelId: "default",
            ttl: 3600,
          },
        ]);
        result = Array.isArray(data) ? data[0] : data;
      }
      outcome = deliveryOutcome(
        result,
        receipt,
        receipt ? (row.receipt_checks >= 96 ? 5 : 0) : row.attempts,
      );
      if (result?.details?.error === "DeviceNotRegistered") {
        // Ownership may change while the provider request is in flight.
        const deleted = await admin
          .from("push_tokens")
          .delete()
          .eq("id", token.id)
          .eq("user_id", row.user_id)
          .eq("expo_push_token", token.expo_push_token);
        if (deleted.error) throw new Error("PUSH_TOKEN_DELETE_FAILED");
      }
    }
    const status = String(outcome.status);
    const delay =
      status === "receipt" ? 15 * 60 : Math.min(3600, 30 * 2 ** row.attempts);
    const update = await admin
      .from("push_delivery_queue")
      .update({
        ...outcome,
        attempts: row.attempts + (receipt ? 0 : 1),
        receipt_checks: row.receipt_checks + (receipt ? 1 : 0),
        next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
        lease_id: null,
        lease_until: null,
      })
      .eq("id", row.id)
      .eq("lease_id", row.lease_id);
    if (update.error) throw new Error("PUSH_QUEUE_UPDATE_FAILED");
    const attempt = await admin.from("notification_delivery_attempts").insert({
      notification_id: row.notification_id,
      user_id: row.user_id,
      provider: "expo",
      status:
        status === "delivered"
          ? "sent"
          : status === "failed"
            ? "permanent_error"
            : status === "pending"
              ? "retryable_error"
              : "queued",
      provider_code:
        outcome.provider_code ??
        (status === "receipt" ? "EXPO_ACCEPTED" : null),
    });
    if (attempt.error) throw new Error("PUSH_TELEMETRY_FAILED");
  };
  for (let i = 0; i < rows.length; i += 5) {
    const results = await Promise.allSettled(rows.slice(i, i + 5).map(process));
    if (results.some((result) => result.status === "rejected"))
      throw new Error("PUSH_BATCH_FAILED");
  }
  return { processed: rows.length };
}
