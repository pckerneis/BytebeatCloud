import { useState, type FormEvent, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import Head from 'next/head';
import { CURRENT_TOS_VERSION } from '../constants';

export default function TosUpdatePage() {
  const { user, loading } = useSupabaseAuth();
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');
  const [error, setError] = useState('');
  const [acceptTos, setAcceptTos] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void router.replace('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    const checkProfile = async () => {
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('username, tos_version')
        .eq('id', (user as any).id)
        .maybeSingle();

      if (fetchError) {
        console.warn('Error loading profile for ToS update', fetchError.message);
        setError('Unable to load your profile.');
        return;
      }

      if (!data?.username) {
        // No username yet; send user through the normal onboarding flow.
        void router.replace('/onboarding');
        return;
      }

      if (data.tos_version === CURRENT_TOS_VERSION) {
        // Already accepted latest terms, send them home.
        void router.replace('/');
      }
    };

    void checkProfile();
  }, [user, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!user) return;

    if (!acceptTos) {
      setError('You must accept the Terms of Service to continue.');
      return;
    }

    setStatus('saving');
    setError('');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        tos_version: CURRENT_TOS_VERSION,
        tos_accepted_at: new Date().toISOString(),
      })
      .eq('id', (user as any).id);

    if (updateError) {
      setError(updateError.message);
      setStatus('idle');
      return;
    }

    void router.replace('/');
  };

  return (
    <>
      <Head>
        <title>Updated Terms of Services - BytebeatCloud</title>
      </Head>
      <section className="home-section">
        <h2>Updated Terms of Service</h2>
        <p>
          Our Terms of Service have changed. Please review the{' '}
          <a href="/terms" target="_blank" rel="noreferrer">
            latest Terms of Service
          </a>{' '}
          and confirm your acceptance to continue using BytebeatCloud.
        </p>

        <form className="create-form" onSubmit={handleSubmit}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={acceptTos}
              onChange={(e) => setAcceptTos(e.target.checked)}
            />
            <span>
              I have read and accept the{' '}
              <a href="/terms" target="_blank" rel="noreferrer">
                updated Terms of Service
              </a>
              .
            </span>
          </label>

          <div className="form-actions">
            <button type="submit" className="button primary" disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Confirm'}
            </button>
          </div>

          {error && <p className="error-message">{error}</p>}
        </form>
      </section>
    </>
  );
}
