import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#E63946',
        tabBarInactiveTintColor: '#aaa',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#f0f0f0',
          paddingBottom: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🗺️</Text>,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👥</Text>,
        }}
      />
      <Tabs.Screen
        name="directory"
        options={{
          title: 'Columbia',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🎓</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
        }}
      />
      {/* Hide nested routes from tab bar */}
      <Tabs.Screen name="board/[id]" options={{ href: null }} />
      <Tabs.Screen name="user/[id]" options={{ href: null }} />
    </Tabs>
  );
}
