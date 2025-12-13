create or replace view public.weekly_hall_of_fame with (security_invoker = on) as
select
  wc.week_number,
  wc.theme,
  wc.starts_at,
  wc.ends_at,
  pwm.*
from weekly_challenges wc
join posts_with_meta pwm on pwm.id = wc.winner_post_id
where wc.winner_post_id is not null
order by wc.week_number desc;
