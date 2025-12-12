create or replace function public.finalize_current_week()
returns void
language plpgsql
security definer
as $$
declare
    v_challenge record;
    v_winner uuid;
begin
    -- Find the challenge that just ended (ends_at <= now) and has no winner yet
    -- This ensures we finalize the correct challenge even if multiple exist
    select *
      into v_challenge
    from public.weekly_challenges
    where winner_post_id is null
      and ends_at <= now()
    order by ends_at desc
    limit 1;

    if v_challenge is null then
        raise notice 'No challenge to finalize.';
        return;
    end if;

    -- Find winner post:
    --   1) highest number of favorites in the time window
    --   2) if tied, earliest "last favorite" timestamp
    --   3) if still tied (e.g. no favorites), earliest creation time
    select p.id
      into v_winner
    from public.posts p
      join public.post_tags pt on pt.post_id = p.id
      join public.tags t on t.id = pt.tag_id
      left join public.favorites f on f.post_id = p.id
    where p.created_at >= v_challenge.starts_at
      and p.created_at <  v_challenge.ends_at
      and t.name = v_challenge.tag
      and p.is_draft = false
    group by p.id
    order by
      count(f.*) desc,
      max(f.created_at) asc nulls last,
      p.created_at asc
    limit 1;

    -- Update challenge
    update public.weekly_challenges
       set winner_post_id = v_winner
     where id = v_challenge.id;

end;
$$;
