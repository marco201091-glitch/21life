import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";
import type * as ExpoNotifications from "expo-notifications";
import { apiDelete, apiPost } from "@/lib/api";
import { isFdroidBuild } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { registerPushDevice, type PushState } from "@/lib/push-registration";
let modulePromise: Promise<typeof ExpoNotifications | null> | null = null;
const PUSH_TOKEN_KEY = "21life-push-device";
let generation = 0;
let suspended = false;
let running: Promise<void> | null = null;
let registered: { userId: string; token: string; accessToken: string } | null =
  null;
let state: PushState = "idle";
let retry: (() => void) | null = null;
const subscribers = new Set<() => void>();
export const getPushState = () => state;
export const subscribePushState = (listener: () => void) => {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
};
function publish(next: PushState) {
  state = next;
  subscribers.forEach((fn) => fn());
}
export function retryPushRegistration() {
  retry?.();
}
export function setPushRetry(callback: (() => void) | null) {
  retry = callback;
  if (callback) suspended = false;
}
export function getNotificationsModule() {
  if (
    isFdroidBuild() ||
    Platform.OS === "web" ||
    Constants.appOwnership === "expo"
  )
    return Promise.resolve(null);
  return (modulePromise ??= import("expo-notifications")
    .then((notifications) => {
      notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      return notifications;
    })
    .catch(() => null));
}
export function cancelPushRegistration() {
  generation++;
  publish("idle");
}
export async function registerCurrentDevice(
  userId: string,
  locale: string,
  requestPermission = false,
) {
  if (suspended) return;
  if (running) {
    await running;
    return registerCurrentDevice(userId, locale, requestPermission);
  }
  const currentGeneration = generation;
  running = (async () => {
    publish("registering");
    const isCurrent = () => generation === currentGeneration;
    try {
      const notifications = await getNotificationsModule();
      if (!notifications) {
        if (isCurrent()) publish("unavailable");
        return;
      }
      if (Platform.OS === "android")
        await notifications.setNotificationChannelAsync("default", {
          name: "21Life",
          importance: notifications.AndroidImportance.DEFAULT,
        });
      let permission = await notifications.getPermissionsAsync();
      if (!permission.granted && permission.canAskAgain && requestPermission)
        permission = await notifications.requestPermissionsAsync();
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!isCurrent() || session?.user.id !== userId || !session.access_token)
        return;
      const accessToken = session.access_token;
      const options = {
        authenticated: false,
        headers: { Authorization: `Bearer ${accessToken}` },
      };
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId ??
        "";
      const result = await registerPushDevice({
        allowed: permission.granted,
        projectId,
        platform: Platform.OS === "ios" ? "ios" : "android",
        locale,
        isCurrent,
        getToken: async () =>
          (await notifications.getExpoPushTokenAsync({ projectId })).data,
        save: async (token) => {
          registered = { userId, token, accessToken };
          await SecureStore.setItemAsync(
            PUSH_TOKEN_KEY,
            JSON.stringify({ userId, token }),
          );
          return apiPost(
            "/api/push-tokens",
            { token, platform: Platform.OS, locale },
            options,
          );
        },
        remove: (token) =>
          apiDelete(
            "/api/push-tokens",
            { token, revokeSession: false },
            options,
          ),
      });
      if (isCurrent()) {
        if (result.token)
          registered = { userId, token: result.token, accessToken };
        publish(result.state);
      }
    } catch {
      if (isCurrent()) publish("error");
    }
  })().finally(() => {
    running = null;
  });
  return running;
}
export async function revokeCurrentDevice() {
  if (
    Platform.OS === "web" ||
    isFdroidBuild() ||
    Constants.appOwnership === "expo"
  )
    return;
  suspended = true;
  cancelPushRegistration();
  await running;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const stored = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  const previous =
    registered ??
    (stored ? (JSON.parse(stored) as { userId: string; token: string }) : null);
  if (!previous || !session || previous.userId !== session.user.id) return;
  const token = previous.token,
    accessToken = session.access_token;
  const result = await apiDelete(
    "/api/push-tokens",
    { token },
    {
      authenticated: false,
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (result.status !== 200) {
    suspended = false;
    throw new Error("PUSH_UNREGISTER_FAILED");
  }
  registered = null;
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}
