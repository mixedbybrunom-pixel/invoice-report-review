import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, Database, FileUp, Loader2, Search, XCircle } from 'lucide-react';
import { readReport } from '@/lib/workbook';
import { INVOICE_RULES, isSuperstructInvoice, normalizeAccountKey } from '@/lib/rules';
import { parseDeliveryDate } from '@/lib/drivers';
import { supabase } from '@/lib/supabase';
import type { RawRow } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';

type ArchiveEvent = {
  event_key: string; invoice_no: string; account_no: string; customer_name: string;
  customer_address: string; document_id: string; delivery_date: string; driver_name: string;
  vehicle: string; weight: number | null; quantity: number | null; details: string;
  source_report_name: string;
  outcome: 'delivered' | 'failed' | 'other';
};
type ArchiveWrite = Omit<ArchiveEvent, 'event_key' | 'outcome'>;
type ArchiveUpsert = ArchiveWrite & Pick<ArchiveEvent, 'event_key'>;

const str = (v: unknown) => String(v ?? '').trim();
const isValidInvoice = (row: RawRow, invoice: string, account: string) =>
  INVOICE_RULES.repairs.test(invoice) || INVOICE_RULES.repairCollections.test(invoice) ||
  INVOICE_RULES.collections.test(invoice) || INVOICE_RULES.internal.test(invoice) ||
  (INVOICE_RULES.valid8.test(invoice) && INVOICE_RULES.validStart.test(invoice)) ||
  INVOICE_RULES.validNew7.test(invoice) || isSuperstructInvoice(account, invoice);

