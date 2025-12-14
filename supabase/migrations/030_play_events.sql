-- Play events table for tracking post playtime analytics
CREATE TABLE IF NOT EXISTS "public"."play_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "duration_seconds" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "play_events_duration_positive" CHECK ("duration_seconds" > 0)
);

ALTER TABLE "public"."play_events" OWNER TO "postgres";

ALTER TABLE ONLY "public"."play_events"
    ADD CONSTRAINT "play_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."play_events"
    ADD CONSTRAINT "play_events_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."play_events"
    ADD CONSTRAINT "play_events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

-- Indexes for efficient querying
CREATE INDEX "play_events_post_id_idx" ON "public"."play_events" USING "btree" ("post_id");
CREATE INDEX "play_events_profile_id_idx" ON "public"."play_events" USING "btree" ("profile_id");
CREATE INDEX "play_events_created_at_idx" ON "public"."play_events" USING "btree" ("created_at");

-- RLS policies
ALTER TABLE "public"."play_events" ENABLE ROW LEVEL SECURITY;

-- Anyone can insert play events (including anonymous users)
CREATE POLICY "Anyone can insert play events" ON "public"."play_events"
    FOR INSERT WITH CHECK (true);

-- Only post owners can read play events for their posts
CREATE POLICY "Post owners can read their play events" ON "public"."play_events"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."posts" p
            WHERE p.id = play_events.post_id
            AND p.profile_id = auth.uid()
        )
    );

-- Grants
GRANT ALL ON TABLE "public"."play_events" TO "anon";
GRANT ALL ON TABLE "public"."play_events" TO "authenticated";
GRANT ALL ON TABLE "public"."play_events" TO "service_role";

-- Function to get creator analytics for a user's posts
CREATE OR REPLACE FUNCTION "public"."get_creator_analytics"(
    "creator_id" "uuid",
    "period_days" integer DEFAULT 30
) RETURNS TABLE (
    "post_id" "uuid",
    "post_title" "text",
    "total_plays" bigint,
    "total_play_seconds" bigint,
    "unique_listeners" bigint,
    "plays_in_period" bigint,
    "play_seconds_in_period" bigint
)
LANGUAGE "sql" STABLE SECURITY DEFINER
AS $$
    SELECT
        p.id as post_id,
        p.title as post_title,
        COUNT(pe.id) as total_plays,
        COALESCE(SUM(pe.duration_seconds), 0) as total_play_seconds,
        COUNT(DISTINCT pe.profile_id) as unique_listeners,
        COUNT(pe.id) FILTER (WHERE pe.created_at >= now() - make_interval(days => period_days)) as plays_in_period,
        COALESCE(SUM(pe.duration_seconds) FILTER (WHERE pe.created_at >= now() - make_interval(days => period_days)), 0) as play_seconds_in_period
    FROM posts p
    LEFT JOIN play_events pe ON pe.post_id = p.id
    WHERE p.profile_id = creator_id
    AND p.is_draft = false
    GROUP BY p.id, p.title
    ORDER BY total_plays DESC;
$$;

ALTER FUNCTION "public"."get_creator_analytics"("creator_id" "uuid", "period_days" integer) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."get_creator_analytics"("creator_id" "uuid", "period_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_creator_analytics"("creator_id" "uuid", "period_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_creator_analytics"("creator_id" "uuid", "period_days" integer) TO "service_role";

-- Function to get aggregated creator stats
CREATE OR REPLACE FUNCTION "public"."get_creator_stats"(
    "creator_id" "uuid",
    "period_days" integer DEFAULT 30
) RETURNS TABLE (
    "total_posts" bigint,
    "total_plays" bigint,
    "total_play_seconds" bigint,
    "unique_listeners" bigint,
    "plays_in_period" bigint,
    "play_seconds_in_period" bigint,
    "total_favorites" bigint
)
LANGUAGE "sql" STABLE SECURITY DEFINER
AS $$
    SELECT
        COUNT(DISTINCT p.id) as total_posts,
        COUNT(pe.id) as total_plays,
        COALESCE(SUM(pe.duration_seconds), 0) as total_play_seconds,
        COUNT(DISTINCT pe.profile_id) as unique_listeners,
        COUNT(pe.id) FILTER (WHERE pe.created_at >= now() - make_interval(days => period_days)) as plays_in_period,
        COALESCE(SUM(pe.duration_seconds) FILTER (WHERE pe.created_at >= now() - make_interval(days => period_days)), 0) as play_seconds_in_period,
        (SELECT COUNT(*) FROM favorites f JOIN posts fp ON fp.id = f.post_id WHERE fp.profile_id = creator_id) as total_favorites
    FROM posts p
    LEFT JOIN play_events pe ON pe.post_id = p.id
    WHERE p.profile_id = creator_id
    AND p.is_draft = false;
$$;

ALTER FUNCTION "public"."get_creator_stats"("creator_id" "uuid", "period_days" integer) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."get_creator_stats"("creator_id" "uuid", "period_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_creator_stats"("creator_id" "uuid", "period_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_creator_stats"("creator_id" "uuid", "period_days" integer) TO "service_role";
