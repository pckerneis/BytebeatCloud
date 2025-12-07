import { useRouter } from 'next/router';
import { UserProfileContent } from '../../components/UserProfileContent';
import Head from 'next/head';
import { useProfile } from '../../hooks/useProfile';

export default function UserPage() {
  const router = useRouter();
  const { username } = router.query;
  const uname = typeof username === 'string' ? username : null;
  const { profileId } = useProfile(uname);

  return (
    <>
      <Head>
        <title>BytebeatCloud - {uname ?? 'User'}</title>
      </Head>
      { username && profileId && (<UserProfileContent profileId={profileId} username={uname} />)}
    </>
  );
}
