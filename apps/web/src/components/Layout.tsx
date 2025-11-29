import Link from 'next/link';
import { useRouter } from 'next/router';
import type { PropsWithChildren } from 'react';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
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

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    await router.push('/');
  };

  return (
    <div className="root">
      <nav>
        <div className="app-title">
          <h1>Bitebeats</h1>
        </div>
        <ul>
          <NavLink href="/create">Create</NavLink>
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
