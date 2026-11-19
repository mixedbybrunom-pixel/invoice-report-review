import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, KeyRound, Loader2, PackageCheck, Pencil, Search, Trash2, Undo2 } from 'lucide-react';
import { masterAccountCount, masterToEnvelope } from '@/lib/master';
import { publishAccountDelete, publishAccountEdit, restoreMasterSnapshot } from '@/lib/masterSync';
import { normalizeAccountKey } from '@/lib/rules';
import type { MasterData } from '@/lib/types';

const PAGE_SIZE = 50;

interface Props {
  /** The master file as the server has it. */
  master: MasterData;
  uploadKey: string;
  onUploadKeyChange: (key: string) => void;
  /** Called with the new server master after every successful change. */
  onMasterChanged: (master: MasterData, message: string) => void;
  onError: (message: string) => void;
}

interface Draft { customer: string; address: string; territory: string; dropship: boolean }

export function MasterAccountsPanel({ master, uploadKey, onUploadKeyChange, onMasterChanged, onError }: Props) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ customer: '', address: '', territory: '', dropship: false });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ snapshot: MasterData; label: string } | null>(null);

  const dropshipSet = useMemo(() => new Set(master.dropshipAccounts), [master.dropshipAccounts]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const normTerm = normalizeAccountKey(term).toLowerCase();
    return Object.entries(master.territory)
      .map(([account, territory]) => ({
        account,
        territory,
        info: master.accountInfo[account] ?? { customer: '', address: '' },
        tied: master.ambiguousDetail[account] ?? [],
        dropship: dropshipSet.has(account),
      }))
      .filter((r) => !term
        || r.account.toLowerCase().includes(term)
        || normalizeAccountKey(r.account).toLowerCase().includes(normTerm)
        || [r.territory, r.info.customer, r.info.address, r.dropship ? 'drop ship dropship' : '', ...r.tied].join(' ').toLowerCase().includes(term))
      .sort((a, b) => a.account.localeCompare(b.account, undefined, { numeric: true }));
  }, [master, query, dropshipSet]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const shown = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const keyMissing = !uploadKey.trim();

  const startEdit = (r: (typeof rows)[number]) => {
    setConfirmDelete(null);
    setEditing(r.account);
    setDraft({ customer: r.info.customer, address: r.info.address, territory: r.territory, dropship: r.dropship });
  };

  const run = async (label: string, action: () => Promise<{ before: MasterData; after: MasterData }>, done: string) => {
    setBusy(true);
    try {
      const { before, after } = await action();
      setUndo({ snapshot: before, label });
      setEditing(null);
      setConfirmDelete(null);
      onMasterChanged(after, done);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'That change could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const save = (account: string) => {
    if (!draft.territory.trim()) { onError('Territory cannot be empty.'); return; }
    void run(`Edit of ${account}`, () => publishAccountEdit(account, {
      customer: draft.customer.trim(), address: draft.address.trim(), territory: draft.territory.trim(), dropship: draft.dropship,
    }, uploadKey.trim()), `Saved changes to account ${account}`);
  };

  const remove = (account: string) => {
    void run(`Delete of ${account}`, () => publishAccountDelete(account, uploadKey.trim()), `Deleted account ${account} from the master file`);
  };

  const doUndo = async () => {
    if (!undo) return;
    setBusy(true);
    try {
      await restoreMasterSnapshot(undo.snapshot, uploadKey.trim());
      onMasterChanged(undo.snapshot, `Undid ${undo.label}`);
      setUndo(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not undo that change.');
    } finally {
      setBusy(false);
    }
  };

  const backup = () => {
    const blob = new Blob([JSON.stringify(masterToEnvelope(master), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `master-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[240px] flex-1">
          <label htmlFor="acct-search" className="sr-only">Search accounts</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input id="acct-search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search account, customer, address or territory" className="field pl-9 text-[15px]" />
        </div>
        <div className="w-60">
          <label htmlFor="acct-key" className="mb-1 flex items-center gap-1.5 text-sm font-medium"><KeyRound className="h-4 w-4 text-ink-3" /> Upload key</label>
          <input id="acct-key" type="password" autoComplete="off" value={uploadKey} onChange={(e) => onUploadKeyChange(e.target.value)} placeholder="Needed to save changes" className="field text-[15px]" />
        </div>
        <button onClick={backup} className="btn-secondary h-10" title="Download a copy of the master file">
          <Download className="h-4 w-4" /> Backup
        </button>
      </div>

      {undo && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="flex-1">Last change: {undo.label}.</span>
          <button onClick={doUndo} disabled={busy || keyMissing} className="btn-secondary h-9"><Undo2 className="h-4 w-4" /> Undo</button>
        </div>
      )}

      <p className="text-sm text-ink-3">
        {rows.length.toLocaleString()} of {masterAccountCount(master).toLocaleString()} accounts
        {rows.length > PAGE_SIZE && ` · page ${safePage + 1} of ${pages}`}
      </p>

      <div className="space-y-2">
        {shown.length === 0 && <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">No matching accounts.</p>}
        {shown.map((r) => (
          <div key={r.account} className="rounded-xl border border-line bg-surface px-4 py-3">
            {editing === r.account ? (
              <div className="space-y-3">
                <p className="font-mono text-[15px] font-semibold">{r.account}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium">Customer
                    <input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} className="field mt-1 text-[15px]" />
                  </label>
                  <label className="block text-sm font-medium">Territory
                    <input value={draft.territory} onChange={(e) => setDraft({ ...draft, territory: e.target.value })} className="field mt-1 text-[15px]" />
                  </label>
                </div>
                <label className="block text-sm font-medium">Address
                  <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} className="field mt-1 text-[15px]" />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.dropship} onChange={(e) => setDraft({ ...draft, dropship: e.target.checked })} className="h-4 w-4 accent-accent" />
                  Drop-ship account (any territory is accepted, but your team must confirm each drop shipment)
                </label>
                {keyMissing && <p className="text-sm text-amber-700 dark:text-amber-300">Enter the upload key above to save.</p>}
                <div className="flex gap-2">
                  <button onClick={() => save(r.account)} disabled={busy || keyMissing} className="btn-primary h-9">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
                  </button>
                  <button onClick={() => setEditing(null)} disabled={busy} className="btn-secondary h-9">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-[15px] font-semibold">
                    {r.account}
                    {r.dropship && <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 font-sans text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><PackageCheck className="h-3.5 w-3.5" /> Drop-ship</span>}
                  </p>
                  <p className="mt-0.5 text-[15px] text-ink-2">{r.info.customer || 'Customer name not listed'}</p>
                  {r.info.address && <p className="mt-0.5 text-sm text-ink-3">{r.info.address}</p>}
                </div>
                <span className={`rounded-md px-2.5 py-1 text-sm font-medium ${r.tied.length > 1 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-accent-soft text-accent-ink'}`}>
                  {r.tied.length > 1 ? `Tied: ${r.tied.join(', ')}` : `Territory ${r.territory}`}
                </span>
                {confirmDelete === r.account ? (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">
                    <span className="flex-1">Delete {r.account} from the master file?{keyMissing && ' Enter the upload key first.'}</span>
                    <button onClick={() => remove(r.account)} disabled={busy || keyMissing} className="btn-primary h-9 bg-red-600 hover:bg-red-700">
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />} Yes, delete
                    </button>
                    <button onClick={() => setConfirmDelete(null)} disabled={busy} className="btn-secondary h-9">Cancel</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(r)} className="btn-secondary h-9"><Pencil className="h-4 w-4" /> Edit</button>
                    <button onClick={() => { setEditing(null); setConfirmDelete(r.account); }} className="btn-secondary h-9 text-red-600" aria-label={`Delete ${r.account}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="btn-secondary h-9"><ChevronLeft className="h-4 w-4" /> Previous</button>
          <span className="text-sm text-ink-3">{safePage + 1} / {pages}</span>
          <button onClick={() => setPage(Math.min(pages - 1, safePage + 1))} disabled={safePage >= pages - 1} className="btn-secondary h-9">Next <ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
