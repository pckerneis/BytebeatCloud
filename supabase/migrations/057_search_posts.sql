-- Full-text search function for posts
-- Tokenized AND search, title weighted higher than description, with relevance scoring

-- GIN index for fast full-text search on posts table
CREATE INDEX IF NOT EXISTS idx_posts_fts
  ON public.posts
  USING GIN (
    (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B')
    )
  );

-- Search function: tokenized AND search with title/description weighting
CREATE OR REPLACE FUNCTION public.search_posts(
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
  title_headline text,
  description_headline text,
  rank float8
) LANGUAGE sql STABLE AS $$
  WITH tsq AS (
    SELECT websearch_to_tsquery('english', query) AS q
  )
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
    ts_headline(
      'english',
      coalesce(pwm.title, ''),
      tsq.q,
      'StartSel=<mark>, StopSel=</mark>, HighlightAll=true'
    ) AS title_headline,
    ts_headline(
      'english',
      coalesce(pwm.description, ''),
      tsq.q,
      'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=10, MaxFragments=2'
    ) AS description_headline,
    ts_rank_cd(
      setweight(to_tsvector('english', coalesce(pwm.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(pwm.description, '')), 'B'),
      tsq.q,
      4
    ) AS rank
  FROM posts_with_meta pwm, tsq
  WHERE pwm.is_draft = false
    AND (
      setweight(to_tsvector('english', coalesce(pwm.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(pwm.description, '')), 'B')
    ) @@ tsq.q
  ORDER BY rank DESC
  LIMIT page_size OFFSET page * page_size;
$$;
