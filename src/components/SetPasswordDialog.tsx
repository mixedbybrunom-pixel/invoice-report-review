import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function SetPasswordDialog({ onClose, onSaved, required = false }: { onClose: () => void; onSaved: () => Promise<void> | void; required?: boolean }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) setError(updateError.message);
      else await onSaved();
    } catch {
      setError('Could not save your password. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (!required && event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={savePassword} className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Set your account password</h2>
            <p className="mt-1 text-sm text-ink-3">{required ? 'For security, choose your own password to continue.' : 'You can use it the next time you sign in.'}</p>
          </div>
          {!required && (
            <button type="button" onClick={onClose} className="btn-ghost -mr-2 -mt-2 p-2" aria-label="Close password setup">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <label className="mt-5 block text-xs font-medium text-ink-2" htmlFor="new-account-password">New password</label>
        <input id="new-account-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="field mt-1" />
        <label className="mt-4 block text-xs font-medium text-ink-2" htmlFor="confirm-account-password">Confirm password</label>
        <input id="confirm-account-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="field mt-1" />
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          {!required && <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>}
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Save password
          </button>
        </div>
      </form>
    </div>
  );
}
