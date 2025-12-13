create or replace function public.get_latest_weekly_challenge_winner()
    returns public.weekly_challenges
    language sql
    stable
as $$
select *
from public.weekly_challenges
where winner_post_id is not null
order by week_number desc
limit 1;
$$;
