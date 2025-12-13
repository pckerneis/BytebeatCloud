create or replace function public.finalize_current_week()
returns void
language plpgsql
security definer
as $$
declare
    v_challenge record;
    v_winner uuid;
    v_winner_owner uuid;
    v_recent_exists boolean;
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

    if v_winner is null then
        return;
    end if;

    -- Notify winning post's author
    select p.profile_id
      into v_winner_owner
    from public.posts p
    where p.id = v_winner;

    if v_winner_owner is null then
        return;
    end if;

    -- De-dup: at most one winner notification per (user, post)
    select exists (
      select 1
      from public.notifications n
      where n.user_id = v_winner_owner
        and n.actor_id = v_winner_owner
        and n.event_type = 'weekly_winner'
        and n.post_id = v_winner
    ) into v_recent_exists;

    if v_recent_exists then
        return;
    end if;

    insert into public.notifications (user_id, actor_id, event_type, post_id)
    values (v_winner_owner, v_winner_owner, 'weekly_winner', v_winner);
end;
$$;
