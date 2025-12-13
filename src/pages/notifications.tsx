import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { formatRelativeTime } from '../utils/time';

type NotificationRow = {
  id: number;
  event_type: string;
  created_at: string;
  read: boolean;
  post_id: string | null;
  actor_id: string;
  actor_username?: string | null;
  post_title?: string | null;
};

const PAGE_SIZE = 20;

function formatNotificationAction(n: NotificationRow): string {
  if (n.event_type === 'follow') {
    return 'followed you';
  }

  if (n.event_type === 'favorite') {
    return 'favorited one of your posts';
  }

  if (n.event_type === 'fork') {
    return 'forked one of your posts';
  }

  if (n.event_type === 'comment') {
    return 'commented on one of your posts';
  }

  if (n.event_type === 'mention') {
    return 'mentioned you';
  }

  return n.event_type;
}

export default function NotificationsPage() {
  const { user } = useSupabaseAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const markNotificationReadLocally = (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markNotificationReadOnServer = async (id: number) =>
    supabase.from('notifications').update({ read: true }).eq('id', id);

  const handleNotificationLinkClick = async (
    e: MouseEvent<HTMLAnchorElement>,
    n: NotificationRow,
    href: string,
  ) => {
    if (!n.read) {
      markNotificationReadLocally(n.id);
      await markNotificationReadOnServer(n.id);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('notifications:refresh'));
      }
    }

    const isPlainLeftClick = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

    if (!isPlainLeftClick) {
      return;
    }

    e.preventDefault();
    await router.push(href);
  };

  const handleMarkAllAsRead = async () => {
    if (markingAll) return;

    const hasUnread = notifications.some((n) => !n.read);
    if (!hasUnread) return;

    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    try {
      await supabase.from('notifications').update({ read: true }).eq('read', false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('notifications:refresh'));
      }
    } finally {
      setMarkingAll(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoadingInitial(false);
      setHasMore(false);
      return;
    }

    let cancelled = false;

    const loadPage = async (pageToLoad: number) => {
      const from = pageToLoad * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('notifications_with_meta')
        .select('id,event_type,created_at,read,post_id,actor_id,actor_username,post_title')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (cancelled) return;

      if (error) {
        if (pageToLoad === 0) {
          setError('Unable to load notifications.');
          setNotifications([]);
          setLoadingInitial(false);
        }
        setLoadingMore(false);
        setHasMore(false);
        return;
      }

      const rows = (data ?? []) as NotificationRow[];

      if (pageToLoad === 0) {
        setNotifications(rows);
        setLoadingInitial(false);
      } else {
        setNotifications((prev) => [...prev, ...rows]);
      }

      if (rows.length < PAGE_SIZE) {
        setHasMore(false);
      }

      setPage(pageToLoad);

      setLoadingMore(false);
    };

    setLoadingInitial(true);
    setError('');
    setHasMore(true);
    setPage(0);
    void loadPage(0);

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!hasMore || loadingMore || loadingInitial) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry.isIntersecting) return;

      setLoadingMore(true);

      const nextPage = page + 1;

      const loadNext = async () => {
        const from = nextPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from('notifications_with_meta')
          .select('id,event_type,created_at,read,post_id,actor_id,actor_username,post_title')
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) {
          setLoadingMore(false);
          setHasMore(false);
          return;
        }

        const rows = (data ?? []) as NotificationRow[];

        setNotifications((prev) => [...prev, ...rows]);
        setPage(nextPage);

        if (rows.length < PAGE_SIZE) {
          setHasMore(false);
        }

        setLoadingMore(false);
      };

      void loadNext();
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadingMore, loadingInitial, page]);

  return (
    <>
      <Head>
        <title>Notifications - BytebeatCloud</title>
      </Head>
      <section>
        <div className="notifications-header">
          <h2>Notifications</h2>
          {notifications.some((n) => !n.read) && (
            <button
              type="button"
              className="button secondary mark-all-read-button"
              onClick={() => void handleMarkAllAsRead()}
              disabled={markingAll}
            >
              Mark all as read
            </button>
          )}
        </div>
        {loadingInitial && <p>Loading…</p>}
        {!loadingInitial && error && <p className="error-message">{error}</p>}
        {!loadingInitial && !error && notifications.length === 0 && <p>No notifications yet.</p>}
        {!loadingInitial && !error && notifications.length > 0 && (
          <>
            <ul className="notifications-list">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={n.read ? 'notification-item' : 'notification-item is-unread'}
                >
                  <span className="notification-text">
                    {n.event_type === 'weekly_winner' ? (
                      <>
                        Your post{' '}
                        {n.post_id ? (
                          <Link
                            href={`/post/${n.post_id}`}
                            className="post-link"
                            onClick={(e) =>
                              void handleNotificationLinkClick(e, n, `/post/${n.post_id}`)
                            }
                          >
                            {n.post_title || '(untitled)'}
                          </Link>
                        ) : (
                          <>{n.post_title || '(untitled)'}</>
                        )}{' '}
                        is this week&apos;s Top Pick!
                      </>
                    ) : (
                      <>
                        {n.actor_username ? (
                          <>
                            <Link
                              href={`/u/${n.actor_username}`}
                              className="username"
                              onClick={(e) =>
                                void handleNotificationLinkClick(e, n, `/u/${n.actor_username}`)
                              }
                            >
                              @{n.actor_username}
                            </Link>{' '}
                          </>
                        ) : (
                          <>Someone </>
                        )}
                        {formatNotificationAction(n)}
                        {n.post_id && (
                          <>
                            {' '}
                            <Link
                              href={`/post/${n.post_id}`}
                              className="post-link"
                              onClick={(e) =>
                                void handleNotificationLinkClick(e, n, `/post/${n.post_id}`)
                              }
                            >
                              {n.post_title || '(untitled)'}
                            </Link>
                          </>
                        )}
                      </>
                    )}
                  </span>
                  <span className="notification-date secondary-text">
                    {formatRelativeTime(n.created_at)}
                  </span>
                </li>
              ))}
            </ul>
            <div ref={sentinelRef} />
            {loadingMore && <p>Loading more…</p>}
            {!hasMore && <p>No more notifications.</p>}
          </>
        )}
      </section>
    </>
  );
}
