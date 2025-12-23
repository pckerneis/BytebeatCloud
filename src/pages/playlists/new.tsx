import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

export default function NewPlaylistPage() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    // no redirect to login automatically; show inline prompt instead
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      void router.push('/login');
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Please enter a playlist name.');
      return;
    }
    if (trimmed.length > 64) {
      setError('Playlist name must be 64 characters or fewer.');
      return;
    }

    setPending(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('playlists')
        .insert({
          owner_id: (user as any).id,
          title: trimmed,
          description: description.trim() || null,
          visibility,
        })
        .select('id')
        .single();
      if (error) throw error;
      const newId = data.id as string;
      setCreatedId(newId);

      // If a sourcePostId is provided, append it to the new playlist then redirect
      const sourcePostId =
        typeof router.query.sourcePostId === 'string' ? router.query.sourcePostId : undefined;
      if (sourcePostId) {
        // compute next position
        const { data: posRow, error: posErr } = await supabase
          .from('playlist_entries')
          .select('position')
          .eq('playlist_id', newId)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (posErr) throw posErr;
        const nextPos = (posRow?.position ?? 0) + 1;

        const { error: insertErr } = await supabase.from('playlist_entries').insert({
          playlist_id: newId,
          post_id: sourcePostId,
          position: nextPos,
        });
        if (insertErr) throw insertErr;
      }

      // redirect to playlist detail page
      await router.push(`/playlists/${newId}`);
    } catch (err: any) {
      console.warn('Failed to create playlist', err?.message || err);
      setError('Failed to create playlist. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const pageTitle = 'Create a new playlist - BytebeatCloud';

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={() => router.back()}>
          ← Back
        </button>
        <h2>Create a new playlist</h2>

        {!loading && !user && (
          <p className="secondary-text">
            <Link href="/login">Log in</Link> to create a playlist.
          </p>
        )}

        {!createdId ? (
          <form onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
            <div className="form-field">
              <label htmlFor="title">Name</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={64}
                placeholder="My playlist"
                required
              />
              <div className="secondary-text" style={{ fontSize: 12 }}>
                {title.length}/64
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional description"
              />
            </div>

            <div className="form-field">
              <label htmlFor="visibility">Visibility</label>
              <select
                id="visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'public' | 'unlisted' | 'private')}
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </div>

            {error && (
              <p className="error-message" style={{ marginTop: 8 }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="submit" className="button" disabled={pending || !user}>
                {pending ? 'Creating…' : 'Create playlist'}
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => router.back()}
                disabled={pending}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </>
  );
}
