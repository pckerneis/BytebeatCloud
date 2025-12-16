-- Enforce two-sided blocking visibility on posts and profiles
-- A blocks B =>
--  - A cannot see B's posts
--  - B cannot see A's posts
--  - B cannot see A's profile
--  - A CAN still see B's profile (to manage unblock)

BEGIN;

-- POSTS: replace broad read policy with block-aware policy
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'posts' AND policyname = 'Anyone can read posts'
  ) THEN
    EXECUTE 'DROP POLICY "Anyone can read posts" ON public.posts';
  END IF;
END $$;

-- Readable posts are those where neither direction of block applies
CREATE POLICY "Readable posts excluding blocks" ON public.posts
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = posts.profile_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE b.blocker_id = auth.uid() AND b.blocked_id = posts.profile_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b2
      WHERE b2.blocker_id = posts.profile_id AND b2.blocked_id = auth.uid()
    )
  );

-- PROFILES: replace broad read policy with one that hides profiles that blocked the viewer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Enable read access for all users'
  ) THEN
    EXECUTE 'DROP POLICY "Enable read access for all users" ON public.profiles';
  END IF;
END $$;

-- Allow selecting profiles except those who blocked the current user.
-- Still allow selecting own profile.
CREATE POLICY "Readable profiles excluding those who blocked viewer" ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE b.blocker_id = profiles.id AND b.blocked_id = auth.uid()
    )
  );

COMMIT;
