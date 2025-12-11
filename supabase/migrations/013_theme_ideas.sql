-- Create table for weekly challenge theme ideas
create table if not exists public.theme_ideas (
  idea text primary key
);

-- Enable row level security
alter table public.theme_ideas
  enable row level security;

-- Policy: allow the `service_role` to fully manage theme ideas.
-- This is intended for trusted backend operations / SQL functions.
create policy "Service role can manage theme ideas"
  on public.theme_ideas
  for all
  to service_role
  using (true)
  with check (true);

-- Seed initial theme ideas. These are managed via migrations, not by clients.
insert into public.theme_ideas (idea) values
  ('Freedom'),
  ('Chaos Theory'),
  ('Bubbles'),
  ('Hot or cold'),
  ('Bitcrush'),
  ('Polyrhythm'),
  ('Drone'),
  ('No looping'),
  ('Ambient'),
  ('Glitch'),
  ('Noisy'),
  ('Tiny yet powerful')
  ('FM synthesis'),
  ('Rainy vibe');
