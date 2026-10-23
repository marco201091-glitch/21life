import { describe, it, expect, vi, afterEach } from "vitest";
import { processPushDeliveries } from "@/lib/push-delivery-worker";
import type { SupabaseClient } from "@supabase/supabase-js";
const row = {
  id: "q",
  notification_id: "n",
  token_id: "t",
  user_id: "u",
  status: "pending",
  ticket_id: null,
  lease_id: "lease",
  attempts: 0,
  receipt_checks: 0,
  created_at: new Date().toISOString(),
};
function setup(overrides: Record<string, unknown> = {}) {
  const updates: Record<string, unknown>[] = [];
  const values: Record<string, unknown> = {
    push_tokens: {
      id: "t",
      user_id: "u",
      expo_push_token: "ExponentPushToken[test]",
      locale: "en",
    },
    app_notifications: {
      type: "match_completed",
      title: "saved",
      body: "winner",
      data: { groupId: "g" },
    },
    notification_preferences: null,
    ...overrides,
  };
  const admin = {
    rpc: vi.fn(async () => ({ data: [row], error: null })),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: values[table], error: null }),
        }),
      }),
      update: (value: Record<string, unknown>) => {
        updates.push(value);
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
      insert: async () => ({ error: null }),
      delete: () => ({
        eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { admin, updates };
}
afterEach(() => vi.restoreAllMocks());
describe("queue worker integration", () => {
  it("skips tokens reassigned to another account before processing", async () => {
    const { admin, updates } = setup({ push_tokens: { user_id: "other" } });
    const fetch = vi.spyOn(globalThis, "fetch");
    await processPushDeliveries(admin);
    expect(fetch).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: "skipped", lease_id: null });
  });
  it("rechecks disabled preferences before contacting the provider", async () => {
    const { admin, updates } = setup({
      notification_preferences: { push_enabled: false },
    });
    const fetch = vi.spyOn(globalThis, "fetch");
    await processPushDeliveries(admin);
    expect(fetch).not.toHaveBeenCalled();
    expect(updates[0].status).toBe("skipped");
  });
  it("stores ticket and releases lease after accepted send", async () => {
    const { admin, updates } = setup();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ status: "ok", id: "ticket" }] }),
          { status: 200 },
        ),
      );
    await processPushDeliveries(admin);
    expect(updates[0]).toMatchObject({
      status: "receipt",
      ticket_id: "ticket",
      attempts: 1,
      lease_id: null,
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))[0]).toMatchObject({
      channelId: "default",
      data: { groupId: "g" },
    });
  });
  it("polls receipts without resending", async () => {
    const { admin, updates } = setup();
    vi.mocked(admin.rpc).mockResolvedValue({
      data: [{ ...row, status: "receipt", ticket_id: "ticket" }],
      error: null,
    } as never);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { ticket: { status: "ok" } } }), {
          status: 200,
        }),
      );
    await processPushDeliveries(admin);
    expect(fetch.mock.calls[0][0]).toContain("getReceipts");
    expect(updates[0]).toMatchObject({
      status: "delivered",
      receipt_checks: 1,
      attempts: 0,
    });
  });
  it("reschedules transient send failure", async () => {
    const { admin, updates } = setup();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    await processPushDeliveries(admin);
    expect(updates[0]).toMatchObject({
      status: "pending",
      attempts: 1,
      provider_code: "PROVIDER_UNAVAILABLE",
    });
  });
});
