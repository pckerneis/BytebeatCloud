import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email.trim()) return;

    setStatus('loading');
    setErrorMessage('');

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH
      ? `/${process.env.NEXT_PUBLIC_BASE_PATH}`
      : '';
    const redirectTo = `${window.location.origin}${basePath}/`; // redirect back to home after magic link

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }

    setStatus('sent');
  };

  return (
    <>
      <Head>
        <title>Login - BytebeatCloud</title>
      </Head>
      <section>
        <h2>Login with your email address</h2>
        <form className="create-form" onSubmit={handleSubmit}>
          <label className="field">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-bottom-accent-focus"
              placeholder="you@example.com"
              required
            />
          </label>

          <div className="form-actions">
            <button
              type="submit"
              className="button primary"
              disabled={status === 'loading' || !email.trim()}
            >
              {status === 'loading' ? 'Sending link…' : 'Send magic link'}
            </button>
          </div>

          {status === 'sent' && <p className="counter">Check your inbox for the login link.</p>}
          {status === 'error' && errorMessage && <p className="error-message">{errorMessage}</p>}
        </form>
      </section>
    </>
  );
}
