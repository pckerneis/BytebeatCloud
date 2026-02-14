CREATE TABLE IF NOT EXISTS public.snippets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
  profile_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  description text        NOT NULL DEFAULT '' CHECK (char_length(description) BETWEEN 0 AND 1024),
  snippet     text        NOT NULL CHECK (char_length(snippet) BETWEEN 1 AND 1024),
  is_public   boolean     NOT NULL DEFAULT false
);

ALTER TABLE public.snippets ENABLE ROW LEVEL SECURITY;

-- Anyone can read public snippets
CREATE POLICY snippets_select_public ON public.snippets
  FOR SELECT USING (is_public = true);

-- Owners can read their own snippets (including private)
CREATE POLICY snippets_select_own ON public.snippets
  FOR SELECT USING (profile_id = auth.uid());

-- Owners can insert their own snippets
CREATE POLICY snippets_insert_own ON public.snippets
  FOR INSERT WITH CHECK (profile_id = auth.uid());

-- Owners can update their own snippets
CREATE POLICY snippets_update_own ON public.snippets
  FOR UPDATE USING (profile_id = auth.uid());

-- Owners can delete their own snippets
CREATE POLICY snippets_delete_own ON public.snippets
  FOR DELETE USING (profile_id = auth.uid());
