-- ============================================
-- Mention notifications trigger
-- ============================================
-- Mentions are stored as @[userId] format in post descriptions.
-- When a post is created or updated with mentions, 
-- notifications are sent to mentioned users.

-- Function to extract mentioned user IDs from text (stored format: @[uuid])
CREATE OR REPLACE FUNCTION public.extract_mention_ids(text_content text)
RETURNS uuid[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  mention_ids uuid[];
  match_record record;
BEGIN
  mention_ids := ARRAY[]::uuid[];
  
  -- Match @[uuid] where uuid is a valid UUID format
  FOR match_record IN
    SELECT (regexp_matches(text_content, '@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]', 'gi'))[1]::uuid AS user_id
  LOOP
    -- Add to array if not already present
    IF NOT (match_record.user_id = ANY(mention_ids)) THEN
      mention_ids := array_append(mention_ids, match_record.user_id);
    END IF;
  END LOOP;
  
  RETURN mention_ids;
END;
$$;

-- Trigger function for mention notifications on INSERT
CREATE OR REPLACE FUNCTION public.notify_mentions_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  mentioned_user_ids uuid[];
  mentioned_user_id uuid;
  recent_exists boolean;
BEGIN
  -- Skip drafts
  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

  -- Extract mention IDs from description
  mentioned_user_ids := public.extract_mention_ids(COALESCE(NEW.description, ''));
  
  -- No mentions found
  IF array_length(mentioned_user_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- For each mentioned user ID, create a notification
  FOREACH mentioned_user_id IN ARRAY mentioned_user_ids
  LOOP
    -- Skip self-mentions
    IF mentioned_user_id = NEW.profile_id THEN
      CONTINUE;
    END IF;

    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = mentioned_user_id) THEN
      CONTINUE;
    END IF;

    -- De-dup within 1 hour per (mentioned_user, actor, post)
    SELECT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id    = mentioned_user_id
        AND n.actor_id   = NEW.profile_id
        AND n.event_type = 'mention'
        AND n.post_id    = NEW.id
        AND n.created_at >= now() - interval '1 hour'
    ) INTO recent_exists;

    IF recent_exists THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, actor_id, event_type, post_id)
    VALUES (mentioned_user_id, NEW.profile_id, 'mention', NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger function for mention notifications on UPDATE
CREATE OR REPLACE FUNCTION public.notify_mentions_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_mention_ids uuid[];
  new_mention_ids uuid[];
  new_mention_id uuid;
  recent_exists boolean;
BEGIN
  -- Skip if still a draft
  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

  -- Extract mention IDs from old and new descriptions
  old_mention_ids := public.extract_mention_ids(COALESCE(OLD.description, ''));
  new_mention_ids := public.extract_mention_ids(COALESCE(NEW.description, ''));

  -- Find newly added mentions (in new but not in old)
  FOREACH new_mention_id IN ARRAY new_mention_ids
  LOOP
    -- Skip if this mention existed before
    IF new_mention_id = ANY(old_mention_ids) THEN
      CONTINUE;
    END IF;

    -- Skip self-mentions
    IF new_mention_id = NEW.profile_id THEN
      CONTINUE;
    END IF;

    -- Verify user exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = new_mention_id) THEN
      CONTINUE;
    END IF;

    -- De-dup within 1 hour
    SELECT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id    = new_mention_id
        AND n.actor_id   = NEW.profile_id
        AND n.event_type = 'mention'
        AND n.post_id    = NEW.id
        AND n.created_at >= now() - interval '1 hour'
    ) INTO recent_exists;

    IF recent_exists THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, actor_id, event_type, post_id)
    VALUES (new_mention_id, NEW.profile_id, 'mention', NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;

-- Attach triggers
DROP TRIGGER IF EXISTS trg_notify_mentions_insert ON public.posts;
CREATE TRIGGER trg_notify_mentions_insert
AFTER INSERT ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.notify_mentions_insert();

DROP TRIGGER IF EXISTS trg_notify_mentions_update ON public.posts;
CREATE TRIGGER trg_notify_mentions_update
AFTER UPDATE OF description, is_draft ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.notify_mentions_update();
