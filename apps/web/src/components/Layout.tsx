import Link from 'next/link';
import { useRouter } from 'next/router';
import type { PropsWithChildren } from 'react';

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
  return (
    <div className="root">
      <nav>
        <div className="app-title">
          <h1>Bitebeats</h1>
        </div>
        <ul>
          <NavLink href="/create">Create</NavLink>
          <NavLink href="/explore">Explore</NavLink>
          <NavLink href="/profile">Profile</NavLink>
        </ul>
      </nav>
      <main>{children}</main>
    </div>
  );
}
