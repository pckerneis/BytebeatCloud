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
    -- Fetch the active challenge (if any)
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

    -- Fetch participating posts for this challenge.
    -- A participating post:
    --   - is not a draft
    --   - was created within [starts_at, ends_at)
    --   - has the challenge tag via post_tags/tags
    select jsonb_agg(
               jsonb_build_object(
                   'id', p.id,
                   'created_at', p.created_at,
                   'favorites_count', coalesce(fav_count.cnt, 0),
                   'author_id', p.profile_id,
                   'author', jsonb_build_object(
                       'id', prof.id,
                       'username', prof.username
                   )
               )
               order by coalesce(fav_count.cnt, 0) desc, p.created_at asc
           )
      into v_posts
    from public.posts p
      join public.post_tags pt on pt.post_id = p.id
      join public.tags t on t.id = pt.tag_id
      join public.profiles prof on prof.id = p.profile_id
      left join (
        select post_id, count(*) as cnt
        from public.favorites
        group by post_id
      ) fav_count on fav_count.post_id = p.id
    where p.is_draft = false
      and p.created_at >= v_challenge.starts_at
      and p.created_at <  v_challenge.ends_at
      and t.name = v_challenge.tag;

    -- Compute participant count (distinct posts matching the same criteria)
    select count(distinct p.id)
      into v_participant_count
    from public.posts p
      join public.post_tags pt on pt.post_id = p.id
      join public.tags t on t.id = pt.tag_id
    where p.is_draft = false
      and p.created_at >= v_challenge.starts_at
      and p.created_at <  v_challenge.ends_at
      and t.name = v_challenge.tag;

    -- Final JSON structure
    return jsonb_build_object(
      'challenge', to_jsonb(v_challenge),
      'participants', coalesce(v_posts, '[]'::jsonb),
      'participant_count', coalesce(v_participant_count, 0)
    );
end;
$$;
