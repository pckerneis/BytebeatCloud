import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email.trim() || !supabase) return;

    setStatus('loading');
    setErrorMessage('');

    const redirectTo = `${window.location.origin}/`; // redirect back to home after magic link

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
    <section>
      <h2>Login</h2>
      <form className="create-form" onSubmit={handleSubmit}>
        <label className="field">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="post-title-input"
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

        {status === 'sent' && (
          <p className="counter">Check your inbox for the login link.</p>
        )}
        {status === 'error' && errorMessage && (
          <p className="error-message">{errorMessage}</p>
        )}
      </form>
    </section>
  );
}
