import { useState, type FormEvent } from 'react';
import { Check, Copy, Loader2, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CreatedReviewer {
  email: string;
  temporaryPassword: string;
}

export function AddReviewerDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [created, setCreated] = useState<CreatedReviewer | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const createReviewer = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-reviewer', {
        body: { email: email.trim() },
      });
      if (invokeError) throw invokeError;
      setCreated({ email: data.email, temporaryPassword: data.temporaryPassword });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message.includes('not_authorized')
        ? 'Only an administrator can add reviewers.'
        : message.includes('already_exists')
          ? 'That email already has an account. Ask an administrator to check the team list.'
          : 'Could not add this reviewer. Check the email address and try again.');
    } finally {
      setBusy(false);
    }
  };

  const copyPassword = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.temporaryPassword);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Add a reviewer</h2>
            <p className="mt-1 text-sm text-ink-3">Create a team login without opening Supabase.</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost -mr-2 -mt-2 p-2" aria-label="Close add reviewer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {created ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-ink-2">Account created for <b>{created.email}</b>. Share this temporary password privately; they’ll be asked to choose their own the first time they sign in.</p>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3">
              <code className="min-w-0 flex-1 break-all text-sm">{created.temporaryPassword}</code>
              <button type="button" onClick={() => { void copyPassword(); }} className="btn-secondary shrink-0 px-2.5 py-2" aria-label="Copy temporary password">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-xs text-ink-3">This password is shown only in this window. Close it after you’ve copied it.</p>
            <button type="button" onClick={onClose} className="btn-primary w-full justify-center">Done</button>
          </div>
        ) : (
          <form onSubmit={createReviewer} className="mt-5">
            <label className="block text-xs font-medium text-ink-2" htmlFor="new-reviewer-email">Reviewer email</label>
            <input id="new-reviewer-email" type="email" autoComplete="off" required value={email} onChange={(event) => setEmail(event.target.value)} className="field mt-1" />
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary mt-5 w-full justify-center">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {busy ? 'Creating account…' : 'Create reviewer account'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
