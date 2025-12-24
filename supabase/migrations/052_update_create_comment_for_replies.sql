-- Update create_comment function to support reply_to_comment_id

BEGIN;

-- Drop the old function (try both signatures to be safe)
DROP FUNCTION IF EXISTS public.create_comment(uuid, text);
DROP FUNCTION IF EXISTS public.create_comment(uuid, text, uuid);

-- Recreate with reply_to_comment_id parameter
CREATE OR REPLACE FUNCTION public.create_comment(
  p_post_id uuid,
  p_content text,
  p_reply_to_comment_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
  v_comment_id uuid;
  v_count_minute int;
  v_count_hour int;
  v_count_thread int;
  v_mention_ids uuid[];
  v_mention_count int;
  v_mention_notif_hour int;
  v_mention_notif_day int;
  v_notif_hour int;
  v_post_owner uuid;
  v_mentioned_user_id uuid;
  v_recent_exists boolean;
BEGIN
  -- Get current user
  v_author_id := auth.uid();
  IF v_author_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Validate content length
  IF p_content IS NULL OR char_length(trim(p_content)) = 0 THEN
    RETURN json_build_object('error', 'Comment cannot be empty');
  END IF;
  
  IF char_length(p_content) > 256 THEN
    RETURN json_build_object('error', 'Comment is too long');
  END IF;

  -- Validate post exists and is not a draft
  IF NOT EXISTS (
    SELECT 1 FROM public.posts 
    WHERE id = p_post_id AND is_draft = false
  ) THEN
    RETURN json_build_object('error', 'Post not found');
  END IF;

  -- Validate reply_to_comment_id if provided
  IF p_reply_to_comment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.comments
      WHERE id = p_reply_to_comment_id 
        AND post_id = p_post_id
        AND deleted_at IS NULL
    ) THEN
      RETURN json_build_object('error', 'Reply target comment not found');
    END IF;
  END IF;

  -- ============================================
  -- Rate limit checks
  -- ============================================

  -- Check: 5 comments / minute / user
  SELECT count(*) INTO v_count_minute
  FROM public.comments
  WHERE author_id = v_author_id
    AND created_at >= now() - interval '1 minute';
  
  IF v_count_minute >= 5 THEN
    RETURN json_build_object('error', 'You''re commenting too fast - take a short break');
  END IF;

  -- Check: 30 comments / hour / user
  SELECT count(*) INTO v_count_hour
  FROM public.comments
  WHERE author_id = v_author_id
    AND created_at >= now() - interval '1 hour';
  
  IF v_count_hour >= 30 THEN
    RETURN json_build_object('error', 'You''re commenting too fast - take a short break');
  END IF;

  -- Check: 3 comments in 60 seconds on same post (thread spam)
  SELECT count(*) INTO v_count_thread
  FROM public.comments
  WHERE author_id = v_author_id
    AND post_id = p_post_id
    AND created_at >= now() - interval '60 seconds';
  
  IF v_count_thread >= 3 THEN
    RETURN json_build_object('error', 'Let others reply before continuing');
  END IF;

  -- ============================================
  -- Mention validation
  -- ============================================
  v_mention_ids := public.extract_mention_ids(COALESCE(p_content, ''));
  v_mention_count := COALESCE(array_length(v_mention_ids, 1), 0);

  -- Check: Max 5 unique mentions per comment
  IF v_mention_count > 5 THEN
    RETURN json_build_object('error', 'Too many mentions - maximum 5 per comment');
  END IF;

  -- ============================================
  -- Insert the comment
  -- ============================================
  INSERT INTO public.comments (post_id, author_id, content, reply_to_comment_id)
  VALUES (p_post_id, v_author_id, p_content, p_reply_to_comment_id)
  RETURNING id INTO v_comment_id;

  -- ============================================
  -- Handle notifications with rate limiting
  -- ============================================

  -- Get post owner
  SELECT profile_id INTO v_post_owner
  FROM public.posts
  WHERE id = p_post_id;

  -- Count notifications emitted by this user in the last hour
  SELECT count(*) INTO v_notif_hour
  FROM public.notifications
  WHERE actor_id = v_author_id
    AND created_at >= now() - interval '1 hour';

  -- 1. Notify post owner (if not self-comment and under rate limit)
  IF v_post_owner IS NOT NULL 
     AND v_post_owner <> v_author_id 
     AND v_notif_hour < 20 THEN
    
    -- De-dup within 1 hour per (post_owner, commenter, post)
    SELECT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = v_post_owner
        AND n.actor_id = v_author_id
        AND n.event_type = 'comment'
        AND n.post_id = p_post_id
        AND n.created_at >= now() - interval '1 hour'
    ) INTO v_recent_exists;

    IF NOT v_recent_exists THEN
      INSERT INTO public.notifications (user_id, actor_id, event_type, post_id)
      VALUES (v_post_owner, v_author_id, 'comment', p_post_id);
      
      v_notif_hour := v_notif_hour + 1;
    END IF;
  END IF;

  -- 2. Notify mentioned users (with rate limiting)
  IF v_mention_count > 0 THEN
    -- Count mention notifications sent by this user
    SELECT count(*) INTO v_mention_notif_hour
    FROM public.notifications
    WHERE actor_id = v_author_id
      AND event_type = 'comment_mention'
      AND created_at >= now() - interval '1 hour';

    SELECT count(*) INTO v_mention_notif_day
    FROM public.notifications
    WHERE actor_id = v_author_id
      AND event_type = 'comment_mention'
      AND created_at >= now() - interval '1 day';

    FOREACH v_mentioned_user_id IN ARRAY v_mention_ids
    LOOP
      -- Skip if over notification rate limits
      IF v_notif_hour >= 20 THEN
        EXIT;
      END IF;

      IF v_mention_notif_hour >= 10 THEN
        EXIT;
      END IF;

      IF v_mention_notif_day >= 50 THEN
        EXIT;
      END IF;

      -- Skip self-mentions
      IF v_mentioned_user_id = v_author_id THEN
        CONTINUE;
      END IF;

      -- De-dup within 1 hour per (mentioned_user, commenter, post)
      SELECT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = v_mentioned_user_id
          AND n.actor_id = v_author_id
          AND n.event_type = 'comment_mention'
          AND n.post_id = p_post_id
          AND n.created_at >= now() - interval '1 hour'
      ) INTO v_recent_exists;

      IF NOT v_recent_exists THEN
        INSERT INTO public.notifications (user_id, actor_id, event_type, post_id)
        VALUES (v_mentioned_user_id, v_author_id, 'comment_mention', p_post_id);
        
        v_notif_hour := v_notif_hour + 1;
        v_mention_notif_hour := v_mention_notif_hour + 1;
        v_mention_notif_day := v_mention_notif_day + 1;
      END IF;
    END LOOP;
  END IF;

  -- ============================================
  -- Return the created comment
  -- ============================================
  RETURN json_build_object(
    'id', v_comment_id,
    'content', p_content,
    'created_at', now(),
    'author_id', v_author_id,
    'reply_to_comment_id', p_reply_to_comment_id
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_comment(uuid, text, uuid) TO authenticated;

COMMIT;
