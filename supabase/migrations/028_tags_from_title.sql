-- Update the update_post_tags function to also extract tags from title
create or replace function update_post_tags(
    p_post_id uuid,
    p_description text
)
    returns text[]
    security definer
    set search_path = public
as $$
declare
    raw_tag text;
    clean_tag text;
    tag_id bigint;
    final_tags text[] := '{}';
    combined_text text;
    post_title text;
begin
    -- Get the post title
    select title into post_title from posts where id = p_post_id;

    -- Combine title and description for tag extraction
    combined_text := coalesce(post_title, '') || ' ' || coalesce(p_description, '');

    -- Delete links
    delete from post_tags where post_id = p_post_id;

    -- Extract tags from combined text
    for raw_tag in
        select distinct (match_arr)[1]
        from regexp_matches(combined_text, '(?<![A-Za-z0-9_-])#([A-Za-z0-9_-]+)', 'g') as match_arr
        loop
            clean_tag := lower(raw_tag);

            if length(clean_tag) < 1 or length(clean_tag) > 30 then
                continue;
            end if;

            if clean_tag !~ '^[a-z0-9_-]+$' then
                continue;
            end if;

            insert into tags (name)
            values (clean_tag)
            on conflict (name) do update set name = excluded.name
            returning id into tag_id;

            insert into post_tags (post_id, tag_id)
            values (p_post_id, tag_id)
            on conflict do nothing;

            final_tags := array_append(final_tags, clean_tag);
        end loop;

    return final_tags;
end;
$$ language plpgsql;

-- Update trigger to also fire on title changes
drop trigger if exists posts_update_tags on posts;

create trigger posts_update_tags
    after insert or update of description, title
    on posts
    for each row
execute function trigger_update_post_tags();
