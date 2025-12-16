-- Update feed functions to return all posts_with_meta columns using SETOF
-- This avoids having to update functions when new columns are added to posts/posts_with_meta

-- Drop existing functions to allow return type changes
DROP FUNCTION IF EXISTS public.get_global_feed(integer, integer);
DROP FUNCTION IF EXISTS public.get_personalized_feed(uuid, integer, integer);

-- Global feed: returns all posts_with_meta columns, ordered by computed score
CREATE OR REPLACE FUNCTION public.get_global_feed(
  page integer DEFAULT 0,
  page_size integer DEFAULT 20
) RETURNS SETOF posts_with_meta
LANGUAGE sql STABLE AS $$
select pwm.*
from posts_with_meta pwm
where pwm.is_draft = false
order by (
  (
    log(1 + pwm.favorites_count) * 1.2
    + log(1 + (select count(*) from follows where followed_id = pwm.profile_id)) * 0.8
  )
  * exp(-extract(epoch from (now() - pwm.created_at)) / 86400)
  -- Freshness boost: +10 at t=0, decays with half-life of ~40 min (2400 sec)
  + 10 * exp(-extract(epoch from (now() - pwm.created_at)) / 2400)
) desc
limit page_size offset page * page_size;
$$;

-- Personalized feed: returns all posts_with_meta columns, ordered by computed score
CREATE OR REPLACE FUNCTION public.get_personalized_feed(
  viewer_id uuid,
  page integer DEFAULT 0,
  page_size integer DEFAULT 20
) RETURNS SETOF posts_with_meta
LANGUAGE sql STABLE AS $$
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
)
select pwm.*
from posts_with_meta pwm
where pwm.is_draft = false
order by (
  (
    log(1 + pwm.favorites_count) * 1.2
    + log(1 + (select count(*) from follows where followed_id = pwm.profile_id)) * 0.8
    + (case when pwm.profile_id in (select * from direct_follows) then 5 else 0 end)
    + (case when pwm.profile_id in (select * from two_hop) then 2 else 0 end)
  )
  * exp(-extract(epoch from (now() - pwm.created_at)) / 86400)
  -- Freshness boost: +10 at t=0, decays with half-life of ~40 min (2400 sec)
  + 10 * exp(-extract(epoch from (now() - pwm.created_at)) / 2400)
) desc
limit page_size offset page * page_size;
$$;
