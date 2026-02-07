-- Server-side length constraints for posts columns
-- Mirrors front-end limits: expression 4096, title 64, description 256
-- Drafts are exempt from the expression limit so users can keep work-in-progress code.

ALTER TABLE public.posts
  ADD CONSTRAINT expression_max_length CHECK (is_draft = true OR char_length(expression) <= 4096) NOT VALID;

ALTER TABLE public.posts
  ADD CONSTRAINT title_max_length CHECK (char_length(title) <= 64) NOT VALID;

ALTER TABLE public.posts
  ADD CONSTRAINT description_max_length CHECK (char_length(description) <= 256) NOT VALID;
