import { useRouter } from 'next/router';
import { UserProfileContent } from '../components/UserProfileContent';
import Head from 'next/head';
import { useCurrentUserProfile } from '../hooks/useCurrentUserProfile';

export default function ProfilePage() {
  const router = useRouter();
  const { status, error, username, user } = useCurrentUserProfile();

  const handleEditProfile = () => {
    void router.push('/update-profile');
  };

  return (
    <>
      <Head>
        <title>Profile - BytebeatCloud</title>
      </Head>
      <section>
        {status === 'loading' && <p className="text-centered">Loading your profile…</p>}
        {status === 'error' && <p className="error-message">{error}</p>}

        {status === 'idle' && user && username && (
          <UserProfileContent
            profileId={user.id}
            username={username}
            hideFollowButton
            extraHeader={
              <button type="button" className="button secondary" onClick={handleEditProfile}>
                Edit
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
