import { Redirect, useLocalSearchParams } from 'expo-router';
import { ProfileView } from '../../../features/profile/ProfileView';
import { parseIdParam } from '../../../lib/params';

/** Someone's profile; malformed deep links fall back to the map. */
export default function UserScreen() {
  const id = parseIdParam(useLocalSearchParams<{ id?: string }>().id);
  if (!id) return <Redirect href="/(app)/map" />;
  return <ProfileView key={id} userId={id} />;
}
