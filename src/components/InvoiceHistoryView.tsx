import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Database, FileUp, Loader2, Search, Truck, XCircle } from 'lucide-react';
import { readReport } from '@/lib/workbook';
import { INVOICE_RULES, isSuperstructInvoice, normalizeAccountKey } from '@/lib/rules';
import { parseDeliveryDate } from '@/lib/drivers';
import { supabase } from '@/lib/supabase';
import type { RawRow } from '@/lib/types';

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
    return [...map.values()];
  }, [events]);

  const importReport = async (file: File) => {
    setUploading(true); setUploadError(''); setProgress('Reading report…');
    try {
      const parsed = await readReport(file);
      const since = dateInJohannesburgDaysAgo(29);
      const today = dateInJohannesburgDaysAgo(0);
      const datedRows = parsed.rows.map((row) => ({ row, date: parseDeliveryDate(row['Delivery Date']) }));
      const undated = datedRows.filter((x) => !x.date).length;
      const inRange = datedRows.filter((x) => x.date && x.date >= since && x.date <= today);
      const outside = datedRows.filter((x) => x.date && (x.date < since || x.date > today)).length;
      if (outside > 0) throw new Error(`This report includes ${outside.toLocaleString()} rows outside the last 30 days (${since} to ${today}). No rows were imported. Export a clean 30-day report.`);
      if (!inRange.length) throw new Error(`No dated rows found within the allowed window (${since} to ${today}). Nothing was imported.`);
      const unique = new Map<string, ArchiveWrite>();
      for (const { row, date } of inRange) {
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
      if (!prepared.length) throw new Error('No valid invoice numbers were found in the 30-day report. Nothing was imported.');
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
      notify(`Invoice history refreshed with ${payload.length.toLocaleString()} valid invoice events`, 'success', `${since} to ${today}${undated ? ` · skipped ${undated} rows without delivery dates` : ''}`);
      setRefreshToken((value) => value + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import this report.';
      setUploadError(message); notify('Invoice history was not fully refreshed', 'error', message);
    } finally { setUploading(false); setProgress(''); if (inputRef.current) inputRef.current.value = ''; }
  };

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold tracking-wide text-accent">PERMANENT INVOICE DATABASE</p><h2 className="mt-1 text-2xl font-semibold">Invoice history</h2><p className="mt-2 max-w-2xl text-sm text-ink-2">Search invoice events across archived reports. Only refresh this database with a separate report covering the last 30 days. Daily review uploads do not update it.</p></div>
        <button onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-primary min-h-11"><FileUp className="h-4 w-4"/>{uploading ? 'Refreshing…' : 'Refresh last 30 days'}</button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) void importReport(file); }}/>
      </div>
      <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">Delivery result is determined from <b>Details</b>: blank means delivered; “Delivery Failed” means failed; any other text is unconfirmed. The spreadsheet Status field is ignored.</p>
      {(progress || uploadError) && <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${uploadError ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-accent-soft text-accent-ink'}`}>{uploadError ? <AlertCircle className="h-4 w-4 shrink-0"/> : <Loader2 className="h-4 w-4 animate-spin"/>}{progress || uploadError}</div>}
    </section>
    <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-ink-3"/><input className="field pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice number, account, or customer"/></label>
    {loadError && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">{loadError}</div>}
    <div className="flex items-center gap-2 text-sm text-ink-2">{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Database className="h-4 w-4"/>}{grouped.length.toLocaleString()} invoice{grouped.length === 1 ? '' : 's'} shown{events.length === 200 ? ' · showing the latest 200 matches' : ''}</div>
    <div className="grid gap-3">{grouped.map((group) => {
      const first = group[0]; const delivered = group.filter((e) => e.outcome === 'delivered').length; const failed = group.filter((e) => e.outcome === 'failed').length; const other = group.filter((e) => e.outcome === 'other').length;
      return <article key={`${first.account_no}-${first.invoice_no}`} className="rounded-xl border border-line bg-surface p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-mono text-lg font-semibold">{first.invoice_no}</h3><p className="mt-1 text-sm font-medium">{first.customer_name || 'Customer name unavailable'} <span className="font-mono text-ink-3">· {first.account_no}</span></p></div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5"/>{delivered} delivered</span><span className="rounded-md bg-red-50 px-2 py-1 text-red-800 dark:bg-red-500/15 dark:text-red-200"><XCircle className="mr-1 inline h-3.5 w-3.5"/>{failed} failed</span>{other > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{other} unconfirmed</span>}</div></div>
        <ol className="mt-4 space-y-2 border-l border-line pl-4">{group.sort((a,b) => b.delivery_date.localeCompare(a.delivery_date)).map((event) => <li key={event.event_key} className="relative text-sm"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent"/><div className="flex flex-wrap items-baseline gap-x-2"><b>{event.delivery_date}</b><span className="text-ink-2">{event.outcome === 'delivered' ? 'Delivered (Details blank)' : event.outcome === 'failed' ? 'Delivery failed' : `Not confirmed · ${event.details}`}</span></div><p className="mt-0.5 text-xs text-ink-3">{event.driver_name || 'Driver unavailable'}{event.document_id ? ` · Doc ${event.document_id}` : ''}{event.vehicle ? ` · ${event.vehicle}` : ''}</p></li>)}</ol>
      </article>;
    })}</div>
    {!loading && !loadError && !grouped.length && <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center text-sm text-ink-3"><Clock3 className="mx-auto mb-3 h-6 w-6"/>{query ? 'No matching invoices found in archived history.' : 'No invoice history yet. Refresh with a separate, clean report covering the last 30 days.'}</div>}
  </div>;
}

