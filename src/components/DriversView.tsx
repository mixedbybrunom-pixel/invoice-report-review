import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, Trash2, Truck } from 'lucide-react';
import {
  DRIVER_FLAG_LABEL,
  DRIVER_OTHER_REASON,
  DRIVER_REVIEW_REASONS,
  buildReviewGroups,
  dayRowKey,
  flagsByRow,
  formatDriverDate,
  summariseByDriver,
  summariseDay,
  type DriverDay,
  type ReviewGroup,
} from '@/lib/drivers';
import type { StoredDriverDay } from '@/lib/driverStore';
import type { DriverSaveState } from '@/hooks/useDriverDays';

interface DriversViewProps {
  reportDays: DriverDay[];
  hasReport: boolean;
  stored: StoredDriverDay[];
  loading: boolean;
  saveState: DriverSaveState;
  isAdmin: boolean;
  onReview: (ids: number[], note: string) => Promise<boolean>;
  onReopen: (ids: number[]) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  onRetrySave: () => void;
}

const HISTORY_LIST_LIMIT = 300;
const todayIso = () => new Date().toISOString().slice(0, 10);

function ReviewCard({ group, reviewed, ids, onReview, onReopen }: {
  group: ReviewGroup<StoredDriverDay>;
  reviewed: boolean;
  ids: number[];
  onReview: DriversViewProps['onReview'];
  onReopen: DriversViewProps['onReopen'];
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const needsNote = reason === DRIVER_OTHER_REASON;
  const canSave = !!reason && (!needsNote || !!note.trim()) && ids.length > 0;
  const savedNote = group.rows.find((r) => r.reviewNote)?.reviewNote;
  const savedBy = group.rows.find((r) => r.reviewedBy)?.reviewedBy;

  const confirm = async () => {
    setBusy(true);
    const text = needsNote ? `${reason}: ${note.trim()}` : reason;
    await onReview(ids, text);
    setBusy(false);
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <div className="min-w-[240px] flex-1">
        <p className="text-sm font-medium text-ink">{group.title}</p>
        <p className="text-xs text-ink-3">
          {formatDriverDate(group.date)} · {DRIVER_FLAG_LABEL[group.kind]}
          {reviewed && savedBy ? ` · reviewed by ${savedBy}` : ''}
          {reviewed && savedNote ? ` · ${savedNote}` : ''}
        </p>
      </div>
      {reviewed ? (
        <button onClick={async () => { setBusy(true); await onReopen(ids); setBusy(false); }} disabled={busy} className="btn-ghost h-8 px-2.5 text-xs">
          <RotateCcw className="h-3.5 w-3.5" /> Reopen
        </button>
      ) : group.kind === 'no_vehicle' ? (
        <span className="text-xs text-ink-3">Fix the vehicle on the report and load it again.</span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Review reason" className="field h-8 w-60 py-0 text-xs">
            <option value="">Choose a reason</option>
            {DRIVER_REVIEW_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {needsNote && <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Describe the reason" placeholder="Describe what happened" className="field h-8 w-48 py-0 text-xs" />}
          <button onClick={confirm} disabled={!canSave || busy} className="btn-primary h-8 px-3 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> Mark reviewed
          </button>
        </div>
      )}
    </li>
  );
}

export function DriversView(props: DriversViewProps) {
  const { reportDays, hasReport, stored, loading, saveState, isAdmin, onReview, onReopen, onDelete, onRetrySave } = props;
  const [tab, setTab] = useState<'report' | 'history'>(hasReport ? 'report' : 'history');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showReviewed, setShowReviewed] = useState(false);

  const groups = useMemo(() => buildReviewGroups(stored), [stored]);
  const idsFor = (g: ReviewGroup<StoredDriverDay>) => g.rows.map((r) => r.id);
  const isReviewed = (g: ReviewGroup<StoredDriverDay>) => g.kind !== 'no_vehicle' && g.rows.every((r) => !!r.reviewedAt);
  const open = groups.filter((g) => !isReviewed(g));
  const done = groups.filter(isReviewed);

  const flags = useMemo(() => flagsByRow(stored), [stored]);
  const reportFlags = useMemo(() => flagsByRow(reportDays), [reportDays]);

  const reportDates = useMemo(() => [...new Set(reportDays.map((d) => d.date))].sort().reverse(), [reportDays]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => stored.filter((r) => (!from || r.date >= from) && (!to || r.date <= to) && (!q || r.driverName.toLowerCase().includes(q) || r.vehicle.toLowerCase().includes(q))),
    [stored, from, to, q],
  );
  const summary = useMemo(() => summariseByDriver(filtered), [filtered]);

  const remove = async (row: StoredDriverDay) => {
    if (window.confirm(`Delete ${row.driverName} on ${row.vehicle} for ${formatDriverDate(row.date)}? This cannot be undone.`)) await onDelete(row.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="tablist">
          {([['report', 'Report days'], ['history', 'History']] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${tab === key ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-ink-3">
          {saveState === 'saving' && 'Saving this report’s driver days…'}
          {saveState === 'saved' && 'This report’s driver days are saved to the history.'}
          {saveState === 'error' && (<>Could not save this report’s driver days. <button onClick={onRetrySave} className="font-medium text-accent underline">Try again</button></>)}
          {loading && saveState !== 'saving' && ' Loading history…'}
        </span>
      </div>

      {(open.length > 0 || done.length > 0) && (
        <section className="rounded-xl border border-line bg-surface">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <AlertTriangle className={`h-4 w-4 ${open.length ? 'text-amber-500' : 'text-ink-3'}`} />
            <h2 className="text-sm font-semibold">{open.length ? `${open.length} to review` : 'Nothing to review'}</h2>
            {done.length > 0 && (
              <button onClick={() => setShowReviewed((s) => !s)} className="ml-auto text-xs font-medium text-accent hover:underline">
                {showReviewed ? 'Hide' : 'Show'} {done.length} reviewed
              </button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {open.map((g) => <ReviewCard key={g.id} group={g} reviewed={false} ids={idsFor(g)} onReview={onReview} onReopen={onReopen} />)}
            {showReviewed && done.map((g) => <ReviewCard key={g.id} group={g} reviewed ids={idsFor(g)} onReview={onReview} onReopen={onReopen} />)}
          </ul>
        </section>
      )}

      {tab === 'report' && (
        !hasReport ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-3">Load a report to see who was out on the road and in which vehicle.</p>
        ) : reportDays.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-3">This report has no driver or delivery date columns, so no drivers could be listed.</p>
        ) : (
          reportDates.map((date) => {
            const rows = reportDays.filter((d) => d.date === date);
            const totals = summariseDay(rows);
            return (
              <section key={date} className="rounded-xl border border-line bg-surface">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5">
                  <h2 className="text-sm font-semibold">{formatDriverDate(date)}</h2>
                  <span className="inline-flex items-center gap-1.5 text-sm text-ink-2"><Truck className="h-4 w-4 text-ink-3" />{totals.drivers} {totals.drivers === 1 ? 'driver' : 'drivers'} out · {totals.vehicles} {totals.vehicles === 1 ? 'vehicle' : 'vehicles'}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-left text-xs font-semibold text-ink-2">
                      <tr><th className="px-4 py-2">Driver</th><th className="px-4 py-2">Vehicle</th><th className="px-4 py-2 text-right">Trips</th><th className="px-4 py-2 text-right">Invoices</th><th className="px-4 py-2 text-right">Weight</th><th className="px-4 py-2">Flag</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const rowFlags = reportFlags.get(dayRowKey(r)) ?? [];
                        const firstOfDriver = i === 0 || rows[i - 1].driverKey !== r.driverKey;
                        return (
                          <tr key={dayRowKey(r)} className={`border-t border-line ${rowFlags.length ? 'bg-amber-50/60 dark:bg-amber-500/5' : ''}`}>
                            <td className="px-4 py-1.5 font-medium">{firstOfDriver ? r.driverName : <span className="text-ink-3">″</span>}</td>
                            <td className="px-4 py-1.5 font-mono text-xs">{r.vehicle || '—'}</td>
                            <td className="px-4 py-1.5 text-right font-mono text-xs">{r.tripCount}</td>
                            <td className="px-4 py-1.5 text-right font-mono text-xs">{r.invoiceCount}</td>
                            <td className="px-4 py-1.5 text-right font-mono text-xs">{r.weight.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}</td>
                            <td className="px-4 py-1.5">{rowFlags.map((f) => <span key={f} className="mr-1 inline-flex rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{DRIVER_FLAG_LABEL[f]}</span>)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )
      )}

      {tab === 'history' && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-xs font-medium text-ink-2">Driver or vehicle
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a driver or a registration" className="field mt-1" />
            </label>
            <label className="text-xs font-medium text-ink-2">From
              <input type="date" value={from} max={to || todayIso()} onChange={(e) => setFrom(e.target.value)} className="field mt-1" />
            </label>
            <label className="text-xs font-medium text-ink-2">To
              <input type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} className="field mt-1" />
            </label>
            {(search || from || to) && <button onClick={() => { setSearch(''); setFrom(''); setTo(''); }} className="btn-ghost h-10 px-3 text-xs">Clear</button>}
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-3">{stored.length === 0 ? 'No driver days saved yet. Load a report and they are added automatically.' : 'Nothing matches that search.'}</p>
          ) : (
            <>
              <section className="rounded-xl border border-line bg-surface">
                <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Vehicles each driver used</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-left text-xs font-semibold text-ink-2"><tr><th className="px-4 py-2">Driver</th><th className="px-4 py-2 text-right">Days out</th><th className="px-4 py-2">Vehicles (days used)</th></tr></thead>
                    <tbody>
                      {summary.map((s) => (
                        <tr key={s.driverKey} className="border-t border-line">
                          <td className="px-4 py-1.5 font-medium">{s.driverName}</td>
                          <td className="px-4 py-1.5 text-right font-mono text-xs">{s.days}</td>
                          <td className="px-4 py-1.5">
                            {s.vehicles.map((v) => (
                              <span key={v.vehicle} className="mr-2 inline-block font-mono text-xs" title={`${formatDriverDate(v.first)} to ${formatDriverDate(v.last)}`}>{v.vehicle} <span className="text-ink-3">×{v.days}</span></span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border border-line bg-surface">
                <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">
                  Day by day <span className="font-normal text-ink-3">· {filtered.length.toLocaleString()} {filtered.length === 1 ? 'entry' : 'entries'}{filtered.length > HISTORY_LIST_LIMIT ? `, showing the latest ${HISTORY_LIST_LIMIT}` : ''}</span>
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-left text-xs font-semibold text-ink-2"><tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Driver</th><th className="px-4 py-2">Vehicle</th><th className="px-4 py-2 text-right">Invoices</th><th className="px-4 py-2">Flag</th>{isAdmin && <th className="w-10 px-2 py-2"><span className="sr-only">Delete</span></th>}</tr></thead>
                    <tbody>
                      {filtered.slice(0, HISTORY_LIST_LIMIT).map((r) => {
                        const rowFlags = flags.get(dayRowKey(r)) ?? [];
                        return (
                          <tr key={r.id} className="border-t border-line">
                            <td className="whitespace-nowrap px-4 py-1.5">{formatDriverDate(r.date)}</td>
                            <td className="px-4 py-1.5 font-medium">{r.driverName}</td>
                            <td className="px-4 py-1.5 font-mono text-xs">{r.vehicle}</td>
                            <td className="px-4 py-1.5 text-right font-mono text-xs">{r.invoiceCount}</td>
                            <td className="px-4 py-1.5">
                              {rowFlags.map((f) => <span key={f} className={`mr-1 inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${r.reviewedAt ? 'bg-surface-3 text-ink-2' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'}`}>{DRIVER_FLAG_LABEL[f]}{r.reviewedAt ? ' · reviewed' : ''}</span>)}
                            </td>
                            {isAdmin && (
                              <td className="px-2 py-1.5">
                                <button onClick={() => remove(r)} className="btn-ghost h-7 w-7 p-0" aria-label={`Delete ${r.driverName} on ${r.vehicle} for ${r.date}`} title="Delete this entry"><Trash2 className="h-3.5 w-3.5" /></button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
