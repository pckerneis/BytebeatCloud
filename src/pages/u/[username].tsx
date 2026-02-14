import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { UserProfileContent } from '../../components/UserProfileContent';
import Head from 'next/head';
import { useProfile } from '../../hooks/useProfile';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

export default function UserPage() {
  const router = useRouter();
  const { username } = router.query;
  const uname = typeof username === 'string' ? username : null;
  const { profileId, loading, error } = useProfile(uname);

  const notFound = !loading && !profileId && uname;
  const { user } = useSupabaseAuth();
  const [isBlockedByViewer, setIsBlockedByViewer] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;

    const load = async () => {
      if (user) {
        const { data: row } = await supabase
          .from('blocked_users')
          .select('blocked_id')
          .eq('blocker_id', (user as any).id)
          .eq('blocked_id', profileId)
          .maybeSingle();
        if (!cancelled) setIsBlockedByViewer(!!row);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId, user]);

  return (
    <>
      <Head>
        <title>{`BytebeatCloud - @${uname ?? 'User'}`}</title>
        <meta name="description" content={`@${uname}'s profile on BytebeatCloud`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`@${uname} - BytebeatCloud`} />
        <meta property="og:description" content={`@${uname}'s profile on BytebeatCloud`} />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/user/${encodeURIComponent(uname ?? '')}`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <section>
        {loading && <p className="text-centered">Loading…</p>}
        {error && !loading && <p className="error-message">{error}</p>}
        {notFound && !error && <p className="error-message">User not found.</p>}
      </section>
      {uname && !loading && !notFound && isBlockedByViewer && (
        <section>
          <h2>@{uname}</h2>
          <p className="text-centered">
            You have blocked this user. Unblock them from the user actions page to view their
            profile and posts.
          </p>
          <div className="text-centered mt-10">
            <Link href={`/user-actions/${uname}`} className="button secondary">
              Go to user actions
            </Link>
          </div>
        </section>
      )}
      {uname && !loading && !notFound && !isBlockedByViewer && (
        <UserProfileContent profileId={profileId} username={uname} />
      )}
    </>
  );
}
