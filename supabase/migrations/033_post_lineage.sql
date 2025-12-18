-- Function to get the complete lineage (ancestors and descendants) of a post
-- Returns all posts in the lineage tree with their relationship info

CREATE OR REPLACE FUNCTION get_post_lineage(target_post_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  author_username text,
  fork_of_post_id uuid,
  is_ancestor boolean,
  depth integer
)
LANGUAGE sql
STABLE
AS $$
  -- Get ancestors (posts this one descends from)
  WITH RECURSIVE ancestors AS (
    -- Start with the target post's parent
    SELECT 
      p.id,
      p.title,
      pr.username as author_username,
      p.fork_of_post_id,
      true as is_ancestor,
      1 as depth
    FROM posts p
    LEFT JOIN profiles pr ON p.profile_id = pr.id
    WHERE p.id = (
      SELECT fork_of_post_id FROM posts WHERE id = target_post_id
    )
    AND p.is_draft = false
    
    UNION ALL
    
    -- Recursively get parent's parent
    SELECT 
      p.id,
      p.title,
      pr.username as author_username,
      p.fork_of_post_id,
      true as is_ancestor,
      a.depth + 1
    FROM posts p
    LEFT JOIN profiles pr ON p.profile_id = pr.id
    INNER JOIN ancestors a ON p.id = a.fork_of_post_id
    WHERE p.is_draft = false
  ),
  
  -- Get descendants (posts forked from this one, recursively)
  descendants AS (
    -- Start with direct forks of the target post
    SELECT 
      p.id,
      p.title,
      pr.username as author_username,
      p.fork_of_post_id,
      false as is_ancestor,
      1 as depth
    FROM posts p
    LEFT JOIN profiles pr ON p.profile_id = pr.id
    WHERE p.fork_of_post_id = target_post_id
    AND p.is_draft = false
    
    UNION ALL
    
    -- Recursively get forks of forks
    SELECT 
      p.id,
      p.title,
      pr.username as author_username,
      p.fork_of_post_id,
      false as is_ancestor,
      d.depth + 1
    FROM posts p
    LEFT JOIN profiles pr ON p.profile_id = pr.id
    INNER JOIN descendants d ON p.fork_of_post_id = d.id
    WHERE p.is_draft = false
  )
  
  -- Combine ancestors and descendants
  SELECT * FROM ancestors
  UNION ALL
  SELECT * FROM descendants;
$$;
