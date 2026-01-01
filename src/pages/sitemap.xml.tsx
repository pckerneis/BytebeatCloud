import { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';

const SITE_URL = 'https://bytebeat.cloud';

function generateSiteMap(posts: any[], tags: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
   <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     <!-- Static pages -->
     <url>
       <loc>${SITE_URL}</loc>
       <lastmod>${new Date().toISOString()}</lastmod>
       <changefreq>daily</changefreq>
       <priority>1.0</priority>
     </url>
     <url>
       <loc>${SITE_URL}/what-is-bytebeat</loc>
       <lastmod>${new Date().toISOString()}</lastmod>
       <changefreq>monthly</changefreq>
       <priority>0.7</priority>
     </url>
     <url>
       <loc>${SITE_URL}/explore</loc>
       <lastmod>${new Date().toISOString()}</lastmod>
       <changefreq>daily</changefreq>
       <priority>0.9</priority>
     </url>
     <url>
       <loc>${SITE_URL}/weekly-hall-of-fame</loc>
       <lastmod>${new Date().toISOString()}</lastmod>
       <changefreq>weekly</changefreq>
       <priority>0.8</priority>
     </url>
     <url>
       <loc>${SITE_URL}/about-weekly</loc>
       <lastmod>${new Date().toISOString()}</lastmod>
       <changefreq>monthly</changefreq>
       <priority>0.6</priority>
     </url>
     <url>
       <loc>${SITE_URL}/privacy</loc>
       <lastmod>${new Date().toISOString()}</lastmod>
       <changefreq>monthly</changefreq>
       <priority>0.3</priority>
     </url>
     <url>
       <loc>${SITE_URL}/terms</loc>
       <lastmod>${new Date().toISOString()}</lastmod>
       <changefreq>monthly</changefreq>
       <priority>0.3</priority>
     </url>
     <url>
       <loc>${SITE_URL}/legal-notice</loc>
       <lastmod>${new Date().toISOString()}</lastmod>
       <changefreq>monthly</changefreq>
       <priority>0.3</priority>
     </url>
     <!-- Dynamic post pages -->
     ${posts
       .map((post) => {
         return `
     <url>
       <loc>${SITE_URL}/post/${post.id}</loc>
       <lastmod>${new Date(post.updated_at || post.created_at).toISOString()}</lastmod>
       <changefreq>weekly</changefreq>
       <priority>0.7</priority>
     </url>
   `;
       })
       .join('')}
     <!-- Tag pages -->
     ${tags
       .map((tag) => {
         return `
     <url>
       <loc>${SITE_URL}/tags/${encodeURIComponent(tag)}</loc>
       <lastmod>${new Date().toISOString()}</lastmod>
       <changefreq>daily</changefreq>
       <priority>0.6</priority>
     </url>
   `;
       })
       .join('')}
   </urlset>
 `;
}

function SiteMap() {
  // getServerSideProps will do the heavy lifting
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    res.statusCode = 500;
    res.end();
    return { props: {} };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Fetch all public posts
  const { data: posts } = await supabase
    .from('posts')
    .select('id, created_at, updated_at')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(10000);

  // Fetch all unique tags
  const { data: tagsData } = await supabase
    .from('posts')
    .select('tags')
    .eq('is_public', true)
    .not('tags', 'is', null);

  // Extract unique tags
  const uniqueTags = new Set<string>();
  tagsData?.forEach((post) => {
    if (post.tags && Array.isArray(post.tags)) {
      post.tags.forEach((tag: string) => uniqueTags.add(tag));
    }
  });

  // Generate the XML sitemap
  const sitemap = generateSiteMap(posts || [], Array.from(uniqueTags));

  res.setHeader('Content-Type', 'text/xml');
  res.write(sitemap);
  res.end();

  return {
    props: {},
  };
};

export default SiteMap;
