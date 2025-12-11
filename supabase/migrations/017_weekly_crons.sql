-- Enable the pg_cron extension (idempotent)
create extension if not exists pg_cron;

alter database postgres set search_path = public, extensions;

-- Every Monday at 00:00 UTC → start new week
select cron.schedule(
  'start-weekly-challenge',
  '0 0 * * 1',
  $$select public.start_new_weekly_challenge();$$
);

-- Every Monday at 00:01 UTC → finalize previous week
select cron.schedule(
  'finalize-weekly-challenge',
  '1 0 * * 1',
  $$select public.finalize_current_week();$$
);
