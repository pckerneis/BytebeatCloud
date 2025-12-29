-- Admin metrics functions for monitoring dashboard
-- These are security definer functions that bypass RLS for admin use

-- Daily stats snapshot view
create or replace function public.admin_get_metrics()
returns json
language sql
security definer
stable
as $$
select json_build_object(
  'total_users', (select count(*) from auth.users),
  'total_profiles', (select count(*) from public.profiles),
  'total_posts', (select count(*) from public.posts where is_draft = false),
  'total_drafts', (select count(*) from public.posts where is_draft = true),
  'total_forks', (select count(*) from public.posts where is_fork = true and is_draft = false),
  'total_favorites', (select count(*) from public.favorites),
  'total_follows', (select count(*) from public.follows),
  'total_weekly_challenges', (select count(*) from public.weekly_challenges),
  'users_last_24h', (select count(*) from auth.users where created_at >= now() - interval '24 hours'),
  'users_last_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
  'users_last_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
  'posts_last_24h', (select count(*) from public.posts where is_draft = false and created_at >= now() - interval '24 hours'),
  'posts_last_7d', (select count(*) from public.posts where is_draft = false and created_at >= now() - interval '7 days'),
  'posts_last_30d', (select count(*) from public.posts where is_draft = false and created_at >= now() - interval '30 days'),
  'favorites_last_24h', (select count(*) from public.favorites where created_at >= now() - interval '24 hours'),
  'favorites_last_7d', (select count(*) from public.favorites where created_at >= now() - interval '7 days'),
  'favorites_last_30d', (select count(*) from public.favorites where created_at >= now() - interval '30 days'),
  'follows_last_24h', (select count(*) from public.follows where created_at >= now() - interval '24 hours'),
  'follows_last_7d', (select count(*) from public.follows where created_at >= now() - interval '7 days'),
  'follows_last_30d', (select count(*) from public.follows where created_at >= now() - interval '30 days')
);
$$;

-- Daily user signups for trend chart (last 30 days)
create or replace function public.admin_get_daily_signups(days_back integer default 30)
returns table(day date, count bigint)
language sql
security definer
stable
as $$
select 
  date_trunc('day', created_at)::date as day,
  count(*) as count
from auth.users
where created_at >= now() - make_interval(days => days_back)
group by day
order by day;
$$;

-- Daily posts for trend chart (last 30 days)
create or replace function public.admin_get_daily_posts(days_back integer default 30)
returns table(day date, count bigint)
language sql
security definer
stable
as $$
select 
  date_trunc('day', created_at)::date as day,
  count(*) as count
from public.posts
where is_draft = false
  and created_at >= now() - make_interval(days => days_back)
group by day
order by day;
$$;

-- Daily favorites for trend chart (last 30 days)
create or replace function public.admin_get_daily_favorites(days_back integer default 30)
returns table(day date, count bigint)
language sql
security definer
stable
as $$
select 
  date_trunc('day', created_at)::date as day,
  count(*) as count
from public.favorites
where created_at >= now() - make_interval(days => days_back)
group by day
order by day;
$$;

-- Revoke public access, only service_role can call these
revoke execute on function public.admin_get_metrics() from public, anon, authenticated;
grant execute on function public.admin_get_metrics() to service_role;

revoke execute on function public.admin_get_daily_signups(integer) from public, anon, authenticated;
grant execute on function public.admin_get_daily_signups(integer) to service_role;

revoke execute on function public.admin_get_daily_posts(integer) from public, anon, authenticated;
grant execute on function public.admin_get_daily_posts(integer) to service_role;

revoke execute on function public.admin_get_daily_favorites(integer) from public, anon, authenticated;
grant execute on function public.admin_get_daily_favorites(integer) to service_role;
