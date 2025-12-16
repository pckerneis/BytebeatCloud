-- Create a table to store comment reports
-- A user can only report a comment once (unique constraint)

BEGIN;

CREATE TABLE IF NOT EXISTS public.comment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'under_review', 'action_taken', 'closed_no_action')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_reports_unique UNIQUE (reporter_id, comment_id)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS comment_reports_reporter_idx ON public.comment_reports (reporter_id);
CREATE INDEX IF NOT EXISTS comment_reports_comment_idx ON public.comment_reports (comment_id);

-- Enable Row Level Security
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

-- Policies
-- A user can see their own reports
CREATE POLICY "select own comment reports" ON public.comment_reports
  FOR SELECT
  USING (reporter_id = auth.uid());

-- A user can create reports only for themselves as reporter
CREATE POLICY "insert own comment reports" ON public.comment_reports
  FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

-- No updates or deletes allowed by users - reports are immutable once created
-- Status updates are done by service_role (moderators)

-- Grant permissions
GRANT ALL ON TABLE public.comment_reports TO authenticated;
GRANT ALL ON TABLE public.comment_reports TO service_role;

-- ============================================
-- Comment report notes table for immutable timestamped notes
-- ============================================

CREATE TABLE IF NOT EXISTS public.comment_report_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.comment_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comment_report_notes_report_idx ON public.comment_report_notes (report_id);

ALTER TABLE public.comment_report_notes ENABLE ROW LEVEL SECURITY;

-- Users can see notes on their own reports
CREATE POLICY "select notes on own comment reports" ON public.comment_report_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comment_reports r
      WHERE r.id = comment_report_notes.report_id
        AND r.reporter_id = auth.uid()
    )
  );

-- Users can add notes to their own reports
CREATE POLICY "insert notes on own comment reports" ON public.comment_report_notes
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.comment_reports r
      WHERE r.id = comment_report_notes.report_id
        AND r.reporter_id = auth.uid()
    )
  );

-- Notes are immutable - no updates or deletes

GRANT ALL ON TABLE public.comment_report_notes TO authenticated;
GRANT ALL ON TABLE public.comment_report_notes TO service_role;

COMMIT;
