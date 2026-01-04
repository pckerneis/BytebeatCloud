import { useRouter } from 'next/router';
import Head from 'next/head';
import { FocusLayout } from '../../components/FocusLayout';
import { NextPageWithLayout } from '../_app';
import { FocusExpressionEditor } from '../../components/FocusExpressionEditor';
import { PublishPanel } from '../../components/PublishPanel';
import { ModeOption } from '../../model/expression';
import { usePostEditor } from '../../hooks/usePostEditor';

const page: NextPageWithLayout = function FocusCreatePage() {
  const router = useRouter();
  const editor = usePostEditor({
    mode: 'create',
    initialMode: ModeOption.Uint8,
    loopPreview: true,
  });

  return (
    <>
      <Head>
        <title>Create - BytebeatCloud</title>
        <meta name="description" content="Create a new bytebeat on BytebeatCloud" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Create - BytebeatCloud" />
        <meta property="og:description" content="Create a new bytebeat on BytebeatCloud" />
        <meta
          property="og:image"
          content={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/og/create${editor.expression ? `?expr=${encodeURIComponent(editor.expression)}` : ''}`}
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      {!editor.isStateLoaded && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            color: 'white',
          }}
        >
          Loading...
        </div>
      )}
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
        onExitFocusMode={() => void router.push('/create')}
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
