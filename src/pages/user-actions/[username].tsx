import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

export default function UserActionPage() {
  const router = useRouter();
  const { username } = router.query;
  const { user } = useSupabaseAuth();
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading');
  const [error, setError] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'block' | 'unblock'>('block');

  useEffect(() => {
    if (!router.isReady) return;
    if (!username || typeof username !== 'string') return;

    let cancelled = false;

    const load = async () => {
      try {
        setStatus('loading');
        setError('');

        // Lookup target user id by username
        const { data: profile, error: pErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username)
          .maybeSingle();

        if (cancelled) return;

        if (pErr || !profile) {
          setError('User not found.');
          setStatus('error');
          return;
        }

        setTargetId(profile.id as string);

        if (user) {
          const { data: blockRow } = await supabase
            .from('blocked_users')
            .select('blocked_id')
            .eq('blocker_id', (user as any).id)
            .eq('blocked_id', profile.id)
            .maybeSingle();

          if (cancelled) return;
          setIsBlocked(!!blockRow);
        } else {
          setIsBlocked(false);
        }

        setStatus('idle');
      } catch (e) {
        if (cancelled) return;
        setError('Unable to load user actions.');
        setStatus('error');
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, username, user]);

  const openConfirm = (mode: 'block' | 'unblock') => {
    setConfirmMode(mode);
    setConfirmOpen(true);
  };

  const closeConfirm = () => setConfirmOpen(false);

  const performConfirm = async () => {
    if (!user || !targetId) return;
    setPending(true);
    setError('');
    try {
      const blockerId = (user as any).id as string;
      if (confirmMode === 'block') {
        // Create block relationship; ignore duplicates
        const { error: insErr } = await supabase
          .from('blocked_users')
          .upsert(
            { blocker_id: blockerId, blocked_id: targetId },
            { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true } as any,
          );
        if (insErr) {
          // Fall back: insert may not support ignoreDuplicates depending on adapter
          // Try plain insert and ignore unique violation
          if ((insErr as any).code !== '23505') {
            throw insErr;
          }
        }
        setIsBlocked(true);
      } else {
        const { error: delErr } = await supabase
          .from('blocked_users')
          .delete()
          .eq('blocker_id', blockerId)
          .eq('blocked_id', targetId);
        if (delErr) throw delErr;
        setIsBlocked(false);
      }
      setConfirmOpen(false);
    } catch (e) {
      setError('Operation failed. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const handleBlockUser = () => {
    if (!user) {
      void router.push('/login');
      return;
    }
    if (!targetId) return;
    openConfirm(isBlocked ? 'unblock' : 'block');
  };
  const handleReportUser = () => {};

  return (
    <>
      <Head>
        <title>BytebeatCloud - User actions</title>
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={() => router.back()}>
          ← Back
        </button>

        <h2>@{username}</h2>

        {status === 'loading' && <p className="text-centered">Loading…</p>}
        {status === 'error' && <p className="error-message">{error}</p>}
        {status === 'idle' && (
          <form className="create-form">
            <h3>Block user</h3>

            <button type="button" className="button danger" onClick={handleBlockUser}>
              {isBlocked ? 'Unblock user' : 'Block user'}
            </button>

            <h3>Report user</h3>

            <button type="button" className="button danger" onClick={handleReportUser}>
              Report user
            </button>

            {error && <p className="error-message">{error}</p>}
          </form>
        )}
      </section>
      {confirmOpen && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '16px' }}>
              {confirmMode === 'block' ? 'Block this user?' : 'Unblock this user?'}
            </h2>
            <p style={{ marginTop: 0, marginBottom: '12px', fontSize: '13px', opacity: 0.9 }}>
              {confirmMode === 'block'
                ? 'Blocking will hide this user’s posts from feeds and prevent notifications from them. You can unblock later from this page.'
                : 'Unblocking will allow this user’s posts and notifications to appear again.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="button secondary" onClick={closeConfirm} disabled={pending}>
                Cancel
              </button>
              <button
                type="button"
                className={confirmMode === 'block' ? 'button danger' : 'button primary'}
                onClick={() => void performConfirm()}
                disabled={pending}
              >
                {confirmMode === 'block' ? 'Block' : 'Unblock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
