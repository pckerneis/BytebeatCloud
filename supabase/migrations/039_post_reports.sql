-- Create a table to store post reports
-- A user can only report a post once (unique constraint)

BEGIN;

CREATE TABLE IF NOT EXISTS public.post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'under_review', 'action_taken', 'closed_no_action')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_reports_unique UNIQUE (reporter_id, post_id)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS post_reports_reporter_idx ON public.post_reports (reporter_id);
CREATE INDEX IF NOT EXISTS post_reports_post_idx ON public.post_reports (post_id);

-- Enable Row Level Security
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

-- Policies
-- A user can see their own reports
CREATE POLICY "select own post reports" ON public.post_reports
  FOR SELECT
  USING (reporter_id = auth.uid());

-- A user can create reports only for themselves as reporter
CREATE POLICY "insert own post reports" ON public.post_reports
  FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

-- No updates or deletes allowed by users - reports are immutable once created
-- Status updates are done by service_role (moderators)

-- Grant permissions
GRANT ALL ON TABLE public.post_reports TO authenticated;
GRANT ALL ON TABLE public.post_reports TO service_role;

-- ============================================
-- Post report notes table for immutable timestamped notes
-- ============================================

CREATE TABLE IF NOT EXISTS public.post_report_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.post_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_report_notes_report_idx ON public.post_report_notes (report_id);

ALTER TABLE public.post_report_notes ENABLE ROW LEVEL SECURITY;

-- Users can see notes on their own reports
CREATE POLICY "select notes on own post reports" ON public.post_report_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.post_reports r
      WHERE r.id = post_report_notes.report_id
        AND r.reporter_id = auth.uid()
    )
  );

-- Users can add notes to their own reports
CREATE POLICY "insert notes on own post reports" ON public.post_report_notes
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.post_reports r
      WHERE r.id = post_report_notes.report_id
        AND r.reporter_id = auth.uid()
    )
  );

-- Notes are immutable - no updates or deletes

GRANT ALL ON TABLE public.post_report_notes TO authenticated;
GRANT ALL ON TABLE public.post_report_notes TO service_role;

COMMIT;
