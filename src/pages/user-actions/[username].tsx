import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { BackButton } from '../../components/BackButton';

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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [reportAlsoBlock, setReportAlsoBlock] = useState(false);
  const [hasReported, setHasReported] = useState(false);

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
          const [{ data: blockRow }, { data: reportRow }] = await Promise.all([
            supabase
              .from('blocked_users')
              .select('blocked_id')
              .eq('blocker_id', (user as any).id)
              .eq('blocked_id', profile.id)
              .maybeSingle(),
            supabase
              .from('user_reports')
              .select('id')
              .eq('reporter_id', (user as any).id)
              .eq('reported_id', profile.id)
              .maybeSingle(),
          ]);

          if (cancelled) return;
          setIsBlocked(!!blockRow);
          setHasReported(!!reportRow);
        } else {
          setIsBlocked(false);
          setHasReported(false);
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
          .upsert({ blocker_id: blockerId, blocked_id: targetId }, {
            onConflict: 'blocker_id,blocked_id',
            ignoreDuplicates: true,
          } as any);
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
  const handleReportUser = () => {
    if (!user) {
      void router.push('/login');
      return;
    }
    if (!targetId || hasReported) return;
    setReportCategory('');
    setReportReason('');
    setReportAlsoBlock(!isBlocked);
    setReportOpen(true);
  };

  const closeReport = () => setReportOpen(false);

  const submitReport = async () => {
    if (!user || !targetId || !reportCategory) return;
    // Details are mandatory for "Other" category
    if (reportCategory === 'Other' && !reportReason.trim()) return;
    setPending(true);
    setError('');
    try {
      const reporterId = (user as any).id as string;

      // Insert report with reason and optional details
      const { error: reportErr } = await supabase.from('user_reports').insert({
        reporter_id: reporterId,
        reported_id: targetId,
        reason: reportCategory,
        details: reportReason.trim() || null,
      });

      if (reportErr) {
        if ((reportErr as any).code === '23505') {
          // Already reported
          setHasReported(true);
          setReportOpen(false);
          return;
        }
        throw reportErr;
      }

      setHasReported(true);

      // Optionally block user
      if (reportAlsoBlock && !isBlocked) {
        const { error: blockErr } = await supabase
          .from('blocked_users')
          .upsert({ blocker_id: reporterId, blocked_id: targetId }, {
            onConflict: 'blocker_id,blocked_id',
            ignoreDuplicates: true,
          } as any);
        if (blockErr && (blockErr as any).code !== '23505') {
          // Non-critical, report was still submitted
          console.error('Failed to block user:', blockErr);
        } else {
          setIsBlocked(true);
        }
      }

      setReportOpen(false);
    } catch (e) {
      setError('Failed to submit report. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Head>
        <title>BytebeatCloud - User actions</title>
      </Head>
      <section>
        <BackButton />

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

            <button
              type="button"
              className="button danger"
              onClick={handleReportUser}
              disabled={hasReported}
            >
              {hasReported ? 'User reported' : 'Report user'}
            </button>

            {error && <p className="error-message">{error}</p>}
          </form>
        )}
      </section>
      {confirmOpen && (
        <div className="modal-backdrop">
          <div className="modal modal-wide">
            <h2>{confirmMode === 'block' ? 'Block this user?' : 'Unblock this user?'}</h2>
            <p>
              {confirmMode === 'block'
                ? 'Blocking is mutual: you and this user will no longer see each other\u2019s profile or posts, and you will not receive notifications from each other. You can still see their username here to unblock later.'
                : 'Unblocking will restore mutual visibility: profiles and posts will be visible again, and notifications can resume.'}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={closeConfirm}
                disabled={pending}
              >
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
      {reportOpen && (
        <div className="modal-backdrop">
          <div className="modal modal-wide">
            <h2>Report @{username}</h2>
            <p>
              Reports are confidential. The reported user will not know who reported them. Reports
              are reviewed by moderators.
            </p>
            <select
              value={reportCategory}
              onChange={(e) => setReportCategory(e.target.value)}
              className="w-full mb-12"
              disabled={pending}
            >
              <option value="" disabled>
                Select a reason
              </option>
              <option value="Spam">Spam</option>
              <option value="Harassment">Harassment</option>
              <option value="Hate">Hate</option>
              <option value="Sexual content">Sexual content</option>
              <option value="Impersonation">Impersonation</option>
              <option value="Platform misuse">Platform misuse</option>
              <option value="Self-harm">Self-harm</option>
              <option value="Other">Other</option>
            </select>
            <textarea
              value={reportReason}
              className="border-bottom-accent-focus w-full mb-12"
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Additional details..."
              rows={4}
              disabled={pending}
            />
            {!isBlocked && (
              <label className="checkbox mb-12">
                <input
                  type="checkbox"
                  checked={reportAlsoBlock}
                  onChange={(e) => setReportAlsoBlock(e.target.checked)}
                  disabled={pending}
                />
                Also block this user
              </label>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={closeReport}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => void submitReport()}
                disabled={
                  pending || !reportCategory || (reportCategory === 'Other' && !reportReason.trim())
                }
              >
                Submit report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
