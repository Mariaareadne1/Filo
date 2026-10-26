import { ProfileView } from '../../features/profile/ProfileView';
import { useSession } from '../../lib/session';

export default function ProfileScreen() {
  const { userId } = useSession();
  // Signed out (e.g. mid sign-out, before the gate navigates): render nothing
  // rather than firing anonymous queries.
  if (!userId) return null;
  return <ProfileView userId={userId} />;
}
