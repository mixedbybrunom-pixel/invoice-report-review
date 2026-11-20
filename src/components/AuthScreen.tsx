import { useState, type FormEvent } from 'react';
import { LockKeyhole, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) setError('Sign-in failed. Check your email and password, then try again.');
    } catch {
      setError('Could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendPasswordLink = async () => {
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('Enter your email address first, then choose Set or reset password.');
      return;
    }
    setResetBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (resetError) setError('Could not send a password link. Check your connection and try again.');
      else setMessage('If this email has a review account, a password link will arrive shortly.');
    } catch {
      setError('Could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <form onSubmit={signIn} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-pop">
        <img src="/ccl-logo.png" alt="CCL Logistics & Distribution" className="mb-6 h-20 w-auto object-contain object-left" />
        <h1 className="text-xl font-semibold tracking-tight">Sign in to CCL Report Review</h1>
        <p className="mt-2 text-sm text-ink-3">Use your CCL review team account to continue.</p>
        <label className="mt-6 block text-xs font-medium text-ink-2" htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1" />
        <label className="mt-4 block text-xs font-medium text-ink-2" htmlFor="auth-password">Password</label>
        <input id="auth-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-1" />
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary mt-5 w-full justify-center">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
          Sign in
        </button>
        <button type="button" onClick={() => { void sendPasswordLink(); }} disabled={resetBusy} className="mt-4 w-full text-center text-sm font-medium text-accent hover:underline disabled:opacity-60">
          {resetBusy ? 'Sending password link…' : 'Set or reset password'}
        </button>
        {message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{message}</p>}
      </form>
    </main>
  );
}

export function AccessDeniedScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 shadow-pop">
        <h1 className="text-xl font-semibold tracking-tight">Access not enabled</h1>
        <p className="mt-2 text-sm text-ink-3">Your account has not been added to the review team yet.</p>
        <button onClick={onSignOut} className="btn-secondary mt-5 w-full justify-center">Sign out</button>
      </div>
    </main>
  );
}
