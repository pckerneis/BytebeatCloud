create or replace function public.get_current_weekly_challenge()
    returns public.weekly_challenges
    language sql
    stable
as $$
select *
from public.weekly_challenges
where starts_at <= now()
  and ends_at   > now()
order by week_number desc
limit 1;
$$;
