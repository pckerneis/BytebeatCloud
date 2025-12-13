create or replace view public.posts_with_meta with (security_invoker = on) as
select
  p.id,
  p.profile_id,
  p.title,
  p.expression,
  p.sample_rate,
  p.mode,
  p.is_draft,
  p.created_at,
  p.updated_at,
  p.fork_of_post_id,
  author.username        as author_username,
  origin.title           as origin_title,
  origin_author.username as origin_username,
  coalesce(fav.count, 0) as favorites_count,
  p.is_fork,
  p.description,
  exists (
    select 1
    from weekly_challenges wc
    where wc.winner_post_id = p.id
  ) as is_weekly_winner
from posts p
  left join profiles author on author.id = p.profile_id
  left join posts origin on origin.id = p.fork_of_post_id
  left join profiles origin_author on origin_author.id = origin.profile_id
  left join lateral (
    select count(*)::integer as count
    from favorites f
    where f.post_id = p.id
  ) fav on true;
