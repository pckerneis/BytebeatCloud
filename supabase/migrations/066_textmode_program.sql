alter table posts
  add column textmode_program jsonb;

alter table posts
  add constraint textmode_program_shape_check
  check (
    textmode_program is null
    or (
      jsonb_typeof(textmode_program -> 'code') = 'string'
      and char_length(textmode_program ->> 'code') <= 16384
      and jsonb_typeof(textmode_program -> 'cols') = 'number'
      and (textmode_program ->> 'cols')::numeric between 1 and 300
      and jsonb_typeof(textmode_program -> 'rows') = 'number'
      and (textmode_program ->> 'rows')::numeric between 1 and 150
      and jsonb_typeof(textmode_program -> 'fps') = 'number'
      and (textmode_program ->> 'fps')::numeric between 1 and 120
    )
  )
  not valid;
