import { useRouter } from 'next/router';
import { UserProfileContent } from '../../components/UserProfileContent';

export default function UserPage() {
  const router = useRouter();
  const { username } = router.query;
  const uname = typeof username === 'string' ? username : null;

  return <UserProfileContent username={uname} />;
}
