-- Fix: drafts were readable by anyone via direct API access (e.g. querying
-- posts_with_meta or posts with is_draft=eq.true), because the posts SELECT
-- policy never checked is_draft. Application code always filtered drafts out
-- explicitly, but that filter is not enforced by RLS itself.
--
-- Drafts should only be visible to their author.

BEGIN;

DROP POLICY IF EXISTS "Anyone can read posts except blocked" ON public.posts;

CREATE POLICY "Anyone can read posts except blocked" ON public.posts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = posts.profile_id
    )
    AND (
      -- Drafts are only visible to their author
      posts.is_draft = false
      OR posts.profile_id = auth.uid()
    )
    AND (
      -- Anonymous users can see all (non-draft) posts
      auth.uid() IS NULL
      OR
      -- Authenticated users can see posts if no block relationship exists
      NOT EXISTS (
        SELECT 1
        FROM public.blocked_users bu
        WHERE
          -- The viewer blocked the post author
          (bu.blocker_id = auth.uid() AND bu.blocked_id = posts.profile_id)
          OR
          -- The post author blocked the viewer
          (bu.blocker_id = posts.profile_id AND bu.blocked_id = auth.uid())
      )
    )
  );

COMMIT;
