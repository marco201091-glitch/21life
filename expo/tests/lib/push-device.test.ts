import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  os: "android",
  store: new Map<string, string>(),
  post: vi.fn(),
  del: vi.fn(),
  getSession: vi.fn(),
  getPermissions: vi.fn(),
  getToken: vi.fn(),
  read: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return m.os;
    },
  },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { eas: { projectId: "p" } } } },
}));
vi.mock("@/lib/env", () => ({ isFdroidBuild: () => false }));
vi.mock("@/lib/api", () => ({ apiPost: m.post, apiDelete: m.del }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: m.getSession } },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: m.read,
  setItemAsync: async (k: string, v: string) => {
    m.store.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    m.store.delete(k);
  },
}));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: vi.fn(async () => {}),
  getPermissionsAsync: m.getPermissions,
  getExpoPushTokenAsync: m.getToken,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  m.os = "android";
  m.store.clear();
  m.read.mockImplementation(async (k: string) => m.store.get(k) ?? null);
  m.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "session" } },
  });
  m.getPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
  m.getToken.mockResolvedValue({ data: "ExponentPushToken[test]" });
  m.post.mockResolvedValue({ status: 200 });
  m.del.mockResolvedValue({ status: 200 });
});
describe("native registration lifecycle", () => {
  it("revokes candidate after lost POST response", async () => {
    m.post.mockResolvedValue({ status: 0 });
    const service = await import("@/lib/push-device");
    await service.registerCurrentDevice("u", "it");
    expect(service.getPushState()).toBe("error");
    await service.revokeCurrentDevice();
    expect(m.del).toHaveBeenCalledWith(
      "/api/push-tokens",
      { token: "ExponentPushToken[test]" },
      expect.anything(),
    );
  });
  it("revokes persisted token after cold start without registration", async () => {
    m.store.set(
      "21life-push-device",
      JSON.stringify({ userId: "u", token: "ExponentPushToken[cold]" }),
    );
    const service = await import("@/lib/push-device");
    await service.revokeCurrentDevice();
    expect(m.del).toHaveBeenCalledWith(
      "/api/push-tokens",
      { token: "ExponentPushToken[cold]" },
      expect.anything(),
    );
  });
  it("does not access native secure store during web logout", async () => {
    m.os = "web";
    const service = await import("@/lib/push-device");
    await service.revokeCurrentDevice();
    expect(m.read).not.toHaveBeenCalled();
  });
  it("does not register after logout started", async () => {
    const service = await import("@/lib/push-device");
    await service.revokeCurrentDevice();
    await service.registerCurrentDevice("u", "it");
    expect(m.post).not.toHaveBeenCalled();
  });
  it("does not obtain a token without OS permission", async () => {
    m.getPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    const service = await import("@/lib/push-device");
    await service.registerCurrentDevice("u", "it");
    expect(service.getPushState()).toBe("denied");
    expect(m.getToken).not.toHaveBeenCalled();
  });
  it("keeps the session when revocation fails", async () => {
    m.store.set(
      "21life-push-device",
      JSON.stringify({ userId: "u", token: "ExponentPushToken[cold]" }),
    );
    m.del.mockResolvedValue({ status: 0 });
    const service = await import("@/lib/push-device");
    await expect(service.revokeCurrentDevice()).rejects.toThrow(
      "PUSH_UNREGISTER_FAILED",
    );
    expect(m.store.size).toBe(1);
  });
});
