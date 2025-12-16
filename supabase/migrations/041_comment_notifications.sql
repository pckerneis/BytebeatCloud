-- ============================================
-- Comment notifications trigger
-- ============================================
-- When a comment is created:
-- 1. Notify the post author (event_type = 'comment')
-- 2. Notify mentioned users (event_type = 'comment_mention'), excluding post author

-- Trigger function for comment notifications
CREATE OR REPLACE FUNCTION public.notify_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  post_owner uuid;
  mentioned_user_ids uuid[];
  mentioned_user_id uuid;
  recent_exists boolean;
BEGIN
  -- Get post owner
  SELECT profile_id INTO post_owner
  FROM public.posts
  WHERE id = NEW.post_id;

  IF post_owner IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Notify post owner (if not self-comment)
  IF post_owner <> NEW.author_id THEN
    -- De-dup within 1 hour per (post_owner, commenter, post)
    SELECT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id    = post_owner
        AND n.actor_id   = NEW.author_id
        AND n.event_type = 'comment'
        AND n.post_id    = NEW.post_id
        AND n.created_at >= now() - interval '1 hour'
    ) INTO recent_exists;

    IF NOT recent_exists THEN
      INSERT INTO public.notifications (user_id, actor_id, event_type, post_id)
      VALUES (post_owner, NEW.author_id, 'comment', NEW.post_id);
    END IF;
  END IF;

  -- 2. Notify mentioned users in comment content
  mentioned_user_ids := public.extract_mention_ids(COALESCE(NEW.content, ''));

  IF array_length(mentioned_user_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH mentioned_user_id IN ARRAY mentioned_user_ids
  LOOP
    -- Skip self-mentions
    IF mentioned_user_id = NEW.author_id THEN
      CONTINUE;
    END IF;

    -- Skip post owner (already notified via comment notification)
    IF mentioned_user_id = post_owner THEN
      CONTINUE;
    END IF;

    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = mentioned_user_id) THEN
      CONTINUE;
    END IF;

    -- De-dup within 1 hour per (mentioned_user, commenter, post)
    SELECT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id    = mentioned_user_id
        AND n.actor_id   = NEW.author_id
        AND n.event_type = 'comment_mention'
        AND n.post_id    = NEW.post_id
        AND n.created_at >= now() - interval '1 hour'
    ) INTO recent_exists;

    IF recent_exists THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, actor_id, event_type, post_id)
    VALUES (mentioned_user_id, NEW.author_id, 'comment_mention', NEW.post_id);
  END LOOP;

  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_notify_comment ON public.comments;
CREATE TRIGGER trg_notify_comment
AFTER INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_comment();
