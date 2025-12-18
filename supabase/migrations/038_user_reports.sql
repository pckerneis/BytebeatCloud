-- Create a table to store user reports
-- A user can only report another user once (unique constraint)

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'under_review', 'action_taken', 'closed_no_action')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_reports_no_self_report CHECK (reporter_id <> reported_id),
  CONSTRAINT user_reports_unique UNIQUE (reporter_id, reported_id)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS user_reports_reporter_idx ON public.user_reports (reporter_id);
CREATE INDEX IF NOT EXISTS user_reports_reported_idx ON public.user_reports (reported_id);

-- Enable Row Level Security
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Policies
-- A user can see their own reports
CREATE POLICY "select own reports" ON public.user_reports
  FOR SELECT
  USING (reporter_id = auth.uid());

-- A user can create reports only for themselves as reporter
CREATE POLICY "insert own reports" ON public.user_reports
  FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

-- No updates or deletes allowed by users - reports are immutable once created
-- Status updates are done by service_role (moderators)

-- Grant permissions
GRANT ALL ON TABLE public.user_reports TO authenticated;
GRANT ALL ON TABLE public.user_reports TO service_role;

-- ============================================
-- Report notes table for immutable timestamped notes
-- ============================================

CREATE TABLE IF NOT EXISTS public.report_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.user_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_notes_report_idx ON public.report_notes (report_id);

ALTER TABLE public.report_notes ENABLE ROW LEVEL SECURITY;

-- Users can see notes on their own reports
CREATE POLICY "select notes on own reports" ON public.report_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_reports r
      WHERE r.id = report_notes.report_id
        AND r.reporter_id = auth.uid()
    )
  );

-- Users can add notes to their own reports
CREATE POLICY "insert notes on own reports" ON public.report_notes
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_reports r
      WHERE r.id = report_notes.report_id
        AND r.reporter_id = auth.uid()
    )
  );

-- Notes are immutable - no updates or deletes

GRANT ALL ON TABLE public.report_notes TO authenticated;
GRANT ALL ON TABLE public.report_notes TO service_role;

COMMIT;
