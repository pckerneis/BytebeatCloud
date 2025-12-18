-- Add soft delete support for comments
-- Also allow post owners to delete comments on their posts

BEGIN;

-- Add deleted_at column for soft delete
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Create index for filtering non-deleted comments
CREATE INDEX IF NOT EXISTS comments_deleted_at_idx ON public.comments (deleted_at) WHERE deleted_at IS NULL;

-- Drop existing policies
DROP POLICY IF EXISTS "delete own comments" ON public.comments;
DROP POLICY IF EXISTS "soft delete comments" ON public.comments;

-- Create update policy for soft delete (comment author or post owner can soft-delete)
CREATE POLICY "soft delete comments" ON public.comments
  FOR UPDATE
  USING (
    -- Comment author can soft-delete their own comments
    author_id = auth.uid()
    OR
    -- Post owner can soft-delete comments on their posts
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id
        AND p.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Must be authorized (same as USING) AND setting deleted_at
    (
      author_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = comments.post_id
          AND p.profile_id = auth.uid()
      )
    )
    AND deleted_at IS NOT NULL
  );

-- Update read policy to exclude soft-deleted comments (for general reads)
DROP POLICY IF EXISTS "read comments" ON public.comments;
CREATE POLICY "read comments" ON public.comments
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id
        AND p.is_draft = false
    )
  );

-- Allow comment authors and post owners to SELECT their comments for updates
-- This is needed because UPDATE requires SELECT permission first
CREATE POLICY "select for update comments" ON public.comments
  FOR SELECT
  USING (
    author_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id
        AND p.profile_id = auth.uid()
    )
  );

COMMIT;
