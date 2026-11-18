import { Activity, Check, Clock3, RotateCcw, X } from 'lucide-react';
import type { ResolutionEvent } from '@/lib/types';

interface ReviewActivityDialogProps {
  events: ResolutionEvent[];
  loading: boolean;
  reportName: string;
  onClose: () => void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ReviewActivityDialog({ events, loading, reportName, onClose }: ReviewActivityDialogProps) {
  const resolved = events.filter((event) => event.action === 'resolved');
  const reopenedCount = events.filter((event) => event.action === 'reopened').length;
  const byReviewer = [...resolved.reduce((counts, event) => counts.set(event.actorEmail, (counts.get(event.actorEmail) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="review-activity-title" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="rounded-lg bg-accent-soft p-2 text-accent"><Activity className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="review-activity-title" className="font-bold tracking-tight">Review activity</h2>
            <p className="mt-0.5 truncate text-xs text-ink-3" title={reportName}>{reportName || 'Current report'}</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost -mr-2 -mt-1 p-2" aria-label="Close review activity"><X className="h-4 w-4" /></button>
        </header>

        {!reportName ? (
          <div className="p-8 text-center text-sm text-ink-3">Load a report to see its review activity.</div>
        ) : loading ? (
          <div className="p-8 text-center text-sm text-ink-3">Loading review activity…</div>
        ) : (
          <div className="min-h-0 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface-2 p-3"><p className="text-xs text-ink-3">Resolve actions</p><p className="mt-1 text-2xl font-semibold">{resolved.length.toLocaleString()}</p></div>
              <div className="rounded-xl border border-line bg-surface-2 p-3"><p className="text-xs text-ink-3">Reopened</p><p className="mt-1 text-2xl font-semibold">{reopenedCount.toLocaleString()}</p></div>
              <div className="col-span-2 rounded-xl border border-line bg-surface-2 p-3 sm:col-span-1"><p className="text-xs text-ink-3">Reviewers</p><p className="mt-1 text-2xl font-semibold">{byReviewer.length.toLocaleString()}</p></div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-[0.85fr_1.15fr]">
              <section>
                <h3 className="mb-2 text-sm font-bold">Resolved by reviewer</h3>
                {byReviewer.length === 0 ? <p className="rounded-lg bg-surface-2 p-3 text-xs text-ink-3">No invoices have been resolved in this report.</p> : (
                  <ul className="space-y-2">
                    {byReviewer.map(([email, count]) => <li key={email} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs"><span className="truncate text-ink-2" title={email}>{email}</span><span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono font-semibold text-accent-ink">{count}</span></li>)}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold">Recent changes</h3>
                {events.length === 0 ? <p className="rounded-lg bg-surface-2 p-3 text-xs text-ink-3">No review activity yet.</p> : (
                  <ul className="space-y-2">
                    {events.slice(0, 40).map((event) => <li key={event.id} className="rounded-lg border border-line px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 rounded-md p-1 ${event.action === 'resolved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'}`}>{event.action === 'resolved' ? <Check className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{event.action === 'resolved' ? 'Resolved' : 'Reopened'} invoice <span className="font-mono">{event.invoiceNo}</span></p>
                          <p className="mt-0.5 truncate text-xs text-ink-2" title={event.actorEmail}>{event.actorEmail}{event.reason ? ` · ${event.reason}` : ''}</p>
                          {event.note && <p className="mt-1 text-xs text-ink-3">{event.note}</p>}
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-3"><Clock3 className="h-3 w-3" />{formatDate(event.occurredAt)}</p>
                        </div>
                      </div>
                    </li>)}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
