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
  const [blocked, setBlocked] = useState<
    { blocked_id: string; created_at: string; username: string | null }[]
  >([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedError, setBlockedError] = useState('');
  const [reports, setReports] = useState<
    {
      id: string;
      reported_id: string;
      reported_username: string | null;
      reason: string;
      details: string | null;
      status: string;
      created_at: string;
      notes: { id: string; content: string; created_at: string }[];
    }[]
  >([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState('');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [postReports, setPostReports] = useState<
    {
      id: string;
      post_id: string;
      post_title: string | null;
      reason: string;
      details: string | null;
      status: string;
      created_at: string;
      notes: { id: string; content: string; created_at: string }[];
    }[]
  >([]);
  const [postReportsLoading, setPostReportsLoading] = useState(false);
  const [postReportsError, setPostReportsError] = useState('');
  const [expandedPostReport, setExpandedPostReport] = useState<string | null>(null);
  const [newPostReportNote, setNewPostReportNote] = useState('');
  const [addingPostReportNote, setAddingPostReportNote] = useState(false);

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

  // Load user reports
  useEffect(() => {
    const loadReports = async () => {
      if (!user) return;
      setReportsLoading(true);
      setReportsError('');
      const { data, error } = await supabase
        .from('user_reports')
        .select(
          'id,reported_id,reason,details,status,created_at,reported_profile:profiles!user_reports_reported_id_fkey(username),report_notes(id,content,created_at)'
        )
        .eq('reporter_id', (user as any).id)
        .order('created_at', { ascending: false });
      if (error) {
        setReportsError(error.message);
        setReports([]);
        setReportsLoading(false);
        return;
      }
      const rows = (data ?? []).map((r: any) => ({
        id: r.id as string,
        reported_id: r.reported_id as string,
        reported_username: (r.reported_profile?.username as string) ?? null,
        reason: r.reason as string,
        details: r.details as string | null,
        status: r.status as string,
        created_at: r.created_at as string,
        notes: ((r.report_notes as any[]) ?? []).map((n: any) => ({
          id: n.id as string,
          content: n.content as string,
          created_at: n.created_at as string,
        })),
      }));
      setReports(rows);
      setReportsLoading(false);
    };
    void loadReports();
  }, [user]);

  // Load post reports
  useEffect(() => {
    const loadPostReports = async () => {
      if (!user) return;
      setPostReportsLoading(true);
      setPostReportsError('');
      const { data, error } = await supabase
        .from('post_reports')
        .select(
          'id,post_id,reason,details,status,created_at,post:posts!post_reports_post_id_fkey(title),post_report_notes(id,content,created_at)'
        )
        .eq('reporter_id', (user as any).id)
        .order('created_at', { ascending: false });
      if (error) {
        setPostReportsError(error.message);
        setPostReports([]);
        setPostReportsLoading(false);
        return;
      }
      const rows = (data ?? []).map((r: any) => ({
        id: r.id as string,
        post_id: r.post_id as string,
        post_title: (r.post?.title as string) ?? null,
        reason: r.reason as string,
        details: r.details as string | null,
        status: r.status as string,
        created_at: r.created_at as string,
        notes: ((r.post_report_notes as any[]) ?? []).map((n: any) => ({
          id: n.id as string,
          content: n.content as string,
          created_at: n.created_at as string,
        })),
      }));
      setPostReports(rows);
      setPostReportsLoading(false);
    };
    void loadPostReports();
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

  const formatStatus = (status: string) => {
    switch (status) {
      case 'received':
        return 'Received';
      case 'under_review':
        return 'Under review';
      case 'action_taken':
        return 'Action taken';
      case 'closed_no_action':
        return 'Closed - no action';
      default:
        return status;
    }
  };

  const handleAddNote = async (reportId: string) => {
    if (!user || !newNote.trim()) return;
    setAddingNote(true);
    const { data, error } = await supabase
      .from('report_notes')
      .insert({
        report_id: reportId,
        author_id: (user as any).id,
        content: newNote.trim(),
      })
      .select('id,content,created_at')
      .single();
    if (error) {
      setReportsError(error.message);
      setAddingNote(false);
      return;
    }
    // Add note to the report in state
    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId
          ? {
              ...r,
              notes: [
                ...r.notes,
                { id: data.id, content: data.content, created_at: data.created_at },
              ],
            }
          : r
      )
    );
    setNewNote('');
    setAddingNote(false);
  };

  const handleAddPostReportNote = async (reportId: string) => {
    if (!user || !newPostReportNote.trim()) return;
    setAddingPostReportNote(true);
    const { data, error } = await supabase
      .from('post_report_notes')
      .insert({
        report_id: reportId,
        author_id: (user as any).id,
        content: newPostReportNote.trim(),
      })
      .select('id,content,created_at')
      .single();
    if (error) {
      setPostReportsError(error.message);
      setAddingPostReportNote(false);
      return;
    }
    setPostReports((prev) =>
      prev.map((r) =>
        r.id === reportId
          ? {
              ...r,
              notes: [
                ...r.notes,
                { id: data.id, content: data.content, created_at: data.created_at },
              ],
            }
          : r
      )
    );
    setNewPostReportNote('');
    setAddingPostReportNote(false);
  };

  return (
    <>
      <Head>
        <title>Update profile - BytebeatCloud</title>
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
                className="border-bottom-accent-focus"
                placeholder="Choose a username"
                maxLength={32}
              />
            </label>

            <h3>Bio</h3>
            <label className="field">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="border-bottom-accent-focus"
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
                  className="border-bottom-accent-focus"
                  placeholder={`social link ${index + 1}`}
                />
              </label>
            ))}

            <button
              type="submit"
              className="button secondary mt-10"
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save profile'}
            </button>

            {blocked.length > 0 && (
              <>
                <h3>Blocked users</h3>
                {blockedLoading && <p className="text-centered">Loading…</p>}
                {!blockedLoading && blockedError && <p className="error-message">{blockedError}</p>}
                {!blockedLoading && !blockedError && (
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
              </>
            )}

            {reports.length > 0 && (
              <>
                <h3>My user reports</h3>
            {reportsLoading && <p className="text-centered">Loading…</p>}
                {!reportsLoading && reportsError && <p className="error-message">{reportsError}</p>}
                {!reportsLoading && !reportsError && (
              <ul className="notifications-list">
                {reports.map((r) => (
                  <li key={r.id} className="notification-item">
                    <div className="post-header">
                      <div style={{ flex: 1 }}>
                        <div>
                          <strong>@{r.reported_username || 'unknown'}</strong>
                          <span className="secondary-text" style={{ marginLeft: 8 }}>
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <span>Reason: {r.reason}</span>
                          {r.details && (
                            <span className="secondary-text"> — {r.details}</span>
                          )}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          Status: <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: '12px',
                              border: '1px solid var(--chip-border-color)',
                              background:
                                r.status === 'action_taken'
                                  ? 'var(--success-color, #4caf50)'
                                  : r.status === 'under_review'
                                  ? 'var(--warning-color, #ff9800)'
                                  : 'var(--chip-bg-color)',
                            }}
                          >
                            {formatStatus(r.status)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button ghost"
                          style={{ marginTop: 8, padding: '4px 8px', fontSize: '12px' }}
                          onClick={() =>
                            setExpandedReport(expandedReport === r.id ? null : r.id)
                          }
                        >
                          {expandedReport === r.id ? '▼ Hide notes' : '▶ Notes'} ({r.notes.length})
                        </button>
                        {expandedReport === r.id && (
                          <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--chip-border-color)' }}>
                            {r.notes.length === 0 && (
                              <p className="secondary-text" style={{ fontSize: '13px' }}>
                                No notes yet.
                              </p>
                            )}
                            {r.notes
                              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                              .map((n) => (
                                <div key={n.id} style={{ marginBottom: 8 }}>
                                  <span className="secondary-text" style={{ fontSize: '11px' }}>
                                    {new Date(n.created_at).toLocaleString()}
                                  </span>
                                  <p style={{ margin: '2px 0 0 0', fontSize: '13px' }}>{n.content}</p>
                                </div>
                              ))}
                            <div style={{ marginTop: 8 }}>
                              <textarea
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                placeholder="Add a note..."
                                rows={2}
                                className="border-bottom-accent-focus"
                                style={{ width: '100%', resize: 'vertical', fontSize: '13px' }}
                                disabled={addingNote}
                              />
                              <button
                                type="button"
                                className="button secondary"
                                style={{ marginTop: 4, padding: '4px 8px', fontSize: '12px' }}
                                onClick={() => void handleAddNote(r.id)}
                                disabled={addingNote || !newNote.trim()}
                              >
                                {addingNote ? 'Adding…' : 'Add note'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
                )}
              </>
            )}

            {postReports.length > 0 && (
              <>
                <h3>My post reports</h3>
                {postReportsLoading && <p className="text-centered">Loading…</p>}
                {!postReportsLoading && postReportsError && (
                  <p className="error-message">{postReportsError}</p>
                )}
                {!postReportsLoading && !postReportsError && (
              <ul className="notifications-list">
                {postReports.map((r) => (
                  <li key={r.id} className="notification-item">
                    <div className="post-header">
                      <div style={{ flex: 1 }}>
                        <div>
                          <a href={`/post/${r.post_id}`} style={{ fontWeight: 'bold' }}>
                            {r.post_title || '(untitled post)'}
                          </a>
                          <span className="secondary-text" style={{ marginLeft: 8 }}>
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <span>Reason: {r.reason}</span>
                          {r.details && (
                            <span className="secondary-text"> — {r.details}</span>
                          )}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          Status:{' '}
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: '12px',
                              border: '1px solid var(--chip-border-color)',
                              background:
                                r.status === 'action_taken'
                                  ? 'var(--success-color, #4caf50)'
                                  : r.status === 'under_review'
                                  ? 'var(--warning-color, #ff9800)'
                                  : 'var(--chip-bg-color)',
                            }}
                          >
                            {formatStatus(r.status)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button ghost"
                          style={{ marginTop: 8, padding: '4px 8px', fontSize: '12px' }}
                          onClick={() =>
                            setExpandedPostReport(expandedPostReport === r.id ? null : r.id)
                          }
                        >
                          {expandedPostReport === r.id ? '▼ Hide notes' : '▶ Notes'} ({r.notes.length})
                        </button>
                        {expandedPostReport === r.id && (
                          <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--chip-border-color)' }}>
                            {r.notes.length === 0 && (
                              <p className="secondary-text" style={{ fontSize: '13px' }}>
                                No notes yet.
                              </p>
                            )}
                            {r.notes
                              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                              .map((n) => (
                                <div key={n.id} style={{ marginBottom: 8 }}>
                                  <span className="secondary-text" style={{ fontSize: '11px' }}>
                                    {new Date(n.created_at).toLocaleString()}
                                  </span>
                                  <p style={{ margin: '2px 0 0 0', fontSize: '13px' }}>{n.content}</p>
                                </div>
                              ))}
                            <div style={{ marginTop: 8 }}>
                              <textarea
                                value={newPostReportNote}
                                onChange={(e) => setNewPostReportNote(e.target.value)}
                                placeholder="Add a note..."
                                rows={2}
                                className="border-bottom-accent-focus"
                                style={{ width: '100%', resize: 'vertical', fontSize: '13px' }}
                                disabled={addingPostReportNote}
                              />
                              <button
                                type="button"
                                className="button secondary"
                                style={{ marginTop: 4, padding: '4px 8px', fontSize: '12px' }}
                                onClick={() => void handleAddPostReportNote(r.id)}
                                disabled={addingPostReportNote || !newPostReportNote.trim()}
                              >
                                {addingPostReportNote ? 'Adding…' : 'Add note'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
                )}
              </>
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
