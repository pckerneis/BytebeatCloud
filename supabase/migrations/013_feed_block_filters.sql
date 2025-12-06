-- Add block-based filtering inside feed functions to ensure two-sided blocking regardless of RLS context
-- Modify get_global_feed, get_personalized_feed, get_trending_feed

BEGIN;

-- get_global_feed: add optional viewer_id parameter and exclude blocked authors when provided
CREATE OR REPLACE FUNCTION public.get_global_feed(
  page integer DEFAULT 0,
  page_size integer DEFAULT 20,
  viewer_id uuid DEFAULT NULL
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
    (select count(*) from follows where followed_id = pwm.profile_id) as author_followers
  from posts_with_meta pwm
  where pwm.is_draft = false
    and (
      viewer_id is null
      or (
        not exists (
          select 1 from blocked_users b where b.blocker_id = viewer_id and b.blocked_id = pwm.profile_id
        )
        and not exists (
          select 1 from blocked_users b2 where b2.blocker_id = pwm.profile_id and b2.blocked_id = viewer_id
        )
      )
    )
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

-- get_personalized_feed: exclude authors blocked by viewer or who blocked the viewer
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
    (select count(*) from follows where followed_id = pwm.profile_id) as author_followers
  from posts_with_meta pwm
  where pwm.is_draft = false
    and not exists (select 1 from blocked_users b where b.blocker_id = viewer_id and b.blocked_id = pwm.profile_id)
    and not exists (select 1 from blocked_users b2 where b2.blocker_id = pwm.profile_id and b2.blocked_id = viewer_id)
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

-- get_trending_feed: add optional viewer_id and exclude blocked authors when provided
CREATE OR REPLACE FUNCTION public.get_trending_feed(
  page integer DEFAULT 0,
  page_size integer DEFAULT 20,
  period_days integer DEFAULT 7,
  viewer_id uuid DEFAULT NULL
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
  trending_score double precision,
  fork_of_post_id uuid
) LANGUAGE sql STABLE AS $$
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
    and (
      viewer_id is null
      or (
        not exists (select 1 from blocked_users b where b.blocker_id = viewer_id and b.blocked_id = pwm.profile_id)
        and not exists (select 1 from blocked_users b2 where b2.blocker_id = pwm.profile_id and b2.blocked_id = viewer_id)
      )
    )
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

COMMIT;
