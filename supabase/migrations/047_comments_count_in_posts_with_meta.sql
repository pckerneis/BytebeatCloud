-- Add comments_count to posts_with_meta view
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
  p.license,
  p.published_at,
  coalesce(cmt.count, 0) AS comments_count
FROM posts p
  LEFT JOIN profiles author ON author.id = p.profile_id
  LEFT JOIN posts origin ON origin.id = p.fork_of_post_id
  LEFT JOIN profiles origin_author ON origin_author.id = origin.profile_id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS count
    FROM favorites f
    WHERE f.post_id = p.id
  ) fav ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS count
    FROM comments c
    WHERE c.post_id = p.id AND c.deleted_at IS NULL
  ) cmt ON true;
