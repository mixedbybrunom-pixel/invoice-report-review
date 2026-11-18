import { useCallback, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

export interface Toast {
  id: number;
  message: string;
  detail?: string;
  tone: 'success' | 'error';
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const notify = useCallback(
    (message: string, tone: Toast['tone'] = 'success', detail?: string, durationMs = 3800) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, detail, tone }]);
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  return { toasts, notify, dismiss };
}

export function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-h-[75vh] w-[min(92vw,380px)] flex-col gap-2 overflow-y-auto sm:bottom-5 sm:right-5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-pop animate-toast-in"
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${t.tone === 'error' ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'}`}>
            <CheckCircle2 className={`h-4 w-4 ${t.tone === 'error' ? 'text-red-500' : 'text-emerald-500'}`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{t.message}</p>
            {t.detail && <p className="mt-1 break-words text-xs leading-relaxed text-ink-2">{t.detail}</p>}
          </div>
          <button onClick={() => onDismiss(t.id)} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
