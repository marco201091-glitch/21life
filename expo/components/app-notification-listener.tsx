import {
  cancelPushRegistration,
  getNotificationsModule,
  registerCurrentDevice,
  setPushRetry,
} from "@/lib/push-device";
import { useEffect } from "react";
import { AppState } from "react-native";
import type * as ExpoNotifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/language-context";
import { localizeNotification } from "@/lib/notification-copy";

let handledNotificationResponseId: string | null = null;
export function AppNotificationListener() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const { language } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const register = (requestPermission = false) => {
      if (active)
        void registerCurrentDevice(userId, language, requestPermission);
    };
    setPushRetry(() => register(true));
    register(true);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") register();
    });
    const timer = setTimeout(() => register(), 30000);
    let tokenSubscription: ExpoNotifications.EventSubscription | undefined;
    void getNotificationsModule().then((notifications) => {
      if (active && notifications)
        tokenSubscription = notifications.addPushTokenListener(() =>
          register(),
        );
    });
    return () => {
      active = false;
      clearTimeout(timer);
      subscription.remove();
      tokenSubscription?.remove();
      setPushRetry(null);
      cancelPushRegistration();
    };
  }, [language, userId]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`app-notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "app_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (event) => {
          const item = event.new as {
            type?: "arena_invite" | "arena_member_joined" | "match_completed";
            title: string;
            body: string;
            data?: Record<string, unknown>;
          };
          const localized = localizeNotification(item, language);
          showToast(
            [localized.title, localized.body].filter(Boolean).join(" · "),
            "info",
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [language, showToast, user]);

  useEffect(() => {
    let subscription: ExpoNotifications.EventSubscription | null = null;
    let active = true;
    const openNotification = (
      response: ExpoNotifications.NotificationResponse | null,
    ) => {
      if (
        !response ||
        response.notification.request.identifier ===
          handledNotificationResponseId
      )
        return;
      handledNotificationResponseId = response.notification.request.identifier;
      const groupId = response.notification.request.content.data?.groupId;
      if (typeof groupId === "string")
        router.push({ pathname: "/table/[id]", params: { id: groupId } });
    };
    void getNotificationsModule().then((Notifications) => {
      if (!Notifications || !active) return;
      void Notifications.getLastNotificationResponseAsync()
        .then(openNotification)
        .catch(() => undefined);
      subscription =
        Notifications.addNotificationResponseReceivedListener(openNotification);
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [router]);

  return null;
}
