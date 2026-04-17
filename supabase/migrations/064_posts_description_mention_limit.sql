-- Increase description length limit to accommodate @[uuid] mention substitution.
-- Display text is limited to 256 chars on the frontend, but stored format replaces
-- @username (2-31 chars) with @[uuid] (38 chars), adding up to 36 chars per mention.
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS description_max_length,
  ADD CONSTRAINT description_max_length CHECK (char_length(description) <= 1024);
