-- ============================================
-- Mention notifications trigger
-- ============================================
-- Mentions use @username syntax in post descriptions.
-- When a post is created or updated with mentions, 
-- notifications are sent to mentioned users.

-- Function to extract mentioned usernames from text
CREATE OR REPLACE FUNCTION public.extract_mentions(text_content text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  mentions text[];
  match_record record;
BEGIN
  mentions := ARRAY[]::text[];
  
  -- Match @username where username is 1-30 alphanumeric/underscore chars
  FOR match_record IN
    SELECT (regexp_matches(text_content, '@([A-Za-z0-9_]{1,30})(?![A-Za-z0-9_])', 'g'))[1] AS username
  LOOP
    -- Add to array if not already present (case-insensitive dedup)
    IF NOT (lower(match_record.username) = ANY(SELECT lower(unnest(mentions)))) THEN
      mentions := array_append(mentions, match_record.username);
    END IF;
  END LOOP;
  
  RETURN mentions;
END;
$$;

-- Trigger function for mention notifications on INSERT
CREATE OR REPLACE FUNCTION public.notify_mentions_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  mentioned_usernames text[];
  mentioned_user record;
  recent_exists boolean;
BEGIN
  -- Skip drafts
  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

  -- Extract mentions from description
  mentioned_usernames := public.extract_mentions(COALESCE(NEW.description, ''));
  
  -- No mentions found
  IF array_length(mentioned_usernames, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- For each mentioned username, create a notification
  FOR mentioned_user IN
    SELECT id, username
    FROM public.profiles
    WHERE lower(username) = ANY(SELECT lower(unnest(mentioned_usernames)))
  LOOP
    -- Skip self-mentions
    IF mentioned_user.id = NEW.profile_id THEN
      CONTINUE;
    END IF;

    -- De-dup within 1 hour per (mentioned_user, actor, post)
    SELECT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id    = mentioned_user.id
        AND n.actor_id   = NEW.profile_id
        AND n.event_type = 'mention'
        AND n.post_id    = NEW.id
        AND n.created_at >= now() - interval '1 hour'
    ) INTO recent_exists;

    IF recent_exists THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, actor_id, event_type, post_id)
    VALUES (mentioned_user.id, NEW.profile_id, 'mention', NEW.id);
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
  old_mentions text[];
  new_mentions text[];
  new_mention text;
  mentioned_user record;
  recent_exists boolean;
BEGIN
  -- Skip if still a draft
  IF NEW.is_draft = true THEN
    RETURN NEW;
  END IF;

  -- Extract mentions from old and new descriptions
  old_mentions := public.extract_mentions(COALESCE(OLD.description, ''));
  new_mentions := public.extract_mentions(COALESCE(NEW.description, ''));

  -- Find newly added mentions (in new but not in old)
  FOREACH new_mention IN ARRAY new_mentions
  LOOP
    -- Skip if this mention existed before (case-insensitive)
    IF lower(new_mention) = ANY(SELECT lower(unnest(old_mentions))) THEN
      CONTINUE;
    END IF;

    -- Find the mentioned user
    SELECT id, username INTO mentioned_user
    FROM public.profiles
    WHERE lower(username) = lower(new_mention);

    IF mentioned_user.id IS NULL THEN
      CONTINUE;
    END IF;

    -- Skip self-mentions
    IF mentioned_user.id = NEW.profile_id THEN
      CONTINUE;
    END IF;

    -- De-dup within 1 hour
    SELECT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id    = mentioned_user.id
        AND n.actor_id   = NEW.profile_id
        AND n.event_type = 'mention'
        AND n.post_id    = NEW.id
        AND n.created_at >= now() - interval '1 hour'
    ) INTO recent_exists;

    IF recent_exists THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, actor_id, event_type, post_id)
    VALUES (mentioned_user.id, NEW.profile_id, 'mention', NEW.id);
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
