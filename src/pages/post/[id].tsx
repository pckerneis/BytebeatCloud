import { useRouter } from 'next/router';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { createClient } from '@supabase/supabase-js';
import { PostDetailView } from '../../components/PostDetailView';

interface PostMeta {
  id: string;
  title: string | null;
  author_username: string | null;
  description: string | null;
}

interface PostDetailPageProps {
  postMeta: PostMeta | null;
  baseUrl: string;
}

export default function PostDetailPage({ postMeta, baseUrl }: PostDetailPageProps) {
  const router = useRouter();
  const { id } = router.query;
  const postId = typeof id === 'string' ? id : null;

  const pageTitle = postMeta?.title
    ? `${postMeta.title} by @${postMeta.author_username || 'unknown'} - BytebeatCloud`
    : 'BytebeatCloud - Post detail';
  const pageDescription = postMeta?.description
    ? postMeta.description.slice(0, 200)
    : 'Listen to this bytebeat creation on BytebeatCloud';
  const ogImageUrl = postMeta?.id ? `${baseUrl}/api/og/${postMeta.id}` : undefined;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        {ogImageUrl && <meta property="og:image" content={ogImageUrl} />}
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        {ogImageUrl && <meta name="twitter:image" content={ogImageUrl} />}
      </Head>
      {postId ? (
        <PostDetailView postId={postId} baseUrl={baseUrl} />
      ) : (
        <section>
          <p className="error-message">Invalid post ID.</p>
        </section>
      )}
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PostDetailPageProps> = async (context) => {
  const { id } = context.params ?? {};
  const { req } = context;

  // Determine the base URL from the request
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;

  if (!id || typeof id !== 'string') {
    return { props: { postMeta: null, baseUrl } };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { props: { postMeta: null, baseUrl } };
  }

  const supabaseServer = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabaseServer
    .from('posts_with_meta')
    .select('id, title, author_username, description')
    .eq('id', id)
    .eq('is_draft', false)
    .maybeSingle();

  if (error || !data) {
    return { props: { postMeta: null, baseUrl } };
  }

  return {
    props: {
      postMeta: {
        id: data.id,
        title: data.title ?? null,
        author_username: data.author_username ?? null,
        description: data.description ?? null,
      },
      baseUrl,
    },
  };
};
