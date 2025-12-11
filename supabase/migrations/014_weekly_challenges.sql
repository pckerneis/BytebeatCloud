create table public.weekly_challenges (
  id bigint generated always as identity primary key,

  -- Week index: 1,2,3,...
  week_number integer not null unique,

  -- Theme text selected from theme_ideas
  theme text not null,

  -- Tag: 'week1', 'week2', ...
  tag text not null unique,

  -- When this week starts (Monday 00:00 UTC)
  starts_at timestamptz not null,

  -- Ends automatically one week later
  ends_at timestamptz not null,

  -- After finalization, store the winning post ID
  winner_post_id uuid references public.posts(id),

  created_at timestamptz default now()
);

comment on table public.weekly_challenges is
'Stores weekly Bytebeat challenges, themes, tags, and winners.';

alter table public.weekly_challenges enable row level security;

-- Public read
create policy "Weekly challenges are readable by anyone"
on public.weekly_challenges
for select
to public
using (true);

-- No inserts from clients
create policy "No inserts"
on public.weekly_challenges
for insert
with check (false);

create policy "No updates"
on public.weekly_challenges
for update
using (false);

create policy "No deletes"
on public.weekly_challenges
for delete
using (false);
