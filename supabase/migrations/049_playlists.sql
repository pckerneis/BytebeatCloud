-- Playlists and Playlist Entries

BEGIN;

-- Create visibility enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'playlist_visibility'
  ) THEN
    CREATE TYPE public.playlist_visibility AS ENUM ('public', 'unlisted', 'private');
  END IF;
END
$$;

-- Playlists table
CREATE TABLE IF NOT EXISTS public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) <= 64),
  description text,
  visibility public.playlist_visibility NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS playlists_owner_idx ON public.playlists (owner_id);
CREATE INDEX IF NOT EXISTS playlists_visibility_idx ON public.playlists (visibility);

-- Trigger function for auto-updating updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Attach trigger to playlists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_playlists_updated_at'
  ) THEN
    CREATE TRIGGER set_playlists_updated_at
    BEFORE UPDATE ON public.playlists
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

-- Playlist entries table
CREATE TABLE IF NOT EXISTS public.playlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  position integer NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer,
  note text CHECK (char_length(note) <= 256)
);

-- Constraints & indexes for entries
CREATE UNIQUE INDEX IF NOT EXISTS playlist_entries_unique_position_per_playlist
  ON public.playlist_entries (playlist_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS playlist_entries_unique_post_per_playlist
  ON public.playlist_entries (playlist_id, post_id);
CREATE INDEX IF NOT EXISTS playlist_entries_post_idx ON public.playlist_entries (post_id);
CREATE INDEX IF NOT EXISTS playlist_entries_playlist_idx ON public.playlist_entries (playlist_id);

-- Enable Row Level Security
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_entries ENABLE ROW LEVEL SECURITY;

-- Policies for playlists
-- Readable by everyone if not private; always readable by owner
CREATE POLICY "read playlists public or own" ON public.playlists
  FOR SELECT
  USING (owner_id = auth.uid() OR visibility <> 'private');

-- Only the owner can insert/update/delete
CREATE POLICY "insert playlists as self" ON public.playlists
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "update own playlists" ON public.playlists
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "delete own playlists" ON public.playlists
  FOR DELETE
  USING (owner_id = auth.uid());

-- Policies for playlist entries
-- Read entries if parent playlist is not private or owned by the viewer
CREATE POLICY "read playlist entries public or own" ON public.playlist_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_entries.playlist_id
        AND (p.owner_id = auth.uid() OR p.visibility <> 'private')
    )
  );

-- Only the playlist owner can insert/update/delete entries
CREATE POLICY "insert entries into own playlists" ON public.playlist_entries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "update entries in own playlists" ON public.playlist_entries
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "delete entries in own playlists" ON public.playlist_entries
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_id AND p.owner_id = auth.uid()
    )
  );

-- Grants
GRANT ALL ON TABLE public.playlists TO authenticated;
GRANT ALL ON TABLE public.playlists TO service_role;
GRANT SELECT ON TABLE public.playlists TO anon;

GRANT ALL ON TABLE public.playlist_entries TO authenticated;
GRANT ALL ON TABLE public.playlist_entries TO service_role;
GRANT SELECT ON TABLE public.playlist_entries TO anon;

COMMIT;
