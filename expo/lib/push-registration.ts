export type PushState =
  | "idle"
  | "registering"
  | "registered"
  | "denied"
  | "unavailable"
  | "error"
  | "cancelled";
type Registration = {
  allowed: boolean;
  projectId: string;
  platform: "android" | "ios";
  locale: string;
  isCurrent: () => boolean;
  getToken: () => Promise<string>;
  save: (token: string) => Promise<{ status: number; error?: string }>;
  remove: (token: string) => Promise<{ status: number }>;
};
export async function registerPushDevice(
  input: Registration,
): Promise<{ state: PushState; token?: string }> {
  if (!input.allowed) return { state: "denied" };
  if (!input.projectId) return { state: "unavailable" };
  try {
    const token = await input.getToken();
    if (!input.isCurrent()) return { state: "cancelled" };
    const saved = await input.save(token);
    if (!input.isCurrent()) {
      await input.remove(token);
      return { state: "cancelled" };
    }
    if (saved.status !== 200 || saved.error) return { state: "error" };
    return { state: "registered", token };
  } catch {
    return { state: input.isCurrent() ? "error" : "cancelled" };
  }
}
