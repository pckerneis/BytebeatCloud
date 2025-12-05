-- Only notify on forks when the forked post is published

CREATE OR REPLACE FUNCTION public.notify_fork()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  origin_owner  uuid;
  recent_exists boolean;
  should_notify boolean := false;
BEGIN
  -- Only for rows that are marked as forks and have a source post
  IF NEW.is_fork IS DISTINCT FROM true OR NEW.fork_of_post_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Decide when to notify:
  --  - INSERT of a fork that is already published (is_draft = false)
  --  - UPDATE where a fork transitions from draft -> published
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_draft = false THEN
      should_notify := true;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- OLD is only available on UPDATE
    IF OLD.is_draft = true AND NEW.is_draft = false THEN
      should_notify := true;
    END IF;
  END IF;

  IF NOT should_notify THEN
    RETURN NEW;
  END IF;

  -- find origin post owner
  SELECT profile_id INTO origin_owner
  FROM public.posts
  WHERE id = NEW.fork_of_post_id;

  -- no owner or self-fork
  IF origin_owner IS NULL OR origin_owner = NEW.profile_id THEN
    RETURN NEW;
  END IF;

  -- de-dup within 1 day per (origin_owner, forker, origin_post)
  SELECT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id    = origin_owner
      AND n.actor_id   = NEW.profile_id
      AND n.event_type = 'fork'
      AND n.post_id    = NEW.fork_of_post_id
      AND n.created_at >= now() - interval '1 day'
  ) INTO recent_exists;

  IF recent_exists THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, actor_id, event_type, post_id)
  VALUES (origin_owner, NEW.profile_id, 'fork', NEW.fork_of_post_id);

  RETURN NEW;
END;
$$;

-- Update trigger to also fire on UPDATE so publishing a draft fork can notify
DROP TRIGGER IF EXISTS trg_notify_fork ON public.posts;

CREATE TRIGGER trg_notify_fork
AFTER INSERT OR UPDATE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.notify_fork();
