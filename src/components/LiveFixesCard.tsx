import { useEffect, useRef } from 'react';
import { RotateCcw, CheckCircle2, X } from 'lucide-react';

export interface LiveFix {
  id: string;
  invoiceNo: string;
  customer: string;
  account: string;
  action: 'resolved' | 'reopened';
  reason: string;
  note: string;
  actor: string;
  at: string;
}

interface Props {
  fixes: LiveFix[];
  onClose: () => void;
}

function timeOf(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** A card that stays on screen until closed. New fixes from teammates are added to the top. */
export function LiveFixesCard({ fixes, onClose }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: 0 }); }, [fixes.length]);
  if (fixes.length === 0) return null;
  return (
    <section
      role="status"
      aria-label="Team updates on this report"
      className="fixed bottom-4 left-4 right-4 z-[55] flex max-h-[55vh] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-pop-in sm:right-auto sm:w-[26rem] md:left-[19rem]"
    >
      <header className="flex items-center gap-2 border-b border-line bg-accent-soft px-4 py-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-accent-ink">Team updates on this report</h2>
          <p className="text-xs text-ink-2">{fixes.length} {fixes.length === 1 ? 'update' : 'updates'} from your team</p>
        </div>
        <button onClick={onClose} className="btn-secondary h-9 gap-1 px-2.5 text-sm" aria-label="Close team updates">
          <X className="h-4 w-4" /> Close
        </button>
      </header>
      <ul ref={listRef} className="scrollbar-thin flex-1 divide-y divide-line overflow-y-auto">
        {fixes.map((f) => (
          <li key={f.id} className="px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[15px] font-semibold">{f.invoiceNo}</span>
              {f.action === 'reopened' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  <RotateCcw className="h-3 w-3" /> Reopened
                </span>
              )}
              <span className="ml-auto text-xs text-ink-3">{timeOf(f.at)}</span>
            </div>
            {(f.customer || f.account) && <p className="mt-0.5 text-ink-2">{[f.customer, f.account && `account ${f.account}`].filter(Boolean).join(' · ')}</p>}
            {f.action === 'resolved' && f.reason && <p className="mt-1 font-medium text-ink">{f.reason}</p>}
            {f.note && <p className="mt-0.5 text-ink-2">{f.note}</p>}
            <p className="mt-1 text-xs text-ink-3">{f.action === 'resolved' ? 'Resolved' : 'Reopened'} by {f.actor}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
