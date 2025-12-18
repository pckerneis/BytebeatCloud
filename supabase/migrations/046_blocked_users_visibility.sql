-- Allow users to see blocks where they are the blocked party
-- This is needed so the profiles RLS policy can check if the viewer is blocked
-- by the profile owner when doing the NOT EXISTS subquery

BEGIN;

-- Users can also see blocks where they are the blocked party
-- This enables the profiles RLS to correctly hide profiles from blocked users
CREATE POLICY "select blocks where blocked" ON public.blocked_users
  FOR SELECT
  USING (blocked_id = auth.uid());

COMMIT;
