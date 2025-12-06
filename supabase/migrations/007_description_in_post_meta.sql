create or replace view public.posts_with_meta with (security_invoker = on) as
SELECT p.id,
       p.profile_id,
       p.title,
       p.expression,
       p.sample_rate,
       p.mode,
       p.is_draft,
       p.created_at,
       p.updated_at,
       p.fork_of_post_id,
       author.username        AS author_username,
       origin.title           AS origin_title,
       origin_author.username AS origin_username,
       COALESCE(fav.count, 0) AS favorites_count,
       p.is_fork,
       p.description
FROM posts p
         LEFT JOIN profiles author ON author.id = p.profile_id
         LEFT JOIN posts origin ON origin.id = p.fork_of_post_id
         LEFT JOIN profiles origin_author ON origin_author.id = origin.profile_id
         LEFT JOIN LATERAL ( SELECT count(*)::integer AS count
                             FROM favorites f
                             WHERE f.post_id = p.id) fav ON true;