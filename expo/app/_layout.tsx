import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { LanguageProvider } from '@/contexts/language-context';
import { RuntimeConfigProvider } from '@/contexts/runtime-config-context';
import { ToastProvider } from '@/contexts/toast-context';
import { AccessLogger } from '@/components/access-logger';
import { AppAlertHost } from '@/components/ui/app-alert-host';
import { ImageCacheWarmer } from '@/components/deck/image-cache-warmer';
import { colors } from '@/constants/theme';
import { Sentry, sentryEnabled } from '@/lib/sentry';
import { isFdroidBuild } from '@/lib/env';
import { QueryProvider } from '@/components/query-provider';
import { AppErrorBoundary } from '@/components/app-error-boundary';
import { AppNotificationListener } from '@/components/app-notification-listener';
import { ArchidektAutoSync } from '@/components/archidekt-auto-sync';
import { ManaLogo } from '@/components/ui/mana-logo';
import { Cinzel_700Bold, useFonts } from '@expo-google-fonts/cinzel';

const pushNotificationsEnabled =
  !isFdroidBuild()
  && process.env.EXPO_PUBLIC_DISABLE_PUSH_NOTIFICATIONS !== 'true';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inJoinRoute = segments[0] === 'join';
    const inArenaRoute = segments[0] === 'arena';
    const inLegalRoute = segments[0] === 'legal';
    const inCounterRoute = String(segments[0]) === 'counter';
    const isPublicRoute = inAuthGroup || inJoinRoute || inArenaRoute || inLegalRoute || inCounterRoute;

    if (!user && !isPublicRoute) {
      router.replace({
        pathname: '/(auth)/login',
        params: pathname && pathname !== '/' ? { redirect: pathname } : undefined,
      });
    }
  }, [user, loading, segments, pathname, router]);

  const inAuthGroup = segments[0] === '(auth)';
  const inJoinRoute = segments[0] === 'join';
  const inArenaRoute = segments[0] === 'arena';
  const inLegalRoute = segments[0] === 'legal';
  const inCounterRoute = String(segments[0]) === 'counter';
  const isPublicRoute = inAuthGroup || inJoinRoute || inArenaRoute || inLegalRoute || inCounterRoute;

  if (loading || (!user && !isPublicRoute)) {
    return (
      <View style={styles.authLoadingSurface}>
        <ManaLogo
          size="lg"
          centered
        />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayout() {
  useFonts({ Cinzel_700Bold });

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <KeyboardProvider>
      <QueryProvider>
      <LanguageProvider>
        <RuntimeConfigProvider>
        <AuthProvider>
          <ToastProvider>
          <StatusBar style="light" />
          <AppErrorBoundary>
          <AuthGate>
            <AccessLogger />
            {pushNotificationsEnabled ? <AppNotificationListener /> : null}
            <ArchidektAutoSync />
            <ImageCacheWarmer />
            <AppAlertHost />
            <Stack
            screenOptions={{
              headerShown: false,
              headerTransparent: true,
              headerTitleStyle: { color: colors.foreground, fontWeight: '700' },
              headerTintColor: colors.foreground,
              headerShadowVisible: false,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          >
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="join/[code]" />
            <Stack.Screen name="arena/[code]" />
            <Stack.Screen name="legal/[slug]" />
            <Stack.Screen name="counter" />
            <Stack.Screen name="archived-decks" />
          </Stack>
          </AuthGate>
          </AppErrorBoundary>
          </ToastProvider>
        </AuthProvider>
        </RuntimeConfigProvider>
      </LanguageProvider>
      </QueryProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default sentryEnabled ? Sentry.wrap(RootLayout) : RootLayout;

const styles = StyleSheet.create({
  authLoadingSurface: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
