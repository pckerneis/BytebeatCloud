alter table posts
  add column description varchar(400) not null default '';

alter table posts
  add constraint description_trim_check
  check (description = btrim(description));
