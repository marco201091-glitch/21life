import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  limit: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/app/api/_lib/require-auth", () => ({
  requireAuthOr401: mocks.auth,
}));
vi.mock("@/lib/api-rate-limit", () => ({ enforceUserRateLimit: mocks.limit }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: mocks.admin,
}));
import { DELETE, POST } from "@/app/api/push-tokens/route";
const session = "11111111-1111-4111-8111-111111111111";
const request = (
  method: string,
  body: unknown,
  claims = { sub: "owner", session_id: session },
) =>
  new Request("http://local", {
    method,
    headers: {
      Authorization:
        "Bearer x." +
        Buffer.from(JSON.stringify(claims)).toString("base64url") +
        ".x",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  mocks.auth.mockResolvedValue({ user: { id: "owner" }, response: null });
  mocks.limit.mockResolvedValue(null);
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
describe("push session registration and revocation", () => {
  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue({
      response: new Response(null, { status: 401 }),
    });
    expect((await DELETE(request("DELETE", {}))).status).toBe(401);
  });
  it("revokes the verified account session atomically", async () => {
    expect(
      (await DELETE(request("DELETE", { token: "ExponentPushToken[test]" })))
        .status,
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_push_device", {
      p_user_id: "owner",
      p_session_id: session,
      p_token: "ExponentPushToken[test]",
      p_revoke_session: true,
    });
  });
  it("rejects a mismatched signed subject even after auth result", async () => {
    expect(
      (
        await POST(
          request(
            "POST",
            { token: "ExponentPushToken[test]", platform: "android" },
            { sub: "other", session_id: session },
          ),
        )
      ).status,
    ).toBe(401);
  });
  it("does not fall back to an unguarded upsert on revocation", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(
      (
        await POST(
          request("POST", {
            token: "ExponentPushToken[test]",
            platform: "android",
          }),
        )
      ).status,
    ).toBe(409);
  });
  it("returns API failure for a failed revocation", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "DB" } });
    expect(
      (await DELETE(request("DELETE", { token: "ExponentPushToken[test]" })))
        .status,
    ).toBe(500);
  });
});
