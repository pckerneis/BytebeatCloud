create table if not exists tags
(
    id         bigint generated always as identity primary key,
    name       text unique not null,
    created_at timestamptz default now()
);

create table if not exists post_tags
(
    post_id uuid not null references posts (id) on delete cascade,
    tag_id  bigint not null references tags (id) on delete cascade,
    primary key (post_id, tag_id)
);

alter table tags
    enable row level security;
alter table post_tags
    enable row level security;

create policy "public can read tags"
    on tags for select
    using (true);

create policy "no direct writes to tags"
    on tags for all
    to authenticated
    using (false)
    with check (false);

create policy "public can read post_tags"
    on post_tags for select
    using (true);

create policy "post owner can manage their post_tags indirectly"
    on post_tags for insert
    to authenticated
    with check (
    exists (select 1
            from posts
            where posts.id = post_tags.post_id
              and posts.profile_id = auth.uid())
    );

create policy "post owner can delete their own post_tags"
    on post_tags for delete
    to authenticated
    using (
    exists (select 1
            from posts
            where posts.id = post_tags.post_id
              and posts.profile_id = auth.uid())
    );

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
begin
    -- Delete links
    delete from post_tags where post_id = p_post_id;

    -- Extract tags
    for raw_tag in
        select distinct (match_arr)[1]
        from regexp_matches(p_description, '(?<![A-Za-z0-9_-])#([A-Za-z0-9_-]+)', 'g') as match_arr
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

create or replace function trigger_update_post_tags()
    returns trigger
    language plpgsql
as $$
begin
    perform update_post_tags(NEW.id, NEW.description);
    return NEW;
end;
$$;

drop trigger if exists posts_update_tags on posts;

create trigger posts_update_tags
    after insert or update of description
    on posts
    for each row
execute function trigger_update_post_tags();