function dateInJohannesburgDaysAgo(days: number) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }));
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - days);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function makeEventKey(row: Omit<ArchiveEvent, 'event_key' | 'outcome'>) {
  const stable = [row.invoice_no, row.account_no, row.delivery_date, row.document_id, row.driver_name, row.vehicle, row.details].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function InvoiceHistoryView({ notify }: { notify: (message: string, kind?: 'success' | 'error', detail?: string) => void }) {
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<ArchiveEvent[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<ArchiveEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setLoadError('');
      const q = query.trim();
      const columns = ['invoice_no', 'account_no', 'customer_name'] as const;
      const results = await Promise.all(columns.map((column) => supabase.from('invoice_archive_events').select('*').ilike(column, `%${q}%`).order('delivery_date', { ascending: false }).limit(q ? 100 : 200)));
      if (!active) return;
      const error = results.find((result) => result.error)?.error;
      if (error) setLoadError(error.message.includes('invoice_archive_events') ? 'Invoice history is not initialized yet. Apply the invoice archive database migration, then reload.' : error.message);
      else {
        const merged = new Map<string, ArchiveEvent>();
        for (const result of results) for (const row of result.data ?? []) merged.set(row.event_key, row as ArchiveEvent);
        setEvents([...merged.values()].sort((a, b) => b.delivery_date.localeCompare(a.delivery_date)).slice(0, 200));
      }
      setLoading(false);
    };
    const timer = window.setTimeout(() => { void load(); }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, refreshToken]);

  const grouped = useMemo(() => {
    const map = new Map<string, ArchiveEvent[]>();
    for (const event of events) {
      const key = `${event.account_no}\u0000${event.invoice_no}`;
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return [...map.values()].map((group) => group.sort((a, b) => b.delivery_date.localeCompare(a.delivery_date)));
  }, [events]);

  const importReport = async (file: File) => {
    setUploading(true); setUploadError(''); setProgress('Reading report…');
    try {
      const parsed = await readReport(file);
      const today = dateInJohannesburgDaysAgo(0);
      const datedRows = parsed.rows.map((row) => ({ row, date: parseDeliveryDate(row['Delivery Date']) }));
      const undated = datedRows.filter((x) => !x.date).length;
      const futureRows = datedRows.filter((x) => x.date && x.date > today).length;
      if (futureRows > 0) throw new Error(`This report includes ${futureRows.toLocaleString()} future-dated rows. No rows were imported.`);
      const skippedToday = datedRows.filter((x) => x.date === today).length;
      const historicalRows = datedRows.filter((x) => x.date && x.date < today);
      if (!historicalRows.length) throw new Error('No historical rows found. Rows dated today are not imported; nothing was saved.');
      const unique = new Map<string, ArchiveWrite>();
      for (const { row, date } of historicalRows) {
        if (!date) continue;
        const invoice = str(row['Invoice No']).toUpperCase();
        const account = normalizeAccountKey(row['Customer']);
        if (!isValidInvoice(row, invoice, account)) continue;
        const details = str(row['Details']);
        const base = {
          invoice_no: invoice, account_no: account, customer_name: str(row['Customer Name']),
          customer_address: str(row['Customer Address']), document_id: str(row['Document ID']),
          delivery_date: date, driver_name: str(row['Driver Name']), vehicle: str(row['Vehicle']),
          source_report_name: file.name,
          weight: Number.parseFloat(str(row['Weight']).replace(/[^0-9.-]/g, '')) || null,
          quantity: Number.parseInt(str(row['Invoice Qty']), 10) || null, details,
        };
        unique.set([invoice, account, date, base.document_id, base.driver_name, base.vehicle, details].join('|'), base);
      }
      const prepared = [...unique.values()];
      if (!prepared.length) throw new Error('No valid invoice numbers were found in this report. Nothing was imported.');
      const payload: ArchiveUpsert[] = [];
      for (let i = 0; i < prepared.length; i += 1) {
        const row = prepared[i];
        payload.push({ ...row, event_key: await makeEventKey(row) });
      }
      const chunks = Array.from({ length: Math.ceil(payload.length / 400) }, (_, i) => payload.slice(i * 400, (i + 1) * 400));
      for (let i = 0; i < chunks.length; i += 1) {
        const { error } = await supabase.from('invoice_archive_events').upsert(chunks[i], { onConflict: 'event_key' });
        if (error) throw new Error(`Import stopped at batch ${i + 1}/${chunks.length}: ${error.message}`);
        setProgress(`Saving batch ${i + 1} of ${chunks.length} · ${Math.min((i + 1) * 400, payload.length).toLocaleString()} of ${payload.length.toLocaleString()} invoices`);
      }
      setProgress('');
      const throughYesterday = dateInJohannesburgDaysAgo(1);
      notify(`Invoice history refreshed with ${payload.length.toLocaleString()} valid invoice events`, 'success', `Data through ${throughYesterday}${skippedToday ? ` · skipped ${skippedToday.toLocaleString()} rows dated today` : ''}${undated ? ` · skipped ${undated.toLocaleString()} rows without delivery dates` : ''}`);
      setRefreshToken((value) => value + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import this report.';
      setUploadError(message); notify('Invoice history was not fully refreshed', 'error', message);
    } finally { setUploading(false); setProgress(''); if (inputRef.current) inputRef.current.value = ''; }
  };

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold tracking-wide text-accent">INVOICE DATABASE</p><h2 className="mt-1 text-2xl font-semibold">Invoice history</h2><p className="mt-2 max-w-2xl text-sm text-ink-2">Search invoice events across archived reports. Upload a separate, clean report of any length; rows dated today are skipped. Daily review uploads do not update this archive.</p></div>
        <button onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-primary min-h-11"><FileUp className="h-4 w-4"/>{uploading ? 'Importing…' : 'Import report through yesterday'}</button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) void importReport(file); }}/>
      </div>
      {(progress || uploadError) && <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${uploadError ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-accent-soft text-accent-ink'}`}>{uploadError ? <AlertCircle className="h-4 w-4 shrink-0"/> : <Loader2 className="h-4 w-4 animate-spin"/>}{progress || uploadError}</div>}
    </section>
    <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-ink-3"/><input className="field pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice number, account, or customer"/></label>
    {loadError && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">{loadError}</div>}
    <div className="flex items-center gap-2 text-sm text-ink-2">{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Database className="h-4 w-4"/>}{grouped.length.toLocaleString()} invoice{grouped.length === 1 ? '' : 's'} shown{events.length === 200 ? ' · showing the latest 200 matches' : ''}</div>
    <div className="grid gap-2">{grouped.map((group) => {
      const first = group[0];
      const latest = group[0];
      const delivered = group.filter((event) => event.outcome === 'delivered').length;
      const failed = group.filter((event) => event.outcome === 'failed').length;
      const other = group.filter((event) => event.outcome === 'other').length;
      return <button
        key={`${first.account_no}-${first.invoice_no}`}
        type="button"
        onClick={() => setSelectedInvoice(group)}
        aria-label={`View ${group.length} delivery records for invoice ${first.invoice_no}`}
        className="group flex w-full flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-sm transition hover:border-accent/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:px-5"
      >
        <div className="min-w-[180px] flex-1">
          <h3 className="font-mono text-base font-semibold">{first.invoice_no}</h3>
          <p className="mt-0.5 truncate text-sm font-medium text-ink-2">{first.customer_name || 'Customer name unavailable'} <span className="font-mono text-ink-3">· {first.account_no}</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-surface-2 px-2 py-1 text-ink-2">{group.length} {group.length === 1 ? 'delivery record' : 'delivery records'}</span>
          {delivered > 0 && <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5"/>{delivered} delivered</span>}
          {failed > 0 && <span className="rounded-md bg-red-50 px-2 py-1 text-red-800 dark:bg-red-500/15 dark:text-red-200"><XCircle className="mr-1 inline h-3.5 w-3.5"/>{failed} failed</span>}
          {other > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{other} unconfirmed</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-3"><span>Latest: {latest.delivery_date} · {latest.outcome === 'delivered' ? 'Delivered' : latest.outcome === 'failed' ? 'Failed' : 'Unconfirmed'}</span><ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5"/></div>
      </button>;
    })}</div>
    {selectedInvoice && (() => {
      const first = selectedInvoice[0];
      const delivered = selectedInvoice.filter((event) => event.outcome === 'delivered').length;
      const failed = selectedInvoice.filter((event) => event.outcome === 'failed').length;
      const other = selectedInvoice.filter((event) => event.outcome === 'other').length;
      return <Modal
        title={`Invoice ${first.invoice_no}`}
        subtitle={`${first.customer_name || 'Customer name unavailable'} · Account ${first.account_no}`}
        onClose={() => setSelectedInvoice(null)}
        width="lg"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-surface-2 px-2.5 py-1.5 text-ink-2">{selectedInvoice.length} {selectedInvoice.length === 1 ? 'delivery record' : 'delivery records'}</span>
            {delivered > 0 && <span className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">{delivered} delivered</span>}
            {failed > 0 && <span className="rounded-md bg-red-50 px-2.5 py-1.5 text-red-800 dark:bg-red-500/15 dark:text-red-200">{failed} failed</span>}
            {other > 0 && <span className="rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{other} unconfirmed</span>}
          </div>
          <ol className="space-y-3">
            {selectedInvoice.map((event) => <li key={event.event_key} className="rounded-xl border border-line bg-surface-2/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-sm">{event.delivery_date}</b>
                <span className={`rounded-md px-2 py-1 text-xs font-medium ${event.outcome === 'delivered' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : event.outcome === 'failed' ? 'bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'}`}>
                  {event.outcome === 'delivered' ? 'Delivered' : event.outcome === 'failed' ? 'Delivery failed' : 'Unconfirmed'}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-2">{event.driver_name || 'Driver unavailable'}{event.vehicle ? ` · ${event.vehicle}` : ''}{event.document_id ? ` · Document ${event.document_id}` : ''}</p>
              {(event.quantity != null || event.weight != null) && <p className="mt-1 text-xs text-ink-3">{event.quantity != null ? `Quantity ${event.quantity}` : ''}{event.quantity != null && event.weight != null ? ' · ' : ''}{event.weight != null ? `Weight ${event.weight}` : ''}</p>}
              {event.details && <p className="mt-2 text-xs text-ink-3">Report note: {event.details}</p>}
              {event.source_report_name && <p className="mt-2 truncate text-xs text-ink-3" title={event.source_report_name}>Source: {event.source_report_name}</p>}
            </li>)}
          </ol>
        </div>
      </Modal>;
    })()}
    {!loading && !loadError && !grouped.length && <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center text-sm text-ink-3"><Clock3 className="mx-auto mb-3 h-6 w-6"/>{query ? 'No matching invoices found in archived history.' : 'No invoice history yet. Import a separate report; any date range is accepted, and today’s rows are skipped.'}</div>}
  </div>;
}

