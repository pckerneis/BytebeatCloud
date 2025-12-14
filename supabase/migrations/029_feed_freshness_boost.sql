-- Update feed ranking to boost very recent posts with fast decay
-- Posts < 2h old get a significant freshness bonus that decays quickly

-- Drop existing functions to allow return type changes
DROP FUNCTION IF EXISTS public.get_global_feed(integer, integer);
DROP FUNCTION IF EXISTS public.get_personalized_feed(uuid, integer, integer);

-- Global feed: add freshness boost for recent posts
CREATE OR REPLACE FUNCTION public.get_global_feed(
  page integer DEFAULT 0,
  page_size integer DEFAULT 20
) RETURNS TABLE(
  id uuid,
  profile_id uuid,
  title text,
  expression text,
  sample_rate integer,
  mode text,
  is_fork boolean,
  created_at timestamptz,
  favorites_count integer,
  author_username text,
  origin_title text,
  origin_username text,
  score double precision,
  fork_of_post_id uuid
) LANGUAGE sql STABLE AS $$
with post_base as (
  select
    pwm.*,
    (select count(*) from follows where followed_id = pwm.profile_id) as author_followers,
    extract(epoch from (now() - pwm.created_at)) as age_seconds
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
    (
      log(1 + p.favorites_count) * 1.2
      + log(1 + p.author_followers) * 0.8
    )
    * exp(-p.age_seconds / 86400)
    -- Freshness boost: +10 at t=0, decays with half-life of ~40 min (2400 sec)
    + 10 * exp(-p.age_seconds / 2400)
  ) as score,
  p.fork_of_post_id
from post_base p
order by score desc
limit page_size offset page * page_size;
$$;

-- Personalized feed: same freshness boost + follow-based bonuses
CREATE OR REPLACE FUNCTION public.get_personalized_feed(
  viewer_id uuid,
  page integer DEFAULT 0,
  page_size integer DEFAULT 20
) RETURNS TABLE(
  id uuid,
  profile_id uuid,
  title text,
  expression text,
  sample_rate integer,
  mode text,
  is_fork boolean,
  created_at timestamptz,
  favorites_count integer,
  author_username text,
  origin_title text,
  origin_username text,
  score double precision,
  fork_of_post_id uuid
) LANGUAGE sql STABLE AS $$
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
    (select count(*) from follows where followed_id = pwm.profile_id) as author_followers,
    extract(epoch from (now() - pwm.created_at)) as age_seconds
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
    (
      log(1 + p.favorites_count) * 1.2
      + log(1 + p.author_followers) * 0.8
      + (case when p.profile_id in (select * from direct_follows) then 5 else 0 end)
      + (case when p.profile_id in (select * from two_hop) then 2 else 0 end)
    )
    * exp(-p.age_seconds / 86400)
    -- Freshness boost: +10 at t=0, decays with half-life of ~40 min (2400 sec)
    + 10 * exp(-p.age_seconds / 2400)
  ) as score,
  p.fork_of_post_id
from post_base p
order by score desc
limit page_size offset page * page_size;
$$;
