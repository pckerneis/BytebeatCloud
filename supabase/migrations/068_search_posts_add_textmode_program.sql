-- Add textmode_program to search_posts results (mirrors auto_skip_duration handling)

DROP FUNCTION IF EXISTS public.search_posts(text, integer, integer);

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
  textmode_program jsonb,
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
      pwm.textmode_program,
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
      pwm.textmode_program,
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
    c.textmode_program,
    c.rank
  FROM (
    SELECT * FROM fts
    UNION ALL
    SELECT * FROM trgm
  ) c
  ORDER BY c.rank DESC
  LIMIT page_size OFFSET page * page_size;
$$;
