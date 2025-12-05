-- ============================================
-- Rebuild notifications table & triggers
-- ============================================

-- 1) Drop existing triggers (if any)

DROP TRIGGER IF EXISTS trg_notify_favorite ON public.favorites;
DROP TRIGGER IF EXISTS trg_notify_follow   ON public.follows;
DROP TRIGGER IF EXISTS trg_notify_fork     ON public.posts;

-- 2) Drop existing functions (if any)

DROP FUNCTION IF EXISTS public.notify_favorite();
DROP FUNCTION IF EXISTS public.notify_favorite_v2();
DROP FUNCTION IF EXISTS public.notify_follow();
DROP FUNCTION IF EXISTS public.notify_follow_v2();
DROP FUNCTION IF EXISTS public.notify_fork();

-- 3) Drop and recreate notifications table

DROP TABLE IF EXISTS public.notifications CASCADE;

CREATE TABLE public.notifications (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid   NOT NULL,  -- recipient
  actor_id   uuid   NOT NULL,  -- who caused the event
  event_type text   NOT NULL,  -- 'favorite' | 'follow' | 'fork' | 'comment' | 'mention' | ...
  post_id    uuid,             -- optional, for post-related events
  created_at timestamptz NOT NULL DEFAULT now(),
  read       boolean    NOT NULL DEFAULT false
);

-- 4) Foreign keys

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES public.posts (id) ON DELETE CASCADE;

-- 5) Helpful indexes

CREATE INDEX idx_notifications_user_created_at
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX idx_notifications_user_read
  ON public.notifications (user_id, read, created_at DESC);

-- 6) RLS & policies

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- No direct client inserts; only triggers / server-side code may insert
DROP POLICY IF EXISTS "notifications_server_only_insert" ON public.notifications;
CREATE POLICY "notifications_server_only_insert"
  ON public.notifications
  FOR INSERT
  WITH CHECK (false);

-- Users can see only their own notifications
DROP POLICY IF EXISTS "users_see_their_own_notifications" ON public.notifications;
CREATE POLICY "users_see_their_own_notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- (Optional) allow clients to mark notifications as read
DROP POLICY IF EXISTS "users_mark_their_notifications_read" ON public.notifications;
CREATE POLICY "users_mark_their_notifications_read"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7) Grants (mirror your existing style)

GRANT ALL ON TABLE public.notifications TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.notifications_id_seq TO postgres, anon, authenticated, service_role;

-- ============================================
-- Trigger functions with time-window dedup
-- ============================================

-- FAVORITE notifications
CREATE OR REPLACE FUNCTION public.notify_favorite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  post_owner    uuid;
  recent_exists boolean;
BEGIN
  -- find post owner
  SELECT profile_id INTO post_owner
  FROM public.posts
  WHERE id = NEW.post_id;

  -- no owner or self-favorite
  IF post_owner IS NULL OR post_owner = NEW.profile_id THEN
    RETURN NEW;
  END IF;

  -- de-dup within 1 hour per (owner, actor, post)
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

-- FOLLOW notifications
CREATE OR REPLACE FUNCTION public.notify_follow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recent_exists boolean;
BEGIN
  -- de-dup within 1 day per (followed, follower)
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

-- FORK notifications
CREATE OR REPLACE FUNCTION public.notify_fork()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  origin_owner  uuid;
  recent_exists boolean;
BEGIN
  -- only for actual forks
  IF NEW.is_fork IS DISTINCT FROM true OR NEW.fork_of_post_id IS NULL THEN
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

-- ============================================
-- Attach triggers
-- ============================================

DROP TRIGGER IF EXISTS trg_notify_favorite ON public.favorites;
CREATE TRIGGER trg_notify_favorite
AFTER INSERT ON public.favorites
FOR EACH ROW
EXECUTE FUNCTION public.notify_favorite();

DROP TRIGGER IF EXISTS trg_notify_follow ON public.follows;
CREATE TRIGGER trg_notify_follow
AFTER INSERT ON public.follows
FOR EACH ROW
EXECUTE FUNCTION public.notify_follow();

DROP TRIGGER IF EXISTS trg_notify_fork ON public.posts;
CREATE TRIGGER trg_notify_fork
AFTER INSERT ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.notify_fork();