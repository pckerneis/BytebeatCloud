-- Snippet usage tracking for popularity ranking
CREATE TABLE IF NOT EXISTS public.snippet_usages (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    snippet_id  uuid        NOT NULL REFERENCES public.snippets(id) ON DELETE CASCADE,
    profile_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX snippet_usages_snippet_id_idx ON public.snippet_usages USING btree (snippet_id);

-- RLS
ALTER TABLE public.snippet_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert snippet usages"
    ON public.snippet_usages FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can read snippet usages"
    ON public.snippet_usages FOR SELECT
    USING (true);

-- Grants
GRANT ALL ON TABLE public.snippet_usages TO anon;
GRANT ALL ON TABLE public.snippet_usages TO authenticated;
GRANT ALL ON TABLE public.snippet_usages TO service_role;

-- RPC function: search snippets ranked by popularity, own snippets first
CREATE OR REPLACE FUNCTION public.search_snippets_ranked(
    search_query text DEFAULT '',
    current_user_id uuid DEFAULT NULL,
    page_size int DEFAULT 20,
    page_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    name text,
    profile_id uuid,
    created_at timestamptz,
    description text,
    snippet text,
    is_public boolean,
    username text,
    usage_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT
        s.id,
        s.name,
        s.profile_id,
        s.created_at,
        s.description,
        s.snippet,
        s.is_public,
        p.username,
        COUNT(su.id) AS usage_count
    FROM public.snippets s
    LEFT JOIN public.snippet_usages su ON su.snippet_id = s.id
    LEFT JOIN public.profiles p ON p.id = s.profile_id
    WHERE
        (s.is_public = true OR s.profile_id = current_user_id)
        AND (
            search_query = ''
            OR s.name ILIKE '%' || search_query || '%'
            OR s.description ILIKE '%' || search_query || '%'
        )
    GROUP BY s.id, s.name, s.profile_id, s.created_at, s.description, s.snippet, s.is_public, p.username
    ORDER BY
        (s.profile_id = current_user_id) DESC,
        COUNT(su.id) DESC,
        s.created_at DESC
    LIMIT page_size
    OFFSET page_offset;
$$;

ALTER FUNCTION public.search_snippets_ranked(text, uuid, int, int) OWNER TO postgres;

GRANT ALL ON FUNCTION public.search_snippets_ranked(text, uuid, int, int) TO anon;
GRANT ALL ON FUNCTION public.search_snippets_ranked(text, uuid, int, int) TO authenticated;
GRANT ALL ON FUNCTION public.search_snippets_ranked(text, uuid, int, int) TO service_role;
