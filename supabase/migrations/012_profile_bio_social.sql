-- Add bio and social_links columns to profiles table
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "bio" TEXT,
  ADD COLUMN IF NOT EXISTS "social_links" TEXT[] DEFAULT '{}';

-- Add constraint to limit social_links array to max 3 items
ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "social_links_max_3" CHECK (array_length(social_links, 1) IS NULL OR array_length(social_links, 1) <= 3);

-- Add constraint to limit bio length (500 characters)
ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "bio_max_length" CHECK (char_length(COALESCE(bio, '')) <= 500);
