-- Enable RLS on follows
alter table public.follows
  enable row level security;

-- Allow everyone to read follow relationships
create policy "Follows are readable by all"
  on public.follows
  for select
  using (true);

-- Allow authenticated users to create follows where they are the follower
create policy "Users can follow others"
  on public.follows
  for insert
  to authenticated
  with check (auth.uid() = follower_id);

-- Allow authenticated users to delete their own follows
create policy "Users can unfollow others"
  on public.follows
  for delete
  to authenticated
  using (auth.uid() = follower_id);