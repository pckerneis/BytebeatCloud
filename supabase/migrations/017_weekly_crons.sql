-- Enable the pg_cron extension (idempotent)
create extension if not exists pg_cron;

alter database postgres set search_path = public, extensions;

-- Every Saturday at 20:00 UTC → finalize previous week
select cron.schedule(
  'finalize-weekly-challenge',
  '0 20 * * 6',
  $$select public.finalize_current_week();$$
);

-- Every Saturday at 20:05 UTC → start new week
select cron.schedule(
  'start-weekly-challenge',
  '5 20 * * 6',
  $$select public.start_new_weekly_challenge();$$
);
