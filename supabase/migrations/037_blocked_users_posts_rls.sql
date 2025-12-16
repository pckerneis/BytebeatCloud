-- Update RLS policies to filter out blocked users
-- Blocked users cannot see each other's posts (bidirectional)
-- Blocked users cannot see profile of users who blocked them

BEGIN;

-- ============================================
-- POSTS: Update read policy
-- ============================================

-- Drop the existing permissive read policy
DROP POLICY IF EXISTS "Anyone can read posts" ON public.posts;

-- Create new read policy that respects block relationships
-- A post is visible if:
--   1. The viewer is not authenticated (anon can see all posts from users with profiles), OR
--   2. The viewer is authenticated AND there is no block relationship in either direction
CREATE POLICY "Anyone can read posts except blocked" ON public.posts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = posts.profile_id
    )
    AND (
      -- Anonymous users can see all posts
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

-- ============================================
-- PROFILES: Update read policy
-- ============================================

-- Drop the existing permissive read policy
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;

-- Create new read policy that hides profiles from users who were blocked
-- A profile is visible if:
--   1. The viewer is not authenticated (anon can see all profiles), OR
--   2. The viewer is authenticated AND the profile owner has not blocked them
CREATE POLICY "Anyone can read profiles except if blocked" ON public.profiles
  FOR SELECT
  USING (
    -- Anonymous users can see all profiles
    auth.uid() IS NULL
    OR
    -- Authenticated users can see profiles if they were not blocked by the profile owner
    NOT EXISTS (
      SELECT 1
      FROM public.blocked_users bu
      WHERE bu.blocker_id = profiles.id
        AND bu.blocked_id = auth.uid()
    )
  );

COMMIT;
