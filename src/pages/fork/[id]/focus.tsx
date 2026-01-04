import { useRouter } from 'next/router';
import Head from 'next/head';
import { FocusLayout } from '../../../components/FocusLayout';
import { NextPageWithLayout } from '../../_app';
import { FocusExpressionEditor } from '../../../components/FocusExpressionEditor';
import { PublishPanel } from '../../../components/PublishPanel';
import { usePostEditor } from '../../../hooks/usePostEditor';

const page: NextPageWithLayout = function ForkPostFocusPage() {
  const router = useRouter();
  const { id } = router.query;
  const editor = usePostEditor({
    mode: 'fork',
    postId: id,
    loopPreview: false,
  });

  if (editor.loading) {
    return (
      <>
        <Head>
          <title>Fork post - BytebeatCloud</title>
        </Head>
        <section>
          <h2>Fork post</h2>
          <p className="text-centered secondary-text">Loading…</p>
        </section>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Fork post - BytebeatCloud</title>
        <meta name="description" content="Fork a bytebeat on BytebeatCloud" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Forking - BytebeatCloud" />
        <meta property="og:description" content="Fork a bytebeat on BytebeatCloud" />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/fork/${id as string}`}
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
        onExitFocusMode={() => void router.push(`/fork/${id}`)}
        runtimeError={editor.validationIssue?.message ?? editor.lastError}
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
