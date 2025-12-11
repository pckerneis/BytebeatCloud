create or replace function public.start_new_weekly_challenge()
returns void
language plpgsql
security definer
as $$
declare
    v_theme text;
    v_week_number integer;
    v_starts_at timestamptz := date_trunc('week', now() at time zone 'utc') + interval '0 hours'; -- Monday 00:00 UTC
    v_ends_at timestamptz := v_starts_at + interval '7 days';
begin
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
