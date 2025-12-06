-- Migrate legacy 'int' mode to 'uint8' and update allowed values to ('float','uint8','int8')
BEGIN;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_mode_check;

UPDATE public.posts SET mode = 'uint8' WHERE mode = 'int';

ALTER TABLE public.posts
  ADD CONSTRAINT posts_mode_check CHECK (
    mode = ANY (ARRAY['float'::text, 'uint8'::text, 'int8'::text])
  );

COMMIT;
