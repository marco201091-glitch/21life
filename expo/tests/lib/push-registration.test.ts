import { describe, it, expect, vi } from "vitest";
import { registerPushDevice } from "@/lib/push-registration";
const setup = () => ({
  allowed: true,
  projectId: "project",
  platform: "android" as const,
  locale: "it",
  isCurrent: () => true,
  getToken: vi.fn(async () => "ExponentPushToken[test]"),
  save: vi.fn(async () => ({ status: 200 })),
  remove: vi.fn(async () => ({ status: 200 })),
});
describe("push device registration", () => {
  it("does not report active when server rejects the token", async () => {
    const d = setup();
    d.save.mockResolvedValue({ status: 500 });
    expect(await registerPushDevice(d)).toEqual({ state: "error" });
  });
  it("does not register without permission", async () => {
    const d = setup();
    d.allowed = false;
    expect(await registerPushDevice(d)).toEqual({ state: "denied" });
    expect(d.getToken).not.toHaveBeenCalled();
  });
  it("rejects missing configuration and native failures", async () => {
    const d = setup();
    d.projectId = "";
    expect(await registerPushDevice(d)).toEqual({ state: "unavailable" });
    d.projectId = "p";
    d.getToken.mockRejectedValue(new Error("private data"));
    expect(await registerPushDevice(d)).toEqual({ state: "error" });
  });
  it("removes a registration completed after session cancellation", async () => {
    const d = setup();
    let active = true;
    d.isCurrent = () => active;
    d.save.mockImplementation(async () => {
      active = false;
      return { status: 200 };
    });
    expect(await registerPushDevice(d)).toEqual({ state: "cancelled" });
    expect(d.remove).toHaveBeenCalledWith("ExponentPushToken[test]");
  });
  it("revokes uncertain saves after cancellation", async () => {
    const d = setup();
    let active = true;
    d.isCurrent = () => active;
    d.save.mockImplementation(async () => {
      active = false;
      return { status: 0 };
    });
    await registerPushDevice(d);
    expect(d.remove).toHaveBeenCalledWith("ExponentPushToken[test]");
  });
  it("returns token only after acknowledged save", async () => {
    const d = setup();
    expect(await registerPushDevice(d)).toEqual({
      state: "registered",
      token: "ExponentPushToken[test]",
    });
  });
});
