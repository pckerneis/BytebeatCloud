-- Add prerender_duration column to posts table
ALTER TABLE "public"."posts" 
ADD COLUMN "prerender_duration" integer DEFAULT 120 NOT NULL;
