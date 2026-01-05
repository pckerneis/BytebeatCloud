import { useRouter } from 'next/router';
import Head from 'next/head';
import { FocusLayout } from '../../../components/FocusLayout';
import { NextPageWithLayout } from '../../_app';
import { FocusExpressionEditor } from '../../../components/FocusExpressionEditor';
import { PublishPanel } from '../../../components/PublishPanel';
import { usePostEditor } from '../../../hooks/usePostEditor';
import { useSupabaseAuth } from '../../../hooks/useSupabaseAuth';
import Link from 'next/link';

const page: NextPageWithLayout = function EditPostFocusPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useSupabaseAuth();
  const editor = usePostEditor({
    mode: 'edit',
    postId: id,
    loopPreview: false,
  });

  if (editor.loading) {
    return (
      <>
        <Head>
          <title>Edit post - BytebeatCloud</title>
        </Head>
        <section className="py-8 px-12">
          <h2>Edit post</h2>
          <p>Loading…</p>
        </section>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Head>
          <title>Edit post - BytebeatCloud</title>
        </Head>
        <section className="py-8 px-12">
          <h2>Edit post</h2>
          <p>You need to <Link href="/login">log in</Link> in order to edit a post.</p>
        </section>
      </>
    );
  }

  if (editor.loadError) {
    return (
      <>
        <Head>
          <title>Edit post - BytebeatCloud</title>
        </Head>
        <section className="py-8 px-12">
          <h2>Edit post</h2>
          <p className="error-message">{editor.loadError}</p>
        </section>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Edit post - BytebeatCloud</title>
        <meta name="description" content="Edit your bytebeat on BytebeatCloud" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Editing - BytebeatCloud" />
        <meta property="og:description" content="Edit your bytebeat on BytebeatCloud" />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/edit/${id as string}`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <FocusLayout
        expression={editor.expression}
        mode={editor.mode}
        onModeChange={editor.setMode}
        sampleRate={editor.sampleRate}
        onSampleRateChange={editor.setSampleRate}
        isPlaying={editor.isPlaying}
        onPlayClick={editor.onPlayClick}
        liveUpdateEnabled={editor.liveUpdateEnabled}
        onLiveUpdateChange={editor.setLiveUpdateEnabled}
        onPublish={() => editor.setIsPublishPanelOpen(true)}
        isLoggedIn={!!editor.user}
        username={editor.username}
        title={editor.title}
        onTitleChange={editor.setTitle}
        onExitFocusMode={() => void router.push(`/edit/${id}`)}
        runtimeError={editor.lastError}
      >
        <section style={{ width: '100%', height: '100%', overflow: 'auto' }}>
          <FocusExpressionEditor
            value={editor.expression}
            onChange={editor.handleExpressionChange}
          />
        </section>
      </FocusLayout>

      <PublishPanel
        isOpen={editor.isPublishPanelOpen}
        onClose={() => editor.setIsPublishPanelOpen(false)}
        title={editor.title}
        onTitleChange={editor.setTitle}
        description={editor.description}
        onDescriptionChange={editor.setDescription}
        license={editor.license}
        onLicenseChange={editor.setLicense}
        onPublish={editor.handlePublish}
        isPublishing={editor.saveStatus === 'saving'}
        canPublish={editor.canPublish}
        saveError={editor.saveError}
      />
    </>
  );
};

page.getLayout = (page) => page;

export default page;
