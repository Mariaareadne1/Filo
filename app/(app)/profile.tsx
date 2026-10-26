import { ProfileView } from '../../features/profile/ProfileView';
import { useRequiredUserId } from '../../lib/session';

export default function ProfileScreen() {
  return <ProfileView userId={useRequiredUserId()} />;
}
