import { useState } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { FILTER_BY_KEY, type FilterKey } from '@/lib/filters';

const SUMMARY_KEYS: FilterKey[] = ['all', 'needsaction', 'resolved', 'ok'];
const ISSUE_KEYS: FilterKey[] = [
  'error', 'zero', 'duplicate', 'mismatch', 'split', 'weightflag', 'suspicious',
  'repairs', 'cclinternal', 'redelivery', 'multidriver', 'driverunusual', 'ambiguous', 'unknownaccount',
];

interface StatCardsProps {
  counts: Record<FilterKey, number>;
  active: FilterKey;
  onSelect: (key: FilterKey) => void;
}

export function StatCards({ counts, active, onSelect }: StatCardsProps) {
  const [showIssues, setShowIssues] = useState(false);
  const activeIsIssue = ISSUE_KEYS.includes(active);
  const visibleIssues = ISSUE_KEYS.filter((key) => counts[key] > 0 || key === active);
  const findingTypeCount = ISSUE_KEYS.filter((key) => counts[key] > 0).length;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-2">Report overview</h2>
        {active !== 'all' && (
          <button onClick={() => onSelect('all')} className="text-xs font-medium text-accent hover:underline">
            Show all records
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SUMMARY_KEYS.map((key, i) => {
          const def = FILTER_BY_KEY[key];
          const Icon = def.icon;
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              style={{ animationDelay: `${i * 25}ms` }}
              className={`animate-pop-in group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 hover:shadow-card ${
                isActive ? 'border-accent bg-accent-soft shadow-card' : 'border-line bg-surface hover:border-line-strong'
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${def.chip}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-2">{def.label}</span>
              <span className="font-mono text-base font-semibold tabular-nums">{counts[key].toLocaleString()}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {activeIsIssue ? (
          <div className="flex h-8 items-center gap-2 px-2 text-xs text-ink-2">
            <ChevronDown className="h-3.5 w-3.5" />
            <MoreHorizontal className="h-3.5 w-3.5" />
            <span>Filtered by {FILTER_BY_KEY[active].label}</span>
            <button type="button" onClick={() => onSelect('all')} className="font-medium text-accent hover:underline">Clear</button>
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={showIssues}
            onClick={() => setShowIssues((shown) => !shown)}
            className="btn-ghost h-8 gap-1.5 px-2 text-xs"
          >
            {showIssues ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <MoreHorizontal className="h-3.5 w-3.5" />
            {showIssues ? 'Hide issue filters' : 'More issue filters'}
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">{findingTypeCount} with findings</span>
          </button>
        )}
      </div>
      {(showIssues || activeIsIssue) && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
          {visibleIssues.length > 0 ? visibleIssues.map((key, i) => {
            const def = FILTER_BY_KEY[key];
            const Icon = def.icon;
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={() => onSelect(key)}
                style={{ animationDelay: `${i * 15}ms` }}
                className={`animate-pop-in group flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                  isActive ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${def.chip}`}>
                  <Icon className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink-2">{def.label}</span>
                <span className="font-mono text-xs font-semibold tabular-nums">{counts[key].toLocaleString()}</span>
              </button>
            );
          }) : <p className="col-span-full px-2 py-2 text-xs text-ink-3">No issue types found in this report.</p>}
        </div>
      )}
    </section>
  );
}
