import { useState, type ReactNode } from 'react';
import { ChevronDown, Database, FileUp, Search, Truck, X, type LucideIcon } from 'lucide-react';
import { loadCollapsedGroups, saveCollapsedGroups } from '@/lib/storage';
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
  view: 'invoices' | 'drivers';
  onOpenDrivers: () => void;
  driversOut: number;
  driversToReview: number;
}

const GROUPS: { title: string; keys: FilterKey[] }[] = [
  { title: 'Workflow', keys: ['all', 'needsaction', 'resolved', 'ok'] },
  { title: 'Invoice checks', keys: ['error', 'suspicious', 'repairs', 'cclinternal', 'zero', 'duplicate', 'weightflag'] },
  { title: 'Territory and driver', keys: ['dropship', 'mismatch', 'split', 'unknownaccount', 'ambiguous', 'multidriver', 'driverunusual', 'redelivery'] },
];

function NavItem(props: { active: boolean; disabled?: boolean; icon: LucideIcon; iconClass: string; label: string; count: number; onClick: () => void; extra?: ReactNode }) {
  const { active, disabled, icon: Icon, iconClass, label, count, onClick, extra } = props;
  const quiet = count === 0 && !active;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
        active ? 'bg-accent-soft font-semibold text-accent-ink shadow-[inset_3px_0_0_var(--accent)]' : `${quiet ? 'text-ink-2' : 'font-medium text-ink'} hover:bg-surface-2`
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent' : iconClass}`} />
      <span className="flex-1 truncate">{label}</span>
      {extra}
      <span
        className={`min-w-[1.75rem] rounded-md px-1.5 text-center font-mono text-xs ${
          active ? 'bg-accent text-white' : quiet ? 'bg-surface-3 text-ink-3' : 'bg-accent-soft font-semibold text-accent-ink'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export function Sidebar(props: SidebarProps) {
  const { open, onClose, filter, counts, onFilter, masterStatus, masterCount, hasReport, fileName, onNewReport, onOpenMaster, onOpenAccountSearch, isAdmin, view, onOpenDrivers, driversOut, driversToReview } = props;
  const byKey = Object.fromEntries(FILTERS.map((f) => [f.key, f]));
  const [collapsed, setCollapsed] = useState<string[]>(loadCollapsedGroups);
  const toggleGroup = (title: string) =>
    setCollapsed((prev) => {
      const next = prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title];
      saveCollapsedGroups(next);
      return next;
    });

  const renderGroup = (group: { title: string; keys: FilterKey[] }) => {
    const isCollapsed = collapsed.includes(group.title);
    return (
      <div key={group.title}>
        <button onClick={() => toggleGroup(group.title)} aria-expanded={!isCollapsed} className="flex w-full items-center gap-1 px-3 pb-1.5 text-left text-xs font-semibold text-ink hover:text-accent">
          <ChevronDown className={`h-3.5 w-3.5 text-ink-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
          {group.title}
        </button>
        {!isCollapsed && (
          <ul className="space-y-0.5">
            {group.keys.map((key) => {
              const def = byKey[key];
              return (
                <li key={key}>
                  <NavItem active={view === 'invoices' && filter === key} disabled={!hasReport} icon={def.icon} iconClass={def.text} label={def.label} count={counts[key] ?? 0} onClick={() => onFilter(key)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

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

        <nav className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-3 pb-6">
          {GROUPS.slice(0, 1).map((group) => renderGroup(group))}

          <div>
            <p className="px-3 pb-1.5 text-xs font-semibold text-ink">Drivers</p>
            <NavItem
              active={view === 'drivers'}
              icon={Truck}
              iconClass="text-teal-600 dark:text-teal-400"
              label="Drivers and vehicles"
              count={driversOut}
              onClick={onOpenDrivers}
              extra={driversToReview > 0 ? <span className="rounded-md bg-amber-100 px-1.5 font-mono text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" title="Waiting for review">{driversToReview}</span> : null}
            />
          </div>

          {GROUPS.slice(1).map((group) => renderGroup(group))}
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
