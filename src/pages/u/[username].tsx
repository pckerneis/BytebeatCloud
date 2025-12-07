import { useRouter } from 'next/router';
import { UserProfileContent } from '../../components/UserProfileContent';
import Head from 'next/head';
import { useProfile } from '../../hooks/useProfile';

export default function UserPage() {
  const router = useRouter();
  const { username } = router.query;
  const uname = typeof username === 'string' ? username : null;
  const { profileId, loading, error } = useProfile(uname);

  const notFound = !loading && !profileId && uname;

  return (
    <>
      <Head>
        <title>BytebeatCloud - {uname ?? 'User'}</title>
      </Head>
      <section>
        {loading && <p className="text-centered">Loading…</p>}
        {error && !loading && <p className="error-message">{error}</p>}
        {notFound && !error && <p className="error-message">User not found.</p>}
      </section>
      {username && profileId && <UserProfileContent profileId={profileId} username={uname} />}
    </>
  );
}
