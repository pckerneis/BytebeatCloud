import { useRouter } from 'next/router';
import { UserProfileContent } from '../components/UserProfileContent';
import Head from 'next/head';
import { supabase } from '../lib/supabaseClient';
import { useCurrentUserProfile } from '../hooks/useCurrentUserProfile';

export default function ProfilePage() {
  const router = useRouter();
  const { status, error, username } = useCurrentUserProfile();

  const handleEditProfile = () => {
    void router.push('/update-profile');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await router.push('/');
  };

  return (
    <>
      <Head>
        <title>BytebeatCloud - Profile</title>
      </Head>
      <section>
        {status === 'loading' && <p className="text-centered">Loading your profile…</p>}
        {status === 'error' && <p className="error-message">{error}</p>}

        {status === 'idle' && username && (
          <UserProfileContent
            username={username}
            hideFollowButton
            extraHeader={
              <>
                <button type="button" className="button secondary" onClick={handleEditProfile}>
                  Edit
                </button>
              </>
            }
          />
        )}
      </section>
    </>
  );
}
