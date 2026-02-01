alter table posts
  add column auto_skip_duration integer;

alter table posts
  add constraint auto_skip_duration_positive_check
  check (auto_skip_duration is null or auto_skip_duration > 0);
