import { useMemo, useRef, useState } from 'react';
import { CloudUpload, FileSpreadsheet, KeyRound, Loader2, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { aggregateMasterRows, masterAccountCount } from '@/lib/master';
import { readTable } from '@/lib/workbook';
import { publishAdditions } from '@/lib/masterSync';
import type { MasterData } from '@/lib/types';
import { normalizeAccountKey } from '@/lib/rules';

interface MasterModalProps {
  master: MasterData;
  initialTab: 'search' | 'manage';
  onClose: () => void;
  onUseLocal: (master: MasterData, fileName: string) => void;
  onPublished: (master: MasterData, addedCount: number) => void;
  onError: (message: string) => void;
}

const MASTER_REQUIRED = ['Customer', 'Territory'] as const;

export function MasterModal({ master, initialTab, onClose, onUseLocal, onPublished, onError }: MasterModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'search' | 'manage'>(initialTab);
  const [query, setQuery] = useState('');
  const [local, setLocal] = useState<{ data: MasterData; fileName: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState('');
  const [publishing, setPublishing] = useState(false);
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const normalizedAccountTerm = normalizeAccountKey(term).toLowerCase();
    return Object.entries(master.territory)
      .map(([account, territory]) => {
        const info = master.accountInfo[account] ?? { customer: '', address: '' };
        const ambiguousTerritories = master.ambiguousDetail[account] ?? [];
        return { account, territory, info, ambiguousTerritories };
      })
      .filter(({ account, territory, info, ambiguousTerritories }) =>
        account.toLowerCase().includes(term) || normalizeAccountKey(account).toLowerCase().includes(normalizedAccountTerm) ||
        [territory, info.customer, info.address, ...ambiguousTerritories]
          .join(' ')
          .toLowerCase()
          .includes(term),
      )
      .sort((a, b) => a.account.localeCompare(b.account, undefined, { numeric: true }))
      .slice(0, 60);
  }, [master, query]);

  const loadFile = async (file: File) => {
    setReading(true);
    setReadError(null);
    try {
      const parsed = await readTable(file, 'Customer', MASTER_REQUIRED);
      setLocal({ data: aggregateMasterRows(parsed.rows, false), fileName: file.name });
    } catch (err) {
      setReadError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setReading(false);
    }
  };

  const publish = async () => {
    if (!local || !uploadKey.trim()) return;
    setPublishing(true);
    try {
      const { master, added } = await publishAdditions(local.data, uploadKey.trim());
      onPublished(master, added.length);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Publishing failed.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Modal
      title="Master file"
      subtitle="Search the current master file or load a different spreadsheet."
      onClose={onClose}
      width="lg"
      footer={
        tab === 'manage' && local && (
          <>
            <button onClick={() => onUseLocal(local.data, local.fileName)} className="btn-secondary">
              Use for this session
            </button>
            <button onClick={publish} disabled={!uploadKey.trim() || publishing} className="btn-primary">
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              Publish new accounts
            </button>
          </>
        )
      }
    >
      <div className="mb-5 inline-flex rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Master file options">
        <button role="tab" aria-selected={tab === 'search'} onClick={() => setTab('search')} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === 'search' ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}>
          <Search className="mr-2 inline h-4 w-4" /> Search accounts
        </button>
        <button role="tab" aria-selected={tab === 'manage'} onClick={() => setTab('manage')} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === 'manage' ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}>
          <FileSpreadsheet className="mr-2 inline h-4 w-4" /> Update master
        </button>
      </div>

      {tab === 'search' ? (
        <div className="space-y-4">
          <label className="sr-only" htmlFor="master-account-search">Search master accounts</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input id="master-account-search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Account number, customer, address, or territory" className="field pl-9" />
          </div>
          {!query.trim() ? (
            <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">Search the {masterAccountCount(master).toLocaleString()} accounts in the current master file.</p>
          ) : matches.length === 0 ? (
            <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">No matching master accounts.</p>
          ) : (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              <p className="text-xs text-ink-3">Showing {matches.length} account matches{matches.length === 60 ? ' (maximum shown)' : ''}</p>
              {matches.map(({ account, territory, info, ambiguousTerritories }) => (
                <div key={account} className="rounded-xl border border-line bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">{account}</p>
                      <p className="mt-0.5 text-sm text-ink-2">{info.customer || 'Customer name not listed'}</p>
                      {info.address && <p className="mt-0.5 text-xs text-ink-3">{info.address}</p>}
                    </div>
                    <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${ambiguousTerritories.length > 1 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-accent-soft text-accent-ink'}`}>
                      {ambiguousTerritories.length > 1 ? `Possible territories: ${ambiguousTerritories.join(', ')}` : `Territory ${territory}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : !local ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !reading && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) loadFile(file);
          }}
          className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-6 py-10 text-center transition-colors hover:border-accent"
        >
          {reading ? <Loader2 className="h-6 w-6 animate-spin text-accent" /> : <FileSpreadsheet className="h-6 w-6 text-accent" />}
          <p className="text-sm font-medium">{reading ? 'Reading master file...' : 'Choose or drop the master spreadsheet'}</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadFile(file);
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Accounts in file" value={masterAccountCount(local.data).toLocaleString()} />
            <Stat label="Tied territories" value={local.data.ambiguousAccounts.length.toLocaleString()} />
          </div>
          <p className="truncate text-xs text-ink-3">{local.fileName}</p>
          <div className="space-y-2">
            <label htmlFor="upload-key" className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-ink-3" /> Upload key
            </label>
            <input
              id="upload-key"
              type="password"
              value={uploadKey}
              onChange={(e) => setUploadKey(e.target.value)}
              placeholder="Needed only to publish to the server"
              className="field"
              autoComplete="off"
            />
            <p className="text-xs text-ink-3">Only accounts the server does not have yet are added. Existing entries are kept.</p>
          </div>
        </div>
      )}
      {readError && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{readError}</p>}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold">{value}</p>
    </div>
  );
}
