create or replace function public.start_new_weekly_challenge()
returns void
language plpgsql
security definer
as $$
declare
    v_theme text;
    v_week_number integer;
    -- Calculate this week's Saturday 20:05 UTC
    v_this_saturday timestamptz := date_trunc('week', now() at time zone 'utc') + interval '5 days 20 hours 5 minutes';
    -- If we're past this Saturday 20:05, use next week's Saturday
    v_starts_at timestamptz := case
        when now() >= v_this_saturday then v_this_saturday + interval '7 days'
        else v_this_saturday
    end;
    v_ends_at timestamptz := v_starts_at + interval '6 days 23 hours 55 minutes'; -- Next Saturday 20:00 UTC
    v_existing_id bigint;
begin
    -- Guard: check if a challenge already exists for this time window
    select id into v_existing_id
    from public.weekly_challenges
    where starts_at = v_starts_at
    limit 1;

    if v_existing_id is not null then
        raise notice 'Challenge already exists for this week (id: %). Skipping.', v_existing_id;
        return;
    end if;
    -- Fetch a random theme idea
    select idea into v_theme
    from public.theme_ideas
    order by random()
    limit 1;

    if v_theme is null then
        raise warning 'No theme ideas available. Weekly challenge not created.';
        return;
    end if;

    -- Remove the theme idea
    delete from public.theme_ideas where idea = v_theme;

    -- Compute next week number
    select coalesce(max(week_number), 0) + 1
      into v_week_number
    from public.weekly_challenges;

    -- Insert challenge entry
    insert into public.weekly_challenges (week_number, theme, tag, starts_at, ends_at)
    values (
        v_week_number,
        v_theme,
        'week' || v_week_number,
        v_starts_at,
        v_ends_at
    );

end;
$$;
