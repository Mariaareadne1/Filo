import { Redirect } from 'expo-router';

/**
 * The tab group's `index` route used to be the map screen, which made
 * expo-router pick it as the group's default whenever someone landed on
 * `/(app)/` — even though `initialRouteName="discover"` is set on the
 * <Tabs>. The map now lives at `app/(app)/map.tsx`; this file exists
 * only so the group still has a valid index that redirects to the real
 * default landing tab.
 *
 * The matching <Tabs.Screen name="index" options={{ href: null }} /> in
 * `_layout.tsx` keeps this route out of the tab bar so it never renders
 * a tab slot on its own.
 */
export default function AppIndex() {
  return <Redirect href="/(app)/map" />;
}
