


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."get_global_feed"("page" integer DEFAULT 0, "page_size" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "profile_id" "uuid", "title" "text", "expression" "text", "sample_rate" integer, "mode" "text", "is_fork" boolean, "created_at" timestamp with time zone, "favorites_count" integer, "author_username" "text", "origin_title" "text", "origin_username" "text", "score" double precision, "fork_of_post_id" "uuid")
    LANGUAGE "sql" STABLE
    AS $$
with post_base as (
  select
    pwm.*,
    (select count(*) from follows where followed_id = pwm.profile_id) as author_followers
  from posts_with_meta pwm
  where pwm.is_draft = false
)
select
  p.id,
  p.profile_id,
  p.title,
  p.expression,
  p.sample_rate,
  p.mode,
  p.is_fork,
  p.created_at,
  p.favorites_count,
  p.author_username,
  p.origin_title,
  p.origin_username,

  (
      (1 / pow(extract(epoch from (now() - p.created_at)), 0.5))
    + log(1 + p.favorites_count) * 2
    + log(1 + p.author_followers)
  ) as score,

  p.fork_of_post_id

from post_base p
order by score desc
limit page_size offset page * page_size;
$$;


ALTER FUNCTION "public"."get_global_feed"("page" integer, "page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_personalized_feed"("viewer_id" "uuid", "page" integer DEFAULT 0, "page_size" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "profile_id" "uuid", "title" "text", "expression" "text", "sample_rate" integer, "mode" "text", "is_fork" boolean, "created_at" timestamp with time zone, "favorites_count" integer, "author_username" "text", "origin_title" "text", "origin_username" "text", "score" double precision, "fork_of_post_id" "uuid")
    LANGUAGE "sql" STABLE
    AS $$
with direct_follows as (
  select followed_id
  from follows
  where follower_id = viewer_id
),

two_hop as (
  select f2.followed_id
  from follows f1
  join follows f2 on f2.follower_id = f1.followed_id
  where f1.follower_id = viewer_id
),

post_base as (
  select
    pwm.*,
    (select count(*) from follows where followed_id = pwm.profile_id) as author_followers
    from posts_with_meta pwm
    where pwm.is_draft = false
  )
  select
    p.id,
    p.profile_id,
    p.title,
    p.expression,
    p.sample_rate,
    p.mode,
    p.is_fork,
    p.created_at,
    p.favorites_count,
    p.author_username,
    p.origin_title,
    p.origin_username,
    (
      (1 / pow(extract(epoch from (now() - p.created_at)), 0.5))
      + log(1 + p.favorites_count) * 2
      + log(1 + p.author_followers)
      + (case when p.profile_id in (select * from direct_follows) then 5 else 0 end)
      + (case when p.profile_id in (select * from two_hop) then 2 else 0 end)
    ) as score,
    p.fork_of_post_id

                                                                                                                from post_base p
                                                                                                                order by score desc
                                                                                                                limit page_size offset page * page_size;
                                                                                                                $$;


ALTER FUNCTION "public"."get_personalized_feed"("viewer_id" "uuid", "page" integer, "page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trending_feed"("page" integer DEFAULT 0, "page_size" integer DEFAULT 20, "period_days" integer DEFAULT 7) RETURNS TABLE("id" "uuid", "profile_id" "uuid", "title" "text", "expression" "text", "sample_rate" integer, "mode" "text", "is_fork" boolean, "created_at" timestamp with time zone, "favorites_count" integer, "author_username" "text", "origin_title" "text", "origin_username" "text", "trending_score" double precision, "fork_of_post_id" "uuid")
    LANGUAGE "sql" STABLE
    AS $$
with post_base as (
  select
    pwm.*,
    (select count(*) from follows where followed_id = pwm.profile_id) as author_followers,
    (select count(*)
      from favorites f
      where f.post_id = pwm.id
        and f.created_at >= now() - make_interval(days => period_days)
                                          ) as recent_favorites
  from posts_with_meta pwm
  where pwm.is_draft = false
)
select
  p.id,
  p.profile_id,
  p.title,
  p.expression,
  p.sample_rate,
  p.mode,
  p.is_fork,
  p.created_at,
  p.favorites_count,
  p.author_username,
  p.origin_title,
  p.origin_username,
  (
    log(1 + p.recent_favorites) * 3
     + 1 / pow(extract(epoch from (now() - p.created_at)), 0.5)
     + log(1 + p.author_followers)
  ) as trending_score,
  p.fork_of_post_id
from post_base p
order by trending_score desc
limit page_size offset page * page_size;
 $$;


ALTER FUNCTION "public"."get_trending_feed"("page" integer, "page_size" integer, "period_days" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "post_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "followed_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "follows_follower_followed_check" CHECK (("follower_id" <> "followed_id"))
);


ALTER TABLE "public"."follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "expression" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "is_draft" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fork_of_post_id" "uuid",
    "is_fork" boolean DEFAULT false NOT NULL,
    "sample_rate" integer,
    CONSTRAINT "posts_mode_check" CHECK (("mode" = ANY (ARRAY['float'::"text", 'int'::"text"])))
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "username" "text" NOT NULL,
    "tos_version" "text",
    "tos_accepted_at" timestamp with time zone,
    CONSTRAINT "username_no_trailing_dot" CHECK (("username" !~ '\.$'::"text")),
    CONSTRAINT "username_valid_chars" CHECK (("username" ~ '^[A-Za-z0-9_.-]{3,32}$'::"text"))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."posts_with_meta" WITH ("security_invoker"='on') AS
 SELECT "p"."id",
    "p"."profile_id",
    "p"."title",
    "p"."expression",
    "p"."sample_rate",
    "p"."mode",
    "p"."is_draft",
    "p"."created_at",
    "p"."updated_at",
    "p"."fork_of_post_id",
    "author"."username" AS "author_username",
    "origin"."title" AS "origin_title",
    "origin_author"."username" AS "origin_username",
    COALESCE("fav"."count", 0) AS "favorites_count",
    "p"."is_fork"
   FROM (((("public"."posts" "p"
     LEFT JOIN "public"."profiles" "author" ON (("author"."id" = "p"."profile_id")))
     LEFT JOIN "public"."posts" "origin" ON (("origin"."id" = "p"."fork_of_post_id")))
     LEFT JOIN "public"."profiles" "origin_author" ON (("origin_author"."id" = "origin"."profile_id")))
     LEFT JOIN LATERAL ( SELECT ("count"(*))::integer AS "count"
           FROM "public"."favorites" "f"
          WHERE ("f"."post_id" = "p"."id")) "fav" ON (true));


ALTER VIEW "public"."posts_with_meta" OWNER TO "postgres";


ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_followed_unique" UNIQUE ("follower_id", "followed_id");



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profile_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profile_username_key" UNIQUE ("username");



CREATE INDEX "favorites_post_id_idx" ON "public"."favorites" USING "btree" ("post_id");



CREATE INDEX "favorites_profile_id_idx" ON "public"."favorites" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "favorites_profile_post_uidx" ON "public"."favorites" USING "btree" ("profile_id", "post_id");



CREATE INDEX "idx_follows_followed_id" ON "public"."follows" USING "btree" ("followed_id");



CREATE INDEX "idx_follows_follower_followed" ON "public"."follows" USING "btree" ("follower_id", "followed_id");



CREATE INDEX "idx_follows_follower_id" ON "public"."follows" USING "btree" ("follower_id");



CREATE UNIQUE INDEX "profiles_username_unique_ci" ON "public"."profiles" USING "btree" ("lower"("username"));



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_followed_id_fkey" FOREIGN KEY ("followed_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_fork_of_post_id_fkey" FOREIGN KEY ("fork_of_post_id") REFERENCES "public"."posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated users to select their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Allow users to insert their own profile row" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Anyone can read posts" ON "public"."posts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "posts"."profile_id"))));



CREATE POLICY "Enable read access for all users" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Favorites are readable by authenticated users" ON "public"."favorites" FOR SELECT USING (true);



CREATE POLICY "Users can delete their own posts" ON "public"."posts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "posts"."profile_id") AND ("p"."id" = "auth"."uid"())))));



CREATE POLICY "Users can favorite posts as themselves" ON "public"."favorites" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can insert their own posts" ON "public"."posts" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "posts"."profile_id") AND ("p"."id" = "auth"."uid"())))));



CREATE POLICY "Users can modify their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can remove their own favorites" ON "public"."favorites" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "profile_id"));



CREATE POLICY "Users can update their own posts" ON "public"."posts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "posts"."profile_id") AND ("p"."id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "posts"."profile_id") AND ("p"."id" = "auth"."uid"())))));



ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_global_feed"("page" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_feed"("page" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_feed"("page" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_personalized_feed"("viewer_id" "uuid", "page" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_personalized_feed"("viewer_id" "uuid", "page" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_personalized_feed"("viewer_id" "uuid", "page" integer, "page_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_trending_feed"("page" integer, "page_size" integer, "period_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_trending_feed"("page" integer, "page_size" integer, "period_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trending_feed"("page" integer, "page_size" integer, "period_days" integer) TO "service_role";


GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON TABLE "public"."follows" TO "anon";
GRANT ALL ON TABLE "public"."follows" TO "authenticated";
GRANT ALL ON TABLE "public"."follows" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."posts_with_meta" TO "anon";
GRANT ALL ON TABLE "public"."posts_with_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."posts_with_meta" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







