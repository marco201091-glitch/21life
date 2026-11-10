import { Button } from "@/components/ui/button";
import {
  getPushState,
  subscribePushState,
  retryPushRegistration,
} from "@/lib/push-device";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Linking, StyleSheet, Switch, Text, View } from "react-native";
import { Screen } from "@/components/ui/screen";
import { useAuth } from "@/contexts/auth-context";
import { useLanguage } from "@/contexts/language-context";
import { colors, radii, spacing } from "@/constants/theme";
import { apiGet, apiPatch } from "@/lib/api";

type Preferences = {
  arena_invite: boolean;
  arena_member_joined: boolean;
  match_completed: boolean;
  season_completed: boolean;
  push_enabled: boolean;
};
const DEFAULTS: Preferences = {
  arena_invite: true,
  arena_member_joined: true,
  match_completed: true,
  season_completed: true,
  push_enabled: true,
};

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const { copy, language } = useLanguage();
  const pushState = useSyncExternalStore(
    subscribePushState,
    getPushState,
    getPushState,
  );
  const [loadError, setLoadError] = useState(false);
  const labels =
    language === "it"
      ? {
          idle: "Registrazione da verificare",
          registering: "Registrazione in corso…",
          registered: "Notifiche attive su questo dispositivo",
          denied: "Notifiche disattivate nelle impostazioni del dispositivo",
          unavailable: "Notifiche push non disponibili in questa versione",
          error: "Registrazione non riuscita. Riprova.",
          cancelled: "Registrazione da verificare",
        }
      : {
          idle: "Registration not verified",
          registering: "Registering…",
          registered: "Notifications active on this device",
          denied: "Notifications disabled in device settings",
          unavailable: "Push notifications unavailable in this version",
          error: "Registration failed. Try again.",
          cancelled: "Registration not verified",
        };
  const [preferences, setPreferences] = useState(DEFAULTS);

  const load = useCallback(async () => {
    if (!user) return;
    const result = await apiGet<{ preferences: Preferences }>(
      "/api/notifications",
    );
    if (result.status === 200 && result.data?.preferences) {
      setPreferences(result.data.preferences);
      setLoadError(false);
    } else setLoadError(true);
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (key: keyof Preferences) => {
    const previous = preferences;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    const result = await apiPatch("/api/notifications", {
      action: "preferences",
      preferences: { [key]: next[key] },
    });
    if (result.status !== 200) setPreferences(previous);
  };

  return (
    <Screen>
      <Text style={styles.title}>{copy("notificationPreferences")}</Text>
      <View style={styles.card}>
        <Text style={styles.label} accessibilityLiveRegion="polite">
          {labels[pushState]}
        </Text>
        {loadError ? (
          <Text style={styles.label}>
            {language === "it"
              ? "Impossibile caricare le preferenze."
              : "Could not load preferences."}
          </Text>
        ) : null}
        {pushState === "denied" ? (
          <Button
            variant="outline"
            label={language === "it" ? "Apri impostazioni" : "Open settings"}
            onPress={() => void Linking.openSettings()}
          />
        ) : null}
        {pushState !== "unavailable" ? (
          <Button
            variant="outline"
            disabled={pushState === "registering"}
            label={
              language === "it" ? "Verifica notifiche" : "Check notifications"
            }
            onPress={retryPushRegistration}
          />
        ) : null}
        {(
          [
            ["arena_invite", "arenaInviteNotifications"],
            ["arena_member_joined", "memberJoinedNotifications"],
            ["match_completed", "matchCompletedNotifications"],
            ["season_completed", "seasonCompletedNotifications"],
            ["push_enabled", "pushNotifications"],
          ] as const
        ).map(([key, label]) => (
          <View key={key} style={styles.preference}>
            <Text style={styles.label}>{copy(label)}</Text>
            <Switch
              disabled={loadError}
              value={preferences[key]}
              onValueChange={() => void toggle(key)}
              trackColor={{ true: colors.primary, false: colors.surfaceMuted }}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: spacing.lg,
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    padding: spacing.md,
  },
  preference: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  label: { flex: 1, color: colors.foreground },
});
