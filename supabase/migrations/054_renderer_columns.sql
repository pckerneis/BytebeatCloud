-- Add columns for audio pre-rendering
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pre_rendered BOOLEAN DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS sample_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS prerender_duration INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS prerender_signature TEXT;

-- Create index for faster queries on posts needing rendering
CREATE INDEX IF NOT EXISTS idx_posts_pre_rendered ON posts(pre_rendered) WHERE is_draft = false;

-- Create storage bucket for audio samples
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-samples', 'audio-samples', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for audio samples bucket
CREATE POLICY "Public read access for audio samples"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-samples');

CREATE POLICY "Service role can upload audio samples"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audio-samples' AND auth.role() = 'service_role');

CREATE POLICY "Service role can update audio samples"
ON storage.objects FOR UPDATE
USING (bucket_id = 'audio-samples' AND auth.role() = 'service_role');

CREATE POLICY "Service role can delete audio samples"
ON storage.objects FOR DELETE
USING (bucket_id = 'audio-samples' AND auth.role() = 'service_role');
