import { useEffect, useState, type ReactNode } from 'react';
import { Check, CloudUpload, Copy, RotateCcw, X } from 'lucide-react';
import { BADGE_CLASS, STATUS_LABEL, isCleared } from '@/lib/filters';
import type { Resolution, ValidatedRecord } from '@/lib/types';
import { OTHER_RESOLUTION_REASON } from '@/lib/resolutionReasons';
import { ResolutionPicker } from '@/components/ResolutionPicker';

interface DetailPanelProps {
  record: ValidatedRecord | null;
  resolution: Resolution | undefined;
  onClose: () => void;
  onResolve: (record: ValidatedRecord, reason: string, note: string) => Promise<boolean>;
  onReopen: (record: ValidatedRecord) => Promise<void>;
  onPushAccount?: (record: ValidatedRecord) => void;
}

export function DetailPanel({ record, resolution, onClose, onResolve, onReopen, onPushAccount }: DetailPanelProps) {
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record, onClose]);

  if (!record) return null;

  const resolved = resolution?.status === 'resolved';
  const cleared = isCleared(record);
  const primaryText = record.issues.find((i) => i.cls === record.primaryCls)?.status ?? 'No issues found';
  const otherFlags = record.issues.filter((i) => i.cls !== record.primaryCls).map((i) => i.status);

  const copyInvoice = async () => {
    await navigator.clipboard.writeText(record.invoiceNo);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const submitResolve = async () => {
    setSaving(true);
    try {
      if (await onResolve(record, reason, note.trim())) {
        setComposing(false);
        setReason('');
        setNote('');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[2px] animate-fade-in" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-pop animate-slide-in-right">
        <header className="flex items-center gap-2 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-2">Invoice</p>
            <h2 className="truncate font-mono text-lg font-semibold">{record.invoiceNo}</h2>
          </div>
          <button onClick={copyInvoice} className="btn-ghost px-2.5 py-2 text-xs" aria-label="Copy invoice number">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </button>
          <button onClick={onClose} className="btn-ghost px-2.5 py-2" aria-label="Close details">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                  BADGE_CLASS[record.primaryCls] ?? BADGE_CLASS.ok
                }`}
              >
                {cleared ? 'Clean' : STATUS_LABEL[record.primaryCls] ?? record.primaryCls}
              </span>
              {resolved && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <Check className="h-3 w-3" /> Resolved
                </span>
              )}
            </div>
            <p className="text-sm text-ink-2">{primaryText}</p>
          </section>

          <section className="divide-y divide-line rounded-xl border border-line">
            <Row label="Driver" value={record.driverName} />
            <Row label="Customer" value={record.customer} />
            <Row label="Account" value={record.account} mono />
            <Row label="Territory" value={record.territory} mono />
            <Row label="Weight" value={record.weight.toLocaleString()} mono />
            <Row label="Quantity" value={String(record.qty)} mono />
            <Row label="Document ID" value={record.documentId} mono />
            <Row label="Vehicle" value={record.vehicle} mono />
            <Row label="Address" value={record.address} />
            {record.details && <Row label="Details" value={record.details} />}
          </section>

          {otherFlags.length > 0 && (
            <Block title="Other flags">
              <ul className="flex flex-wrap gap-2">
                {otherFlags.map((text, i) => (
                  <li key={i} className="rounded-md bg-surface-2 px-2.5 py-1 text-xs text-ink-2">
                    {text}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {record.isUnknownAccount && onPushAccount && (
            <Block title="Account not in master file">
              <p>This account is not in the master file yet. Push it so future reports recognise it.</p>
              <button onClick={() => onPushAccount(record)} className="btn-secondary mt-3 h-9 text-xs">
                <CloudUpload className="h-4 w-4" /> Push account to master file
              </button>
            </Block>
          )}

          {record.mismatchInfo && (
            <Block title="Territory history">
              Master file expects <b>{record.mismatchInfo.expected}</b>. This account was seen in{' '}
              <b>{record.mismatchInfo.seen}</b> for {record.mismatchInfo.seenPct.toFixed(0)}% of its rows.
            </Block>
          )}
          {record.driverConfidenceInfo && record.isDriverUnusual && (
            <Block title="Usual driver">
              Usually <b>{record.driverConfidenceInfo.topDriver}</b> ({record.driverConfidenceInfo.topPct.toFixed(0)}% of{' '}
              {record.driverConfidenceInfo.sampleSize} trips).
            </Block>
          )}
          {record.multiDriver && (
            <Block title={`Served by ${record.multiDriver.drivers.length} drivers`}>
              {record.multiDriver.drivers.map((d) => `${d.driver} (${d.count})`).join(', ')}
            </Block>
          )}
          {record.duplicateSiblings.length > 0 && (
            <Block title="Same invoice appears again">
              <ul className="space-y-1">
                {record.duplicateSiblings.map((d, i) => (
                  <li key={i}>
                    {d.driver} · {d.account || '-'} · {d.documentId}
                    {d.crossAccount && <span className="text-red-600 dark:text-red-400"> (different account)</span>}
                  </li>
                ))}
              </ul>
            </Block>
          )}
          {record.splitSiblings.length > 0 && (
            <Block title="Other invoices on this account">
              <ul className="space-y-1">
                {record.splitSiblings.slice(0, 8).map((s) => (
                  <li key={s.invoice} className="font-mono text-xs">
                    {s.invoice} · {s.territory} · {s.driver || '-'}
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </div>

        <footer className="border-t border-line bg-surface px-4 py-3">
          {resolved ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">
                <p>Resolved {formatDate(resolution?.resolvedAt)}{resolution?.resolvedBy ? ` · ${resolution.resolvedBy}` : ''}</p>
                {resolution?.reason && <p className="mt-1 font-medium text-ink">{resolution.reason}</p>}
                {resolution?.note && <p className="mt-1 text-ink-3">{resolution.note}</p>}
              </div>
              <button onClick={async () => { setSaving(true); try { await onReopen(record); } finally { setSaving(false); } }} disabled={saving} className="btn-secondary h-9 w-full text-xs">
                <RotateCcw className="h-4 w-4" /> Reopen for review
              </button>
            </div>
          ) : composing ? (
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-ink-2" htmlFor="resolve-reason">
                Resolution
              </label>
              <ResolutionPicker label="Resolution" value={reason} onChange={setReason} placement="top" />
              <label className="block text-[11px] font-bold text-ink-2" htmlFor="resolve-note">
                {reason === OTHER_RESOLUTION_REASON ? 'Please describe the resolution' : 'Additional note (optional)'}
              </label>
              <textarea
                id="resolve-note"
                autoFocus
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required={reason === OTHER_RESOLUTION_REASON}
                placeholder={reason === OTHER_RESOLUTION_REASON ? 'Describe what was done' : 'Add any helpful context'}
                className="field resize-none py-1.5 text-xs"
              />
              <div className="flex gap-2">
                <button onClick={() => { setComposing(false); setReason(''); setNote(''); }} disabled={saving} className="btn-secondary h-9 flex-1 text-xs">
                  Cancel
                </button>
                <button onClick={submitResolve} disabled={saving || !reason || (reason === OTHER_RESOLUTION_REASON && !note.trim())} className="btn-secondary h-9 flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
                  <Check className="h-4 w-4" /> {saving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setComposing(true)} disabled={saving} className="btn-primary w-full">
              <Check className="h-4 w-4" /> Mark as resolved
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-4 py-2.5 text-sm">
      <span className="text-ink-3">{label}</span>
      <span className={`min-w-0 break-words text-ink ${mono ? 'font-mono text-[13px]' : ''}`}>{value || '-'}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-2">{title}</h3>
      <div className="rounded-xl bg-surface-2 p-4 text-sm text-ink-2">{children}</div>
    </section>
  );
}

function formatDate(iso: string | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
