import { describe, expect, it } from "vitest";
import { getNotificationsModule, getPushState, registerCurrentDevice, revokeCurrentDevice } from "@/lib/push-device";
describe("F-Droid push exclusion", () => {
  it("reports unavailable and never loads or registers the native push SDK", async () => {
    expect(getPushState()).toBe("unavailable");
    expect(await getNotificationsModule()).toBeNull();
    await expect(registerCurrentDevice("user", "it", true)).resolves.toBeUndefined();
    await expect(revokeCurrentDevice()).resolves.toBeUndefined();
  });
});
