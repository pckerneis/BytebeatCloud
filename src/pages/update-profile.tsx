import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { validateUsername } from '../utils/username-validator';
import Head from 'next/head';
import { useCurrentUserProfile } from '../hooks/useCurrentUserProfile';

export default function UpdateProfilePage() {
  const router = useRouter();
  const { user, status, error: profileError, username: loadedUsername } = useCurrentUserProfile();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving'>('idle');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [blocked, setBlocked] = useState<
    { blocked_id: string; created_at: string; username: string | null }[]
  >([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedError, setBlockedError] = useState('');

  useEffect(() => {
    if (loadedUsername) {
      setUsername(loadedUsername);
    }
  }, [loadedUsername]);

  // Load blocked users for current user
  useEffect(() => {
    const loadBlocked = async () => {
      if (!user) return;
      setBlockedLoading(true);
      setBlockedError('');
      const { data, error } = await supabase
        .from('blocked_users')
        .select('blocked_id,created_at,blocked_profile:profiles!blocked_users_blocked_id_fkey(username)')
        .eq('blocker_id', (user as any).id)
        .order('created_at', { ascending: false });
      if (error) {
        setBlockedError(error.message);
        setBlocked([]);
        setBlockedLoading(false);
        return;
      }
      const rows = (data ?? []).map((r: any) => ({
        blocked_id: r.blocked_id as string,
        created_at: r.created_at as string,
        username: (r.blocked_profile?.username as string) ?? null,
      }));
      setBlocked(rows);
      setBlockedLoading(false);
    };
    void loadBlocked();
  }, [user]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user) return;

    const message = validateUsername(username);
    if (message) {
      setError(message);
      return;
    }

    setSaveStatus('saving');
    setError('');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ username: username.trim() })
      .eq('id', (user as any).id);

    if (updateError) {
      if ((updateError as any).code === '23505') {
        setError('This username is already taken');
      } else {
        setError(updateError.message);
      }
      setSaveStatus('idle');
      return;
    }

    setSaveStatus('idle');
    void router.push('/profile');
  };

  const handleConfirmDeleteAccount = async () => {
    if (!user) return;

    setSaveStatus('saving');
    setError('');

    const userId = (user as any).id as string;

    // 1) Delete all favorites created by this user.
    const { error: favoritesByUserError } = await supabase
      .from('favorites')
      .delete()
      .eq('profile_id', userId);

    if (favoritesByUserError) {
      setError(favoritesByUserError.message);
      setSaveStatus('idle');
      return;
    }

    // 2) Load all posts by this user so we can remove favorites pointing to them,
    //    then delete the posts themselves.
    const { data: userPosts, error: postsError } = await supabase
      .from('posts')
      .select('id')
      .eq('profile_id', userId);

    if (postsError) {
      setError(postsError.message);
      setSaveStatus('idle');
      return;
    }

    const postIds = (userPosts ?? []).map((p: any) => p.id as string);

    if (postIds.length > 0) {
      const { error: favoritesOnPostsError } = await supabase
        .from('favorites')
        .delete()
        .in('post_id', postIds);

      if (favoritesOnPostsError) {
        setError(favoritesOnPostsError.message);
        setSaveStatus('idle');
        return;
      }

      const { error: deletePostsError } = await supabase
        .from('posts')
        .delete()
        .eq('profile_id', userId);

      if (deletePostsError) {
        setError(deletePostsError.message);
        setSaveStatus('idle');
        return;
      }
    }

    // 3) Finally, delete the profile itself.
    const { error: deleteProfileError } = await supabase.from('profiles').delete().eq('id', userId);

    if (deleteProfileError) {
      setError(deleteProfileError.message);
      setSaveStatus('idle');
      return;
    }

    await supabase.auth.signOut();
    await router.push('/');
  };

  const handleDeleteAccountClick = () => {
    setError('');
    setIsDeleteModalOpen(true);
  };

  const handleCancelDelete = () => {
    if (saveStatus === 'saving') return;
    setIsDeleteModalOpen(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await router.push('/');
  };

  const handleUnblock = async (blockedId: string) => {
    if (!user) return;
    setBlockedError('');
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', (user as any).id)
      .eq('blocked_id', blockedId);
    if (error) {
      setBlockedError(error.message);
      return;
    }
    setBlocked((prev) => prev.filter((b) => b.blocked_id !== blockedId));
  };

  return (
    <>
      <Head>
        <title>BytebeatCloud - Update profile</title>
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={() => router.back()}>
          ← Back
        </button>
        {status === 'loading' && <p className="text-centered">Loading your profile…</p>}
        {status === 'error' && <p className="error-message">{profileError}</p>}

        {status === 'idle' && (
          <form className="create-form" onSubmit={handleSave}>
            <h2>Update profile</h2>
            <p>Logged in as {user?.email ?? ''}</p>

            <button type="button" className="button secondary" onClick={handleSignOut}>
              Sign out
            </button>

            <h3>Update username</h3>
            <label className="field">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="post-title-input"
                placeholder="Choose a username"
                maxLength={32}
              />
            </label>
            <button type="submit" className="button secondary" disabled={saveStatus === 'saving'}>
              {saveStatus === 'saving' ? 'Saving…' : 'Save username'}
            </button>

            <h3>Blocked users</h3>
            {blockedLoading && <p className="text-centered">Loading…</p>}
            {!blockedLoading && blockedError && <p className="error-message">{blockedError}</p>}
            {!blockedLoading && !blockedError && blocked.length === 0 && (
              <p>You have not blocked any user.</p>
            )}
            {!blockedLoading && !blockedError && blocked.length > 0 && (
              <ul className="notifications-list">
                {blocked.map((b) => (
                  <li key={b.blocked_id} className="notification-item">
                    <div className="post-header">
                      <div>
                        <span>You blocked </span>
                        <strong>@{b.username || 'unknown'}</strong>
                        <span className="secondary-text" style={{ marginLeft: 8 }}>
                          on {new Date(b.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        style={{marginTop: '5px'}}
                        type="button"
                        className="button secondary"
                        onClick={() => void handleUnblock(b.blocked_id)}
                      >
                        Unblock
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h3>Delete account</h3>

            <p>
              Deleting your account is permanent and cannot be undone. All of your data, including
              posts, drafts, and favorites, will be permanently removed.
            </p>

            <button
              type="button"
              className="button danger"
              onClick={handleDeleteAccountClick}
              disabled={saveStatus === 'saving'}
            >
              Delete account
            </button>

            {error && <p className="error-message">{error}</p>}
          </form>
        )}

        {isDeleteModalOpen && (
          <div className="modal-backdrop">
            <div className="modal">
              <h3>Confirm account deletion</h3>
              <p>
                Are you sure you want to delete your account? This action is permanent and cannot be
                undone. All of your data, including posts, drafts, and favorites, will be
                permanently removed.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={handleCancelDelete}
                  disabled={saveStatus === 'saving'}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button danger"
                  onClick={handleConfirmDeleteAccount}
                  disabled={saveStatus === 'saving'}
                >
                  Yes, delete my account
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
