import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { PostList, type PostRow } from '../../components/PostList';
import Head from 'next/head';
import { enrichWithViewerFavorites } from '../../utils/favorites';
import { enrichWithTags } from '../../utils/tags';
import { validateExpression } from '../../utils/expression-validator';
import {
  renderDescriptionWithTagsAndMentions,
  extractMentionUserIds,
} from '../../utils/description-renderer';

export default function PostDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forks, setForks] = useState<PostRow[]>([]);
  const [forksError, setForksError] = useState('');
  const [mentionUserMap, setMentionUserMap] = useState<Map<string, string>>(new Map());

  const { user } = useSupabaseAuth();

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

      // Validate expression; if invalid, block display
      if (!validateExpression(rowWithCount.expression).valid) {
        setError('This post contains an invalid expression.');
        setLoading(false);
        return;
      }

      // Attach tags for the main post.
      [rowWithCount] = (await enrichWithTags([rowWithCount])) as PostRow[];

      // Fetch usernames for mentions in description
      const mentionUserIds = extractMentionUserIds(rowWithCount.description ?? '');
      if (mentionUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', mentionUserIds);

        if (profiles) {
          const userMap = new Map<string, string>();
          for (const p of profiles) {
            userMap.set(p.id, p.username);
          }
          setMentionUserMap(userMap);
        }
      }

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

        // Filter out forks with invalid expressions
        rows = rows.filter((r) => validateExpression(r.expression).valid);
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
                {renderDescriptionWithTagsAndMentions(posts[0].description, mentionUserMap)}
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
