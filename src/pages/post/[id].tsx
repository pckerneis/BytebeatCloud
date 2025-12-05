import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../../components/PostList';
import Head from 'next/head';
import { enrichWithViewerFavorites } from '../../utils/favorites';
import { enrichWithTags } from '../../utils/tags';

export default function PostDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forks, setForks] = useState<PostRow[]>([]);
  const [forksError, setForksError] = useState('');

  const { user } = useSupabaseAuth();

  const renderDescriptionWithTags = (description: string) => {
    const nodes: JSX.Element[] = [];
    // Match #tags where the tag body is 1–30 valid chars and is NOT followed
    // by another valid tag char, so sequences longer than 30 are ignored.
    const regex = /#([A-Za-z0-9_-]{1,30})(?![A-Za-z0-9_-])/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let i = 0;

    while ((match = regex.exec(description)) !== null) {
      const fullMatch = match[0]; // e.g. "#Tag"
      const tagName = match[1];
      const start = match.index;

      // Add any plain text before this tag.
      if (start > lastIndex) {
        nodes.push(
          <span key={`text-${i}`}>{description.slice(lastIndex, start)}</span>,
        );
        i += 1;
      }

      const normalized = tagName.toLowerCase();

      nodes.push(
        <Link key={`tag-${i}`} href={`/tags/${normalized}`} className="tag-link">
          #{tagName}
        </Link>,
      );
      i += 1;

      lastIndex = start + fullMatch.length;
    }

    // Trailing text after the last tag.
    if (lastIndex < description.length) {
      nodes.push(
        <span key={`text-${i}`}>{description.slice(lastIndex)}</span>,
      );
    }

    return nodes;
  };

  useEffect(() => {
    if (!id || typeof id !== 'string') return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setPosts([]);
      setForks([]);
      setForksError('');

      const { data, error } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
        )
        .eq('id', id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.warn('Error loading post', error.message);
        setError('Unable to load post.');
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Post not found.');
        setLoading(false);
        return;
      }

      let rowWithCount = data as PostRow;

      if (user) {
        const { data: favs, error: favError } = await supabase
          .from('favorites')
          .select('post_id')
          .eq('profile_id', (user as any).id)
          .eq('post_id', rowWithCount.id);

        if (!favError && favs && favs.length > 0) {
          rowWithCount = {
            ...rowWithCount,
            favorited_by_current_user: true,
          };
        }
      }

      // Attach tags for the main post.
      [rowWithCount] = (await enrichWithTags([rowWithCount])) as PostRow[];

      setPosts([rowWithCount]);

      // Load published forks of this post
      const { data: forkRows, error: forkError } = await supabase
        .from('posts_with_meta')
        .select(
          'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
        )
        .eq('fork_of_post_id', id)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      if (forkError) {
        // eslint-disable-next-line no-console
        console.warn('Error loading forks for post', forkError.message);
        setForksError('Unable to load forks.');
      } else {
        let rows = (forkRows ?? []) as PostRow[];

        if (user && rows.length > 0) {
          rows = (await enrichWithViewerFavorites((user as any).id as string, rows)) as PostRow[];
        }

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        setForks(rows);
      }

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  return (
    <>
      <Head>
        <title>BytebeatCloud - Post detail</title>
      </Head>
      <section>
        <button type="button" className="button ghost" onClick={() => router.back()}>
          ← Back
        </button>
        <h2>Post detail</h2>

        {loading && <p>Loading…</p>}
        {!loading && error && <p className="error-message">{error}</p>}

        {!loading && !error && posts.length > 0 && (
          <>
            <PostList posts={posts} currentUserId={user ? (user as any).id : undefined} />

            {posts[0]?.description && (
              <p className="post-description-detail">
                {renderDescriptionWithTags(posts[0].description)}
              </p>
            )}

            <h3>Forks</h3>
            {forksError && <p className="error-message">{forksError}</p>}
            {!forksError && forks.length === 0 && <p>No forks yet.</p>}
            {!forksError && forks.length > 0 && (
              <PostList posts={forks} currentUserId={user ? (user as any).id : undefined} />
            )}
          </>
        )}
      </section>
    </>
  );
}
