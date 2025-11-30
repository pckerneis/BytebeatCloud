import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { supabase } from '../lib/supabaseClient';
import { validateUsername } from '../lib/validateUsername';

export default function UpdateProfilePage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'no-user'>('idle');
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving'>('idle');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    if (loading) {
      return;
    }

    if (!user) {
      setStatus('no-user');
      void router.replace('/login');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setError('');

    const go = async () => {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', (user as any).id)
        .maybeSingle();

      if (cancelled) return;

      if (profileError || !data?.username) {
        setStatus('error');
        setError('Unable to load your profile.');
        return;
      }

      setUsername(data.username);
      setStatus('idle');
    };

    void go();

    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user || !supabase) return;

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
    if (!user || !supabase) return;

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
    const { error: deleteProfileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

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

  return (
    <section>
      {status === 'loading' && <p className="text-centered">Loading your profile…</p>}
      {status === 'error' && <p className="error-message">{error}</p>}

      {status === 'idle' && (
        <form className="create-form" onSubmit={handleSave}>
          <h2>Update profile</h2>
          <p>Logged in as {user?.email ?? ''}</p>

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
          <div>
            <button
              type="submit"
              className="button primary"
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save username'}
            </button>
          </div>

          <h3>Delete account</h3>

          <p>
            Deleting your account is permanent and cannot be undone. All of your
            data, including posts, drafts, and favorites, will be permanently removed.
          </p>

          <div>
            <button
              type="button"
              className="button danger"
              onClick={handleDeleteAccountClick}
              disabled={saveStatus === 'saving'}
            >
              Delete account
            </button>
          </div>

          {error && <p className="error-message">{error}</p>}
        </form>
      )}

      {isDeleteModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Confirm account deletion</h3>
            <p>
              Are you sure you want to delete your account? This action is permanent and
              cannot be undone. All of your data, including posts, drafts, and favorites,
              will be permanently removed.
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
  );
}
