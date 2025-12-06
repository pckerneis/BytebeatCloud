import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { UserProfileContent } from '../../components/UserProfileContent';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

export default function UserPage() {
  const router = useRouter();
  const { username } = router.query;
  const uname = typeof username === 'string' ? username : null;
  const { user } = useSupabaseAuth();
  const [loading, setLoading] = useState(true);
  const [isBlockedByViewer, setIsBlockedByViewer] = useState(false);
  const [targetExists, setTargetExists] = useState(true);

  useEffect(() => {
    if (!uname) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setIsBlockedByViewer(false);
      setTargetExists(true);

      // Resolve target profile id (publicly visible usernames)
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', uname)
        .maybeSingle();

      if (cancelled) return;

      if (pErr || !profile) {
        setTargetExists(false);
        setLoading(false);
        return;
      }

      if (user) {
        const { data: row } = await supabase
          .from('blocked_users')
          .select('blocked_id')
          .eq('blocker_id', (user as any).id)
          .eq('blocked_id', profile.id)
          .maybeSingle();
        if (!cancelled) setIsBlockedByViewer(!!row);
      }

      if (!cancelled) setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [uname, user]);

  return (
    <>
      <Head>
        <title>BytebeatCloud - {uname ?? 'User'}</title>
      </Head>
      {!uname && <p className="text-centered">Loading…</p>}
      {uname && loading && <p className="text-centered">Loading…</p>}
      {uname && !loading && !targetExists && (
        <section>
          <h2>@{uname}</h2>
          <p className="text-centered">User not found.</p>
        </section>
      )}
      {uname && !loading && targetExists && isBlockedByViewer && (
        <section>
          <h2>@{uname}</h2>
          <p className="text-centered">
            You have blocked this user. Unblock them from the user actions page to view their
            profile and posts.
          </p>
          <div className="text-centered" style={{ marginTop: '12px' }}>
            <Link href={`/user-actions/${uname}`} className="button secondary">
              Go to user actions
            </Link>
          </div>
        </section>
      )}
      {uname && !loading && targetExists && !isBlockedByViewer && (
        <UserProfileContent username={uname} />
      )}
    </>
  );
}
