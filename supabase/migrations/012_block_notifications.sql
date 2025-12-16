-- Hide notifications involving blocked users (both directions)
-- A blocks B => A should not see notifications where actor_id = B
-- B blocks A => A should not see notifications where actor_id = B
-- Recreate notifications_with_meta view with block-aware WHERE clause

BEGIN;

CREATE OR REPLACE VIEW public.notifications_with_meta
WITH (security_invoker = on) AS
SELECT
  n.id,
  n.user_id,
  n.actor_id,
  n.event_type,
  n.post_id,
  n.created_at,
  n.read,
  p.username AS actor_username,
  posts.title AS post_title
FROM public.notifications n
LEFT JOIN public.profiles p
  ON p.id = n.actor_id
LEFT JOIN public.posts posts
  ON posts.id = n.post_id
WHERE
  -- Exclude notifications from users I blocked
  NOT EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE b.blocker_id = auth.uid() AND b.blocked_id = n.actor_id
  )
  AND
  -- Exclude notifications from users who blocked me
  NOT EXISTS (
    SELECT 1 FROM public.blocked_users b2
    WHERE b2.blocker_id = n.actor_id AND b2.blocked_id = auth.uid()
  );

GRANT SELECT ON public.notifications_with_meta TO anon, authenticated, service_role;

COMMIT;
