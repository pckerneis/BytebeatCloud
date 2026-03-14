CREATE OR REPLACE FUNCTION get_random_posts(count int DEFAULT 20)
RETURNS SETOF posts_with_meta
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM posts_with_meta
  WHERE is_draft = false
  ORDER BY random()
  LIMIT count;
$$;
