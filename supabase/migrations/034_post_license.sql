-- Add license column to posts table with default value of 'cc-by'
ALTER TABLE posts
ADD COLUMN license TEXT NOT NULL DEFAULT 'cc-by';

-- Add check constraint to ensure only valid license values
ALTER TABLE posts
ADD CONSTRAINT posts_license_check CHECK (
  license IN ('all-rights-reserved', 'cc-by', 'cc0', 'cc-by-sa')
);

-- Update posts_with_meta view to include license column
CREATE OR REPLACE VIEW public.posts_with_meta WITH (security_invoker = on) AS
SELECT
  p.id,
  p.profile_id,
  p.title,
  p.expression,
  p.sample_rate,
  p.mode,
  p.is_draft,
  p.created_at,
  p.updated_at,
  p.fork_of_post_id,
  author.username        AS author_username,
  origin.title           AS origin_title,
  origin_author.username AS origin_username,
  coalesce(fav.count, 0) AS favorites_count,
  p.is_fork,
  p.description,
  EXISTS (
    SELECT 1
    FROM weekly_challenges wc
    WHERE wc.winner_post_id = p.id
  ) AS is_weekly_winner,
  p.license
FROM posts p
  LEFT JOIN profiles author ON author.id = p.profile_id
  LEFT JOIN posts origin ON origin.id = p.fork_of_post_id
  LEFT JOIN profiles origin_author ON origin_author.id = origin.profile_id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS count
    FROM favorites f
    WHERE f.post_id = p.id
  ) fav ON true;
