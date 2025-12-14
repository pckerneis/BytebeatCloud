-- Function to get daily activity data for a user (for heatmap display)
-- Returns activity counts per day for the last year
-- Activities include: posts created, favorites given
CREATE OR REPLACE FUNCTION "public"."get_user_activity_heatmap"(
    "user_id" "uuid"
) RETURNS TABLE (
    "date" date,
    "posts_count" bigint,
    "favorites_count" bigint,
    "total_count" bigint
)
LANGUAGE "sql" STABLE SECURITY INVOKER
AS $$
    WITH post_activity AS (
        SELECT
            DATE(created_at AT TIME ZONE 'UTC') as activity_date,
            COUNT(*) as cnt
        FROM posts
        WHERE profile_id = user_id
        AND is_draft = false
        AND created_at >= now() - interval '1 year'
        GROUP BY DATE(created_at AT TIME ZONE 'UTC')
    ),
    favorite_activity AS (
        SELECT
            DATE(created_at AT TIME ZONE 'UTC') as activity_date,
            COUNT(*) as cnt
        FROM favorites
        WHERE profile_id = user_id
        AND created_at >= now() - interval '1 year'
        GROUP BY DATE(created_at AT TIME ZONE 'UTC')
    ),
    all_dates AS (
        SELECT activity_date FROM post_activity
        UNION
        SELECT activity_date FROM favorite_activity
    )
    SELECT
        ad.activity_date as date,
        COALESCE(pa.cnt, 0) as posts_count,
        COALESCE(fa.cnt, 0) as favorites_count,
        COALESCE(pa.cnt, 0) + COALESCE(fa.cnt, 0) as total_count
    FROM all_dates ad
    LEFT JOIN post_activity pa ON pa.activity_date = ad.activity_date
    LEFT JOIN favorite_activity fa ON fa.activity_date = ad.activity_date
    ORDER BY ad.activity_date ASC;
$$;

ALTER FUNCTION "public"."get_user_activity_heatmap"("user_id" "uuid") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."get_user_activity_heatmap"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_activity_heatmap"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_activity_heatmap"("user_id" "uuid") TO "service_role";
