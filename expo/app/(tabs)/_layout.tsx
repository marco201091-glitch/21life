import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/constants/theme';
import { useLanguage } from '@/contexts/language-context';
import { resolveTabBarHeight, tabBarHorizontalInset } from '@/lib/layout';

type TabIconProps = {
  name: keyof typeof Ionicons.glyphMap;
  focusedName: keyof typeof Ionicons.glyphMap;
  color: ColorValue;
  focused: boolean;
};

function TabIcon({ name, focusedName, color, focused }: TabIconProps) {
  return <Ionicons name={focused ? focusedName : name} size={22} color={color == null || typeof color === 'number' ? colors.foreground : color} />;
}

export default function TabsLayout() {
  const { copy } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tabBarHeight = resolveTabBarHeight(insets.bottom);
  const horizontalInset = tabBarHorizontalInset(width);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerTransparent: true,
        headerTitleStyle: { color: colors.foreground, fontWeight: '700' },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.borderSoft,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: spacing.xs,
          paddingBottom: Math.max(spacing.sm, insets.bottom),
          paddingLeft: horizontalInset,
          paddingRight: horizontalInset,
        },
        tabBarActiveTintColor: colors.primaryMuted,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: copy('arenasTab'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="grid-outline" focusedName="grid" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: copy('statsTab'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="bar-chart-outline" focusedName="bar-chart" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: copy('profile'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person-outline" focusedName="person" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="notification-settings"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: copy('settings'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="settings-outline" focusedName="settings" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
