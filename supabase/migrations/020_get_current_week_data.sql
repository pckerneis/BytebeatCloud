create or replace function public.get_current_week_data()
    returns jsonb
    language plpgsql
    stable
as $$
declare
    v_challenge public.weekly_challenges;
    v_posts jsonb;
    v_participant_count integer;
begin
    -- Fetch the active challenge
    select *
    into v_challenge
    from public.weekly_challenges
    where starts_at <= now()
      and ends_at >  now()
    order by week_number desc
    limit 1;

    -- No active challenge → return null
    if v_challenge.id is null then
        return null;
    end if;

    -- Fetch participating posts
    select jsonb_agg(jsonb_build_object(
                             'id', p.id,
                             'created_at', p.created_at,
                             'tags', p.tags,
                             'score', p.score,
                             'author_id', p.author_id,
                             'author', jsonb_build_object(
                                     'id', u.id,
                                     'username', u.username,
                                     'avatar_url', u.avatar_url
                                       )
                     ) order by p.score desc)
    into v_posts
    from public.posts p
             left join public.users u on u.id = p.author_id
    where p.created_at >= v_challenge.starts_at
      and p.created_at <  v_challenge.ends_at
      and p.tags @> array[v_challenge.tag];

    -- Compute participant count
    select count(*)
    into v_participant_count
    from public.posts p
    where p.created_at >= v_challenge.starts_at
      and p.created_at <  v_challenge.ends_at
      and p.tags @> array[v_challenge.tag];

    -- Final JSON structure
    return jsonb_build_object(
            'challenge', to_jsonb(v_challenge),
            'participants', coalesce(v_posts, '[]'::jsonb),
            'participant_count', v_participant_count
           );
end;
$$;
