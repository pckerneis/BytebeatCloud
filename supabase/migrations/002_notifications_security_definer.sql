CREATE OR REPLACE FUNCTION public.notify_favorite()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  post_owner    uuid;
  recent_exists boolean;
BEGIN
  SELECT profile_id INTO post_owner
  FROM public.posts
  WHERE id = NEW.post_id;

  IF post_owner IS NULL OR post_owner = NEW.profile_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id    = post_owner
      AND n.actor_id   = NEW.profile_id
      AND n.event_type = 'favorite'
      AND n.post_id    = NEW.post_id
      AND n.created_at >= now() - interval '1 hour'
  ) INTO recent_exists;

  IF recent_exists THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, actor_id, event_type, post_id)
  VALUES (post_owner, NEW.profile_id, 'favorite', NEW.post_id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_follow()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  recent_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id    = NEW.followed_id
      AND n.actor_id   = NEW.follower_id
      AND n.event_type = 'follow'
      AND n.post_id IS NULL
      AND n.created_at >= now() - interval '1 day'
  ) INTO recent_exists;

  IF recent_exists THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, actor_id, event_type)
  VALUES (NEW.followed_id, NEW.follower_id, 'follow');

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_fork()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  origin_owner  uuid;
  recent_exists boolean;
BEGIN
  IF NEW.is_fork IS DISTINCT FROM true OR NEW.fork_of_post_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT profile_id INTO origin_owner
  FROM public.posts
  WHERE id = NEW.fork_of_post_id;

  IF origin_owner IS NULL OR origin_owner = NEW.profile_id THEN
    RETURN NEW;
  END IF;

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
