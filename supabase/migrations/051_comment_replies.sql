-- Add reply_to_comment_id column to comments table

BEGIN;

-- Add the reply_to_comment_id column
ALTER TABLE public.comments
  ADD COLUMN reply_to_comment_id uuid REFERENCES public.comments(id) ON DELETE SET NULL;

-- Add index for efficient lookups of replies
CREATE INDEX IF NOT EXISTS comments_reply_to_idx ON public.comments (reply_to_comment_id);

COMMIT;
