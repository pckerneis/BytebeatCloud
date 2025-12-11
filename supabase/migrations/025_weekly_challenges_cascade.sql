-- Fix weekly_challenges.winner_post_id FK to SET NULL on post deletion
-- This prevents FK violations when posts are deleted (e.g., via profile cascade)

alter table public.weekly_challenges
  drop constraint weekly_challenges_winner_post_id_fkey;

alter table public.weekly_challenges
  add constraint weekly_challenges_winner_post_id_fkey
  foreign key (winner_post_id)
  references public.posts(id)
  on delete set null;
