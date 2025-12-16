-- ============================================
-- Update mention notifications to also check title
-- ============================================
-- Mentions can now appear in both title and description.
-- This migration updates the trigger functions to combine
-- title and description when extracting mentions.

-- Update INSERT trigger to check both title and description
CREATE OR REPLACE FUNCTION public.notify_mentions_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  mentioned_user_ids uuid[];
  mentioned_user_id uuid;
  recent_exists boolean;
  combined_text text;
BEGIN
  -- Skip drafts
  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

  -- Combine title and description for mention extraction
  combined_text := COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.description, '');

  -- Extract mention IDs from combined text
  mentioned_user_ids := public.extract_mention_ids(combined_text);
  
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

-- Update UPDATE trigger to check both title and description
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
  old_combined_text text;
  new_combined_text text;
BEGIN
  -- Skip if still a draft
  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

  -- Combine title and description for mention extraction
  old_combined_text := COALESCE(OLD.title, '') || ' ' || COALESCE(OLD.description, '');
  new_combined_text := COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.description, '');

  -- Extract mention IDs from old and new combined text
  old_mention_ids := public.extract_mention_ids(old_combined_text);
  new_mention_ids := public.extract_mention_ids(new_combined_text);

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

-- Update the trigger to also fire on title changes
DROP TRIGGER IF EXISTS trg_notify_mentions_update ON public.posts;
CREATE TRIGGER trg_notify_mentions_update
AFTER UPDATE OF title, description, is_draft ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.notify_mentions_update();
