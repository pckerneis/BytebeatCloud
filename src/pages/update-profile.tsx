import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { validateUsername } from '../utils/username-validator';
import Head from 'next/head';
import { useCurrentUserProfile } from '../hooks/useCurrentUserProfile';

export default function UpdateProfilePage() {
  const router = useRouter();
  const {
    user,
    status,
    error: profileError,
    username: loadedUsername,
    bio: loadedBio,
    socialLinks: loadedSocialLinks,
  } = useCurrentUserProfile();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [socialLinks, setSocialLinks] = useState<string[]>(['', '', '']);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving'>('idle');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (loadedUsername) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUsername(loadedUsername);
    }
    if (loadedBio !== null) {
      setBio(loadedBio);
    }
    if (loadedSocialLinks) {
      // Pad to 3 entries
      setSocialLinks([
        loadedSocialLinks[0] ?? '',
        loadedSocialLinks[1] ?? '',
        loadedSocialLinks[2] ?? '',
      ]);
    }
  }, [loadedUsername, loadedBio, loadedSocialLinks]);

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
      .update({
        username: username.trim(),
        bio: bio.trim() || null,
        social_links: socialLinks.filter((url) => url.trim()).map((url) => url.trim()),
      })
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

  const handleSocialLinkChange = (index: number, value: string) => {
    const updated = [...socialLinks];
    updated[index] = value;
    setSocialLinks(updated);
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

            <h3>Username</h3>
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

            <h3>Bio</h3>
            <label className="field">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="post-title-input"
                placeholder="Tell us about yourself"
                maxLength={500}
                rows={4}
                style={{ resize: 'vertical' }}
              />
            </label>
            <p className="field-hint">{bio.length}/500 characters</p>

            <h3>Social links</h3>
            {socialLinks.map((url, index) => (
              <label key={index} className="field">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => handleSocialLinkChange(index, e.target.value)}
                  className="post-title-input"
                  placeholder={`social link ${index + 1}`}
                />
              </label>
            ))}

            <button
              type="submit"
              className="button secondary"
              style={{ marginTop: '10px' }}
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save profile'}
            </button>

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
