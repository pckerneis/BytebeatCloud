import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../lib/supabaseClient';
import { PostList, type PostRow } from '../../components/PostList';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { enrichWithViewerFavorites } from '../../utils/favorites';
import { enrichWithTags } from '../../utils/tags';
import { validateExpression } from '../../utils/expression-validator';

export default function TagPage() {
  const router = useRouter();
  const { tag } = router.query;
  const { user } = useSupabaseAuth();

  const [normalizedTag, setNormalizedTag] = useState<string | null>(null);
  const [displayTag, setDisplayTag] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<'recent' | 'trending'>('recent');

  useEffect(() => {
    // Reset pagination when tag or tab changes
    setPosts([]);
    setPage(0);
    setHasMore(true);
  }, [tag, activeTab]);

  useEffect(() => {
    if (!tag || typeof tag !== 'string') return;

    let cancelled = false;
    const pageSize = 20;
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const loadPage = async () => {
      loadingMoreRef.current = true;
      if (page === 0) {
        setLoading(true);
      }
      setError('');

      const slug = tag.toLowerCase();
      setNormalizedTag(slug);

      // 1) Resolve the tag row
      const { data: tagRow, error: tagError } = await supabase
        .from('tags')
        .select('id, name')
        .eq('name', slug)
        .maybeSingle();

      if (cancelled) return;

      if (tagError || !tagRow) {
        setError('Tag not found.');
        if (page === 0) setPosts([]);
        setHasMore(false);
        loadingMoreRef.current = false;
        setLoading(false);
        return;
      }

      setDisplayTag(tagRow.name as string);

      // 2) All post IDs for this tag
      const { data: postTagRows, error: postTagError } = await supabase
        .from('post_tags')
        .select('post_id')
        .eq('tag_id', tagRow.id);

      if (cancelled) return;

      if (postTagError) {
        setError('Unable to load posts for this tag.');
        if (page === 0) setPosts([]);
        setHasMore(false);
        loadingMoreRef.current = false;
        setLoading(false);
        return;
      }

      const postIds = (postTagRows ?? []).map((row: any) => row.post_id as string);
      if (postIds.length === 0) {
        if (page === 0) setPosts([]);
        setHasMore(false);
        loadingMoreRef.current = false;
        setLoading(false);
        return;
      }

      // 3) Load posts for current tab
      let result;
      if (activeTab === 'recent') {
        result = await supabase
          .from('posts_with_meta')
          .select(
            'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
          )
          .in('id', postIds)
          .eq('is_draft', false)
          .order('created_at', { ascending: false })
          .range(from, to);
      } else {
        // trending within this tag
        result = await supabase
          .from('posts_with_meta')
          .select(
            'id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count',
          )
          .in('id', postIds)
          .eq('is_draft', false)
          .order('favorites_count', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, to);
      }

      if (cancelled) return;

      if (result.error) {
        setError(result.error.message ?? String(result.error));
        if (page === 0) setPosts([]);
        setHasMore(false);
      } else {
        let rows = (result.data ?? []) as PostRow[];

        if (user && rows.length > 0) {
          rows = (await enrichWithViewerFavorites((user as any).id as string, rows)) as PostRow[];
        }

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        // Security: drop posts with invalid expressions
        rows = rows.filter((r) => validateExpression(r.expression).valid);

        setPosts((prev) => (page === 0 ? rows : [...prev, ...rows]));
        if (rows.length < pageSize) {
          setHasMore(false);
        }
      }

      loadingMoreRef.current = false;
      setLoading(false);
    };

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [tag, user, activeTab, page]);

  useInfiniteScroll({ hasMore, loadingMoreRef, sentinelRef, setPage });

  const handleTabClick = (tab: 'recent' | 'trending') => {
    if (tab === activeTab) return;
    setActiveTab(tab);
  };

  const titleTag = displayTag ?? normalizedTag ?? '';

  return (
    <>
      <Head>
        <title>{titleTag ? `#${titleTag} - BytebeatCloud` : 'Tag - BytebeatCloud'}</title>
      </Head>
      <section>
        <h2>{titleTag ? `#${titleTag}` : 'Tag'}</h2>

        <div className="tab-header">
          <span
            className={`tab-button ${activeTab === 'recent' ? 'active' : ''}`}
            onClick={() => handleTabClick('recent')}
          >
            Recent
          </span>
          <span
            className={`tab-button ${activeTab === 'trending' ? 'active' : ''}`}
            onClick={() => handleTabClick('trending')}
          >
            Trending
          </span>
        </div>

        {loading && <p className="text-centered">Loading posts…</p>}
        {error && !loading && <p className="error-message">{error}</p>}

        {!loading && !error && posts.length === 0 && (
          <p className="text-centered">No posts found for this tag.</p>
        )}

        {!loading && !error && posts.length > 0 && (
          <PostList posts={posts} currentUserId={user ? ((user as any).id as string) : undefined} />
        )}

        <div ref={sentinelRef} style={{ height: 1 }} />
        {hasMore && !loading && posts.length > 0 && <p className="text-centered">Loading more…</p>}

        {!hasMore && !loading && posts.length > 0 && (
          <p className="text-centered">You reached the end!</p>
        )}
      </section>
    </>
  );
}
