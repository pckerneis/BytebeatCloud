import { useState, type FormEvent, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useSupabaseAuth } from '../hooks/useSupabaseAuth';
import { validateUsername } from '../lib/validateUsername';
import Head from 'next/head';
import { APP_NAME } from '../constants';

const CURRENT_TOS_VERSION = '2025-11-30-v1';

export default function OnboardingPage() {
  const { user, loading } = useSupabaseAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
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
    const checkExisting = async () => {
      if (!user || !supabase) return;

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', (user as any).id)
        .maybeSingle();

      if (fetchError) {
        // eslint-disable-next-line no-console
        console.warn('Error fetching profile', fetchError.message);
        return;
      }

      if (data?.username) {
        void router.replace('/');
      }
    };

    void checkExisting();
  }, [user, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!user || !supabase) return;

    const validationError = validateUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!acceptTos) {
      setError('You must accept the Terms of Service to continue.');
      return;
    }

    setStatus('saving');
    setError('');

    const { error: upsertError } = await supabase.from('profiles').upsert(
      {
        id: (user as any).id,
        username: username.trim(),
        tos_version: CURRENT_TOS_VERSION,
        tos_accepted_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (upsertError) {
      if ((upsertError as any).code === '23505') {
        setError('This username is already taken');
      } else {
        setError(upsertError.message);
      }
      setStatus('idle');
      return;
    }

    void router.replace('/');
  };

  return (
    <>
      <Head>
        <title>{APP_NAME} - Onboarding</title>
      </Head>
      <section>
        <h2>Choose your username</h2>
        <p>
          Your username must be unique, 3–32 characters long, and use only letters, digits and
          underscores.
        </p>
        <form className="create-form" onSubmit={handleSubmit}>
          <label className="field">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="post-title-input"
              placeholder="Choose a username"
              maxLength={32}
            />
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={acceptTos}
              onChange={(e) => setAcceptTos(e.target.checked)}
            />
            <span>
              I accept the{' '}
              <a href="/terms" target="_blank" rel="noreferrer">
                Terms of Service
              </a>
            </span>
          </label>

          <div className="form-actions">
            <button
              type="submit"
              className="button primary"
              disabled={status === 'saving' || !username.trim()}
            >
              {status === 'saving' ? 'Saving…' : 'Save username'}
            </button>
          </div>
          {error && <p className="error-message">{error}</p>}
        </form>
      </section>
    </>
  );
}
