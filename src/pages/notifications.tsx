import { useEffect, useState } from 'react';
import Head from 'next/head';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';

type NotificationRow = {
  id: number;
  event_type: string;
  created_at: string;
  read: boolean;
  post_id: string | null;
  actor_id: string;
};

export default function NotificationsPage() {
  const { user } = useSupabaseAuth();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('notifications')
        .select('id,event_type,created_at,read,post_id,actor_id')
        .order('created_at', { ascending: false });

      if (cancelled) return;

      if (error) {
        setError('Unable to load notifications.');
        setNotifications([]);
        setLoading(false);
        return;
      }

      setNotifications((data ?? []) as NotificationRow[]);
      setLoading(false);

      if (data && data.length > 0) {
        void supabase.from('notifications').update({ read: true }).eq('read', false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <>
      <Head>
        <title>BytebeatCloud - Notifications</title>
      </Head>
      <section>
        <h2>Notifications</h2>
        {loading && <p>Loading…</p>}
        {!loading && error && <p className="error-message">{error}</p>}
        {!loading && !error && notifications.length === 0 && <p>No notifications yet.</p>}
        {!loading && !error && notifications.length > 0 && (
          <ul>
            {notifications.map((n) => (
              <li key={n.id}>{`${n.event_type} at ${new Date(n.created_at).toLocaleString()}`}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// placeholder, will be replaced
