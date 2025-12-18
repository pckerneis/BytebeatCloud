-- Create a table to store post comments

BEGIN;

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 256),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS comments_post_idx ON public.comments (post_id);
CREATE INDEX IF NOT EXISTS comments_author_idx ON public.comments (author_id);

-- Enable Row Level Security
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments on non-draft posts
CREATE POLICY "read comments" ON public.comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id
        AND p.is_draft = false
    )
  );

-- Authenticated users can create comments
CREATE POLICY "insert own comments" ON public.comments
  FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- Users can delete their own comments
CREATE POLICY "delete own comments" ON public.comments
  FOR DELETE
  USING (author_id = auth.uid());

-- No updates - comments are immutable once created

-- Grant permissions
GRANT ALL ON TABLE public.comments TO authenticated;
GRANT ALL ON TABLE public.comments TO service_role;
GRANT SELECT ON TABLE public.comments TO anon;

COMMIT;
