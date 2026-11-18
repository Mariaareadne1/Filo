import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { UploadProvider } from '../../contexts/UploadContext';
import { UploadProgressOverlay } from '../../components/UploadProgressOverlay';
import { Dock } from '../../design/Dock';
import { useTheme } from '../../design/theme';

/**
 * Authenticated shell. Map is the home canvas; the floating glass Dock
 * replaces the stock tab bar. Non-dock routes (board, user, rankings, …)
 * live in the same navigator with `href: null` so the dock stays visible
 * and back/forward history behaves like iOS tabs.
 */
export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <UploadProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Tabs
          initialRouteName="map"
          backBehavior="history"
          tabBar={(props) => <Dock {...props} />}
          screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
        >
          <Tabs.Screen name="map" />
          <Tabs.Screen name="discover" />
          <Tabs.Screen name="boards" />
          <Tabs.Screen name="profile" />
          <Tabs.Screen name="index" options={{ href: null }} />
          <Tabs.Screen name="feed" options={{ href: null }} />
          <Tabs.Screen name="requests" options={{ href: null }} />
          <Tabs.Screen name="twins" options={{ href: null }} />
          <Tabs.Screen name="rankings" options={{ href: null }} />
          <Tabs.Screen name="follow-list" options={{ href: null }} />
          <Tabs.Screen name="wrapped" options={{ href: null }} />
          <Tabs.Screen name="board/[id]" options={{ href: null }} />
          <Tabs.Screen name="user/[id]" options={{ href: null }} />
        </Tabs>
        <UploadProgressOverlay />
      </View>
    </UploadProvider>
  );
}
