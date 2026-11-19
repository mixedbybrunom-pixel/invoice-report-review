import { Database, FileUp, Search, X } from 'lucide-react';
import { FILTERS, type FilterKey } from '@/lib/filters';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  filter: FilterKey;
  counts: Record<FilterKey, number>;
  onFilter: (key: FilterKey) => void;
  masterStatus: 'loading' | 'ready' | 'offline';
  masterCount: number;
  hasReport: boolean;
  fileName: string;
  onNewReport: () => void;
  onOpenMaster: () => void;
  onOpenAccountSearch: () => void;
  isAdmin: boolean;
}

const GROUPS: { title: string; keys: FilterKey[] }[] = [
  { title: 'Workflow', keys: ['all', 'needsaction', 'resolved', 'ok'] },
  { title: 'Invoice checks', keys: ['error', 'suspicious', 'repairs', 'cclinternal', 'zero', 'duplicate', 'weightflag'] },
  { title: 'Territory and driver', keys: ['mismatch', 'split', 'ambiguous', 'unknownaccount', 'multidriver', 'driverunusual', 'redelivery', 'dropship'] },
];

export function Sidebar(props: SidebarProps) {
  const { open, onClose, filter, counts, onFilter, masterStatus, masterCount, hasReport, fileName, onNewReport, onOpenMaster, onOpenAccountSearch, isAdmin } = props;
  const byKey = Object.fromEntries(FILTERS.map((f) => [f.key, f]));

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface transition-transform duration-300 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/ccl-logo.png" alt="CCL Logistics & Distribution" className="h-auto w-full max-w-[190px] object-contain object-left" />
          <button onClick={onClose} className="btn-ghost ml-auto p-1.5 md:hidden" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 pb-6">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-ink-2">{group.title}</p>
              <ul className="space-y-0.5">
                {group.keys.map((key) => {
                  const def = byKey[key];
                  const active = filter === key;
                  const Icon = def.icon;
                  return (
                    <li key={key}>
                      <button
                        onClick={() => onFilter(key)}
                        disabled={!hasReport}
                        className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                          active ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : def.text}`} />
                        <span className="flex-1 truncate">{def.label}</span>
                        <span
                          className={`min-w-[1.75rem] rounded-md px-1.5 text-center font-mono text-[11px] ${
                            active ? 'bg-accent text-white' : 'bg-surface-3 text-ink-2'
                          }`}
                        >
                          {counts[key] ?? 0}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-3 border-t border-line p-4">
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
            <span
              className={`h-2 w-2 rounded-full ${
                masterStatus === 'ready' ? 'bg-emerald-500' : masterStatus === 'offline' ? 'bg-red-500' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="flex-1">
              {masterStatus === 'ready'
                ? `Master file: ${masterCount.toLocaleString()} accounts`
                : masterStatus === 'offline'
                  ? 'Master file unavailable'
                  : 'Connecting to master file...'}
            </span>
          </div>
          {hasReport && (
            <div className="truncate px-1 text-xs text-ink-3" title={fileName}>
              {fileName}
            </div>
          )}
          {isAdmin && (
            <button onClick={onOpenMaster} className="btn-secondary w-full">
              <Database className="h-4 w-4" /> Manage master file
            </button>
          )}
          <button onClick={onOpenAccountSearch} className="btn-secondary w-full">
            <Search className="h-4 w-4" /> Search accounts
          </button>
          <button onClick={onNewReport} className="btn-secondary w-full">
            <FileUp className="h-4 w-4" /> Load new report
          </button>
        </div>
      </aside>
    </>
  );
}
