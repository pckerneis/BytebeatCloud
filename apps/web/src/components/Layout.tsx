import Link from 'next/link';
import { useRouter } from 'next/router';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { warmUpBytebeatEngine } from '../hooks/useBytebeatPlayer';
import { supabase } from '../lib/supabaseClient';

function NavLink({ href, children }: PropsWithChildren<{ href: string }>) {
  const router = useRouter();
  const isActive = router.pathname === href;

  return (
    <li>
      <Link href={href} className={isActive ? 'nav active' : 'nav'}>
        {children}
      </Link>
    </li>
  );
}

export function Layout({ children }: PropsWithChildren) {
  const { user } = useSupabaseAuth();
  const router = useRouter();
  const [checkedProfile, setCheckedProfile] = useState(false);

  useEffect(() => {
    const devFakeAuth = process.env.NEXT_PUBLIC_DEV_FAKE_AUTH === '1';

    if (!user || devFakeAuth || checkedProfile) return;

    let cancelled = false;

    const checkProfile = async () => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', (user as any).id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.warn('Error checking profile', error.message);
        setCheckedProfile(true);
        return;
      }

      if (!data?.username && router.pathname !== '/onboarding') {
        void router.push('/onboarding');
      } else {
        setCheckedProfile(true);
      }
    };

    void checkProfile();

    return () => {
      cancelled = true;
    };
  }, [user, checkedProfile, router]);

  // Warm up the audio engine on the very first user interaction anywhere
  // in the app, so the initial AudioContext/worklet cost is paid upfront.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let warmedUp = false;

    const handleFirstInteraction = () => {
      if (warmedUp) return;
      warmedUp = true;
      void warmUpBytebeatEngine();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('pointerdown', handleFirstInteraction, { once: false });
    window.addEventListener('keydown', handleFirstInteraction, { once: false });

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    await router.push('/');
  };

  return (
    <div className="root">
      <nav>
        <div className="app-title">
          <Link href="/explore">
            <h1>Bitebeats</h1>
          </Link>
        </div>
        <ul>
          {user && <NavLink href="/create">Create</NavLink>}
          <NavLink href="/explore">Explore</NavLink>
          {user && <NavLink href="/profile">Profile</NavLink>}
          {user ? (
            <li>
              <button type="button" className="nav" onClick={handleSignOut}>
                Sign out
              </button>
            </li>
          ) : (
            <NavLink href="/login">Login</NavLink>
          )}
        </ul>
      </nav>
      <main>{children}</main>
    </div>
  );
}
