-- Create a table to register user blocks (who blocks whom) with timestamp
-- Includes RLS to allow users to manage their own block relationships

BEGIN;

CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_users_pkey PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocked_users_no_self_block CHECK (blocker_id <> blocked_id)
);

-- Helpful indexes for lookups
CREATE INDEX IF NOT EXISTS blocked_users_blocker_idx ON public.blocked_users (blocker_id);
CREATE INDEX IF NOT EXISTS blocked_users_blocked_idx ON public.blocked_users (blocked_id);

-- Enable Row Level Security
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- Policies
-- A user can see the blocks they created
CREATE POLICY "select own blocks" ON public.blocked_users
  FOR SELECT
  USING (blocker_id = auth.uid());

-- A user can create blocks only for themselves as blocker
CREATE POLICY "insert own blocks" ON public.blocked_users
  FOR INSERT
  WITH CHECK (blocker_id = auth.uid());

-- A user can delete blocks that they created
CREATE POLICY "delete own blocks" ON public.blocked_users
  FOR DELETE
  USING (blocker_id = auth.uid());

-- No updates necessary; block relationship is immutable except deletion

COMMIT;
