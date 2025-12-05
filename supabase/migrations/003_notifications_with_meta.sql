-- ============================================
-- Notifications view with actor username & post title
-- ============================================

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
  ON posts.id = n.post_id;

-- Optional: explicit grants (RLS still enforced via underlying tables)
GRANT SELECT ON public.notifications_with_meta TO anon, authenticated, service_role;