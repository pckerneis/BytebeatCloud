import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../lib/supabaseClient';
import { PostList, type PostHighlight, type PostRow } from '../components/PostList';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { enrichWithTags } from '../utils/tags';
import { validateExpression } from '../utils/expression-validator';
import { highlightTerms } from '../utils/highlight';

export default function SearchPage() {
  const router = useRouter();
  const { user } = useSupabaseAuth();

  const terms = typeof router.query.terms === 'string' ? router.query.terms.trim() : '';

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [highlights, setHighlights] = useState<Record<string, PostHighlight>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalLoaded, setTotalLoaded] = useState(0);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const initialLoadDoneRef = useRef(false);
  const currentFetchRef = useRef(0);

  const [inputValue, setInputValue] = useState(terms);

  // Sync input with URL terms
  useEffect(() => {
    setInputValue(terms);
  }, [terms]);

  const resetPagination = useCallback(() => {
    setLoading(true);
    setPosts([]);
    setHighlights({});
    setPage(0);
    setHasMore(true);
    setError('');
    setTotalLoaded(0);
    loadingMoreRef.current = false;
    initialLoadDoneRef.current = false;
    currentFetchRef.current += 1;
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  // Reset when search terms change
  useEffect(() => {
    if (!router.isReady) return;
    resetPagination();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms, router.isReady]);

  useEffect(() => {
    if (!router.isReady || !terms) {
      setLoading(false);
      return;
    }

    if (page === 0 && initialLoadDoneRef.current && posts.length > 0) {
      return;
    }

    let cancelled = false;
    currentFetchRef.current += 1;
    const fetchId = currentFetchRef.current;
    const pageSize = 20;
    const actualPage = !initialLoadDoneRef.current ? 0 : page;

    const loadPage = async () => {
      loadingMoreRef.current = true;
      if (actualPage === 0) setLoading(true);
      setError('');

      if (fetchId !== currentFetchRef.current) {
        loadingMoreRef.current = false;
        return;
      }

      const { data, error: rpcError } = await supabase.rpc('search_posts', {
        query: terms,
        page: actualPage,
        page_size: pageSize,
      });

      if (cancelled || fetchId !== currentFetchRef.current) return;

      if (rpcError) {
        setError(rpcError.message ?? String(rpcError));
        if (actualPage === 0) setPosts([]);
        setHasMore(false);
      } else {
        const rawRows = (data ?? []) as Array<PostRow & { rank?: number }>;

        // Tokenize the query for client-side highlighting (all terms, always complete)
        const termTokens = terms
          .trim()
          .split(/\s+/)
          .filter((t) => t.length > 0);

        // Build highlight map using client-side computation so all terms are always marked
        const newHighlights: Record<string, PostHighlight> = {};
        for (const row of rawRows) {
          newHighlights[row.id] = {
            title: row.title ? highlightTerms(row.title, termTokens) : undefined,
            description: row.description ? highlightTerms(row.description, termTokens) : undefined,
          };
        }

        let rows: PostRow[] = rawRows.map(({ rank, ...rest }) => rest as PostRow);

        if (cancelled || fetchId !== currentFetchRef.current) return;

        if (rows.length > 0) {
          rows = (await enrichWithTags(rows)) as PostRow[];
        }

        if (cancelled || fetchId !== currentFetchRef.current) return;

        // Security: drop posts with invalid expressions
        rows = rows.filter((r) => validateExpression(r.expression).valid);

        const newPosts = actualPage === 0 ? rows : [...posts, ...rows];
        setPosts(newPosts);
        setHighlights((prev) => (actualPage === 0 ? newHighlights : { ...prev, ...newHighlights }));
        setTotalLoaded(actualPage === 0 ? rows.length : totalLoaded + rows.length);
        setHasMore(rows.length >= pageSize);
        initialLoadDoneRef.current = true;
      }

      loadingMoreRef.current = false;
      setLoading(false);
    };

    void loadPage();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms, page, router.isReady]);

  useInfiniteScroll({ hasMore, loadingMoreRef, sentinelRef, setPage });

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = inputValue.trim();
    if (!q) return;
    if (q === terms) {
      resetPagination();
      return;
    }
    void router.push({ pathname: '/search', query: { terms: q } });
  };

  const headTitle = terms ? `Search: ${terms} - BytebeatCloud` : 'Search - BytebeatCloud';

  return (
    <>
      <Head>
        <title>{headTitle}</title>
        <meta name="description" content={`Search results for "${terms}" on BytebeatCloud`} />
      </Head>
      <section>
        <h2>Search</h2>

        <form onSubmit={handleSearch} className="search-form">
          <input
            type="search"
            className="search-input"
            placeholder="Search posts by title or description…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
          />
          <button type="submit" className="button primary">
            Search
          </button>
        </form>

        {terms && (
          <>
            {loading && <p className="text-centered">Searching…</p>}
            {error && !loading && <p className="error-message">{error}</p>}
            {!loading && !error && posts.length === 0 && (
              <p className="text-centered">No results for &quot;{terms}&quot;.</p>
            )}
            {!loading && !error && posts.length > 0 && (
              <>
                <p className="search-result-count">
                  {hasMore
                    ? `Showing ${posts.length} results for "${terms}"`
                    : `${posts.length} result${posts.length === 1 ? '' : 's'} for "${terms}"`}
                </p>
                <PostList
                  posts={posts}
                  currentUserId={user ? (user as any).id : undefined}
                  highlights={highlights}
                />
              </>
            )}
            <div ref={sentinelRef} style={{ height: 1 }} data-testid="scroll-sentinel" />
            {hasMore && !loading && posts.length > 0 && (
              <p className="text-centered">Loading more…</p>
            )}
            {!hasMore && !loading && posts.length > 0 && (
              <p className="text-centered">You reached the end!</p>
            )}
          </>
        )}

        {!terms && !loading && (
          <p className="text-centered">Enter a search query above to find posts.</p>
        )}
      </section>
    </>
  );
}
