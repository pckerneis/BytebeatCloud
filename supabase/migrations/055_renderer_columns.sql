-- Add columns for audio pre-rendering
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pre_rendered BOOLEAN DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS sample_url TEXT;

-- Create index for faster queries on posts needing rendering
CREATE INDEX IF NOT EXISTS idx_posts_pre_rendered ON posts(pre_rendered) WHERE is_draft = false;
