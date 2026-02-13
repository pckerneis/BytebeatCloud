-- Full-text search for posts: tokenized AND search, title weighted higher than description.
-- Relevance scored with ts_rank_cd. Trigram fuzzy title matching for queries >= 4 chars.

-- Trigram extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Unaccent extension
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Stored generated column: pre-computed weighted tsvector (fast GIN lookup, maintained with trigger)
ALTER TABLE posts
    ADD COLUMN search_vector tsvector;

-- Function to update search_vector
CREATE OR REPLACE FUNCTION posts_search_vector_update()
    RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
            setweight(
                    to_tsvector('simple', unaccent(coalesce(NEW.title, ''))),
                    'A'
            )
                ||
            setweight(
                    to_tsvector('simple', unaccent(coalesce(NEW.description, ''))),
                    'B'
            );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger update of search_vector
CREATE TRIGGER posts_search_vector_trigger
    BEFORE INSERT OR UPDATE OF title, description
    ON posts
    FOR EACH ROW
EXECUTE FUNCTION posts_search_vector_update();

-- Backfill existing rows
UPDATE posts SET title = title;

-- GIN index on the stored vector for fast full-text search
CREATE INDEX IF NOT EXISTS idx_posts_search_vector
  ON public.posts
  USING GIN (search_vector);

-- GIN trigram index on title for fast fuzzy matching
CREATE INDEX IF NOT EXISTS idx_posts_title_trgm
  ON public.posts
  USING GIN (title gin_trgm_ops);

-- Search audit log: records every search query with timestamp and optional user
CREATE TABLE IF NOT EXISTS public.search_audit (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  terms      text        NOT NULL CHECK (char_length(terms) BETWEEN 1 AND 500),
  profile_id uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_audit_created_at
  ON public.search_audit (created_at DESC);

ALTER TABLE public.search_audit ENABLE ROW LEVEL SECURITY;

-- Anyone (authenticated or anonymous) may insert;
-- authenticated users must set profile_id to their own uid or leave it null.
CREATE POLICY "search_audit_insert" ON public.search_audit
  FOR INSERT WITH CHECK (
    profile_id IS NULL OR profile_id = auth.uid()
  );

-- Drop previous version of search_posts if it exists (return type may differ)
DROP FUNCTION IF EXISTS public.search_posts(text, integer, integer);

-- Search function:
--   1. FTS path:   uses search_vector GIN index; ranks by ts_rank_cd (title weighted 4x over description)
--   2. Trigram path (query >= 4 chars): fuzzy title match via word_similarity;
--      de-duplicates against FTS results; ranked lower than FTS hits (×0.3 multiplier)
CREATE FUNCTION public.search_posts(
  query text,
  page integer DEFAULT 0,
  page_size integer DEFAULT 20
) RETURNS TABLE(
  id uuid,
  profile_id uuid,
  title text,
  description text,
  expression text,
  sample_rate integer,
  mode text,
  is_draft boolean,
  is_fork boolean,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  fork_of_post_id uuid,
  author_username text,
  origin_title text,
  origin_username text,
  favorites_count integer,
  comments_count integer,
  is_weekly_winner boolean,
  license text,
  auto_skip_duration integer,
  favorited_by_current_user boolean,
  rank float8
) LANGUAGE sql STABLE AS $$
  WITH tsq AS (
    SELECT websearch_to_tsquery('simple', unaccent(query)) AS q
  ),

  -- FTS results: exact + stemmed matches using the stored search_vector GIN index
  fts AS (
    SELECT
      pwm.id,
      pwm.profile_id,
      pwm.title,
      pwm.description,
      pwm.expression,
      pwm.sample_rate,
      pwm.mode::text,
      pwm.is_draft,
      pwm.is_fork,
      pwm.created_at,
      pwm.updated_at,
      pwm.published_at,
      pwm.fork_of_post_id,
      pwm.author_username,
      pwm.origin_title,
      pwm.origin_username,
      pwm.favorites_count,
      pwm.comments_count,
      pwm.is_weekly_winner,
      pwm.license::text,
      pwm.auto_skip_duration,
      pwm.favorited_by_current_user,
      10 + ts_rank_cd(p.search_vector, tsq.q, 4) AS rank
    FROM posts_with_meta pwm
    JOIN posts p ON p.id = pwm.id, tsq
    WHERE pwm.is_draft = false
      AND p.search_vector @@ tsq.q
  ),

  -- Trigram results: fuzzy title match for queries >= 4 chars, FTS hits excluded
  trgm AS (
    SELECT
      pwm.id,
      pwm.profile_id,
      pwm.title,
      pwm.description,
      pwm.expression,
      pwm.sample_rate,
      pwm.mode::text,
      pwm.is_draft,
      pwm.is_fork,
      pwm.created_at,
      pwm.updated_at,
      pwm.published_at,
      pwm.fork_of_post_id,
      pwm.author_username,
      pwm.origin_title,
      pwm.origin_username,
      pwm.favorites_count,
      pwm.comments_count,
      pwm.is_weekly_winner,
      pwm.license::text,
      pwm.auto_skip_duration,
      pwm.favorited_by_current_user,
      (1 + word_similarity(unaccent(query), unaccent(pwm.title)))::float8 AS rank
    FROM posts_with_meta pwm
    WHERE pwm.is_draft = false
      AND pwm.title IS NOT NULL
      AND length(trim(query)) >= 4
      AND unaccent(query) <% unaccent(pwm.title)                         -- uses GIN trigram index
      AND word_similarity(unaccent(query), unaccent(pwm.title)) >= 0.4   -- precision filter
      AND NOT EXISTS (SELECT 1 FROM fts WHERE fts.id = pwm.id)
  )

  SELECT
    c.id, c.profile_id, c.title, c.description, c.expression,
    c.sample_rate, c.mode, c.is_draft, c.is_fork,
    c.created_at, c.updated_at, c.published_at,
    c.fork_of_post_id, c.author_username, c.origin_title, c.origin_username,
    c.favorites_count, c.comments_count,
    c.is_weekly_winner, c.license, c.auto_skip_duration,
    c.favorited_by_current_user,
    c.rank
  FROM (
    SELECT * FROM fts
    UNION ALL
    SELECT * FROM trgm
  ) c
  ORDER BY c.rank DESC
  LIMIT page_size OFFSET page * page_size;
$$;
