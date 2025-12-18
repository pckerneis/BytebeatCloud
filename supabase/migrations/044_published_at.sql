-- Add published_at column to track when a post was first made public
-- Once set, the license becomes immutable to protect users who may already be using the work

ALTER TABLE posts
ADD COLUMN published_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Backfill: set published_at for existing public posts to their created_at date
UPDATE posts
SET published_at = created_at
WHERE is_draft = false AND published_at IS NULL;

-- Create trigger function to set published_at on first publish
CREATE OR REPLACE FUNCTION set_published_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If transitioning from draft to public and published_at is not set
  IF OLD.is_draft = true AND NEW.is_draft = false AND NEW.published_at IS NULL THEN
    NEW.published_at := NOW();
  END IF;
  
  -- If post was already published (published_at is set), prevent license changes
  IF OLD.published_at IS NOT NULL AND NEW.license IS DISTINCT FROM OLD.license THEN
    RAISE EXCEPTION 'Cannot change license after post has been published';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_set_published_at ON posts;
CREATE TRIGGER trigger_set_published_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION set_published_at();

-- Also handle the case where a post is created as public (not draft)
CREATE OR REPLACE FUNCTION set_published_at_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_draft = false AND NEW.published_at IS NULL THEN
    NEW.published_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_published_at_on_insert ON posts;
CREATE TRIGGER trigger_set_published_at_on_insert
  BEFORE INSERT ON posts
  FOR EACH ROW
  EXECUTE FUNCTION set_published_at_on_insert();

-- Update posts_with_meta view to include published_at column
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
  p.published_at
FROM posts p
  LEFT JOIN profiles author ON author.id = p.profile_id
  LEFT JOIN posts origin ON origin.id = p.fork_of_post_id
  LEFT JOIN profiles origin_author ON origin_author.id = origin.profile_id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS count
    FROM favorites f
    WHERE f.post_id = p.id
  ) fav ON true;
