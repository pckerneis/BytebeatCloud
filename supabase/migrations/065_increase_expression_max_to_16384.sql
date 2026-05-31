-- Increase expression byte limit from 4096 to 16384
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS expression_max_length;

ALTER TABLE public.posts
  ADD CONSTRAINT expression_max_length
  CHECK (
    is_draft = true
    OR public.minified_byte_length(expression) <= 16384
  )
  NOT VALID;
