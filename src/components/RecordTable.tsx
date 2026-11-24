import { useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { BADGE_CLASS, ROW_TINT, isCleared, isFlagged, type FilterKey } from '@/lib/filters';
import { normalizeAccountKey } from '@/lib/rules';
import type { IssueClass, Resolution, ValidatedRecord } from '@/lib/types';

const ROW_HEIGHT = 56;
const INITIAL_VIEWPORT_HEIGHT = 560;
const OVERSCAN = 8;

interface RecordTableProps {
  records: ValidatedRecord[];
  resolutions: Record<string, Resolution>;
  selectedId: number | null;
  checked: Set<number>;
  activeFilter: FilterKey;
  groupByAccount: boolean;
  onOpen: (record: ValidatedRecord) => void;
  onToggleChecked: (id: number) => void;
  onToggleAll: (all: boolean) => void;
}

export function RecordTable({
  records,
  resolutions,
  selectedId,
  checked,
  activeFilter,
  groupByAccount,
  onOpen,
  onToggleChecked,
  onToggleAll,
}: RecordTableProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(INITIAL_VIEWPORT_HEIGHT);
  // Newly opened reports start with every account folded. The component is
  // keyed by report id, so this empty expanded set resets on each new report.
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(() => new Set());
  const [mobileLimit, setMobileLimit] = useState(80);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isEmpty = records.length === 0;

  const accountGroups = useMemo(() => {
    const groups = new Map<string, { key: string; account: string; customers: Set<string>; records: ValidatedRecord[] }>();
    for (const record of records) {
      const rawAccount = record.account.trim();
      const comparableAccount = normalizeAccountKey(rawAccount).toLocaleLowerCase();
      const key = rawAccount
        ? `account:${comparableAccount}`
        : `customer:${record.customer.trim().toLocaleLowerCase()}|${record.address.trim().toLocaleLowerCase()}`;
      const group = groups.get(key) ?? { key, account: rawAccount ? normalizeAccountKey(rawAccount) : 'No account number', customers: new Set<string>(), records: [] };
      if (record.customer.trim()) group.customers.add(record.customer.trim());
      group.records.push(record);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.account.localeCompare(b.account, undefined, { numeric: true, sensitivity: 'base' }));
  }, [records]);

  const displayRows = useMemo(() => {
    if (!groupByAccount) return records.map((record) => ({ type: 'record' as const, record }));
    return accountGroups.flatMap((group, groupIndex) => [
      { type: 'account' as const, group, groupIndex },
      ...(expandedAccounts.has(group.key) ? group.records.map((record) => ({ type: 'record' as const, record })) : []),
    ]);
  }, [accountGroups, expandedAccounts, groupByAccount, records]);
  const accountSummaryView = groupByAccount && expandedAccounts.size === 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isEmpty]);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(displayRows.length, start + Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2);
  const slice = displayRows.slice(start, end);
  const allChecked = records.length > 0 && records.every((r) => checked.has(r.id));

  useEffect(() => setMobileLimit(80), [records, activeFilter]);

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center animate-fade-in">
        <p className="font-medium">Nothing to show here</p>
        <p className="mt-1 text-sm text-ink-3">Try another filter or clear the search box.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {groupByAccount && <div className="flex items-center justify-between gap-1 border-b border-line px-3 py-1">
        <button type="button" onClick={() => onToggleAll(!allChecked)} className="btn-ghost h-8 px-2 text-xs md:hidden">{allChecked ? 'Clear selection' : 'Select all visible'}</button>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setExpandedAccounts(new Set())} className="btn-ghost h-8 px-2 text-xs">Collapse all</button>
          <button type="button" onClick={() => setExpandedAccounts(new Set(accountGroups.map((group) => group.key)))} className="btn-ghost h-8 px-2 text-xs">Expand all</button>
        </div>
      </div>}
      <div
        className="hidden min-h-0 flex-1 flex-col overflow-hidden md:flex"
      >
      <div
        ref={scrollRef}
        onScroll={(e: UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop)}
        className="scrollbar-thin min-h-0 flex-1 overflow-auto"
      >
        <table className={`w-full ${accountSummaryView ? 'min-w-[760px]' : 'min-w-[960px]'} table-fixed border-collapse text-sm`}>
          {accountSummaryView ? (
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '43%' }} />
              <col style={{ width: '35%' }} />
            </colgroup>
          ) : (
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '23%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
          )}
          <thead className="record-table-head bg-surface-2 text-left text-xs font-semibold tracking-normal text-ink-2">
            <tr className="border-b border-line dark:border-white/[0.045]">
              <th className="w-12 px-4 py-3">
                <input type="checkbox" aria-label="Select all visible" checked={allChecked} onChange={(e) => onToggleAll(e.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />
              </th>
              {accountSummaryView ? (
                <>
                  <th className="px-3 py-3">Account</th>
                  <th className="px-3 py-3">Customer name</th>
                  <th className="px-3 py-3">Issues to fix</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-3">{groupByAccount ? 'Account / invoice' : 'Invoice'}</th>
                  <th className="px-3 py-3">Driver</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Territory</th>
                  <th className="px-3 py-3 text-right">Weight</th>
                  <th className="px-3 py-3">Status</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {start > 0 && <tr style={{ height: start * ROW_HEIGHT }} aria-hidden><td colSpan={7} /></tr>}
            {slice.map((item) => {
              if (item.type === 'account') {
                const { group, groupIndex } = item;
                const collapsed = !expandedAccounts.has(group.key);
                const customerNames = [...group.customers];
                const openRecords = group.records.filter((record) => isFlagged(record) && resolutions[String(record.id)]?.status !== 'resolved');
                const resolvedCount = group.records.filter((record) => isFlagged(record) && resolutions[String(record.id)]?.status === 'resolved').length;
                const issueCounts = new Map<string, { cls: IssueClass; count: number }>();
                for (const record of openRecords) {
                  for (const issue of record.issues) {
                    const existing = issueCounts.get(issue.status);
                    issueCounts.set(issue.status, { cls: issue.cls, count: (existing?.count ?? 0) + 1 });
                  }
                }
                const topIssues = [...issueCounts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 2);
                if (accountSummaryView) {
                  return (
                    <tr key={`account:${group.key}`} style={{ height: ROW_HEIGHT }} className="border-b border-line bg-surface-2/80 dark:border-white/[0.06] dark:bg-[#1d1d1d]">
                      <td className="px-3">
                        <button
                          type="button"
                          aria-expanded={false}
                          aria-label={`Expand account ${group.account}`}
                          onClick={() => setExpandedAccounts((prev) => new Set([...prev, group.key]))}
                          className="flex items-center gap-1 text-left"
                        >
                          <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-surface px-1 font-mono text-[11px] font-semibold text-ink-3">{groupIndex + 1}</span>
                        </button>
                      </td>
                      <td className="px-3 font-mono text-xs font-semibold text-ink">{group.account}</td>
                      <td className="px-3 text-xs text-ink-2" title={customerNames.join(' · ')}>
                        <div className="truncate">{customerNames.slice(0, 2).join(' · ') || 'Customer name not listed'}{customerNames.length > 2 ? ` · +${customerNames.length - 2} names` : ''}</div>
                      </td>
                      <td className="px-3">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {topIssues.map(([label, issue]) => <span key={label} title={`${label} (${issue.count})`} className={`max-w-[150px] truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BADGE_CLASS[issue.cls] ?? BADGE_CLASS.ok}`}>{label}</span>)}
                          {openRecords.length > 0 ? <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{openRecords.length} open</span> : resolvedCount > 0 ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Resolved</span> : <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-3">No issues</span>}
                          <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-3">{group.records.length} invoice{group.records.length === 1 ? '' : 's'}</span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={`account:${group.key}`} style={{ height: ROW_HEIGHT }} className="border-b border-line bg-surface-2/80 dark:border-white/[0.06] dark:bg-[#1d1d1d]">
                    <td className="px-3">
                      <button
                        type="button"
                        aria-expanded={!collapsed}
                        aria-label={`${collapsed ? 'Expand' : 'Collapse'} account ${group.account}`}
                        onClick={() => setExpandedAccounts((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.key)) next.delete(group.key);
                          else next.add(group.key);
                          return next;
                        })}
                        className="flex items-center gap-1 text-left"
                      >
                        {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" /> : <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" />}
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-surface px-1 font-mono text-[11px] font-semibold text-ink-3">{groupIndex + 1}</span>
                      </button>
                    </td>
                    <td className="px-3 font-mono text-xs font-semibold text-ink">{group.account}</td>
                    <td className="px-3" />
                    <td className="px-3 text-xs text-ink-2" title={customerNames.join(' · ')}>
                      <div className="truncate">{customerNames.slice(0, 2).join(' · ') || 'Customer name not listed'}{customerNames.length > 2 ? ` · +${customerNames.length - 2} names` : ''}</div>
                    </td>
                    <td className="px-3" />
                    <td className="px-3" />
                    <td className="px-3">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {topIssues.map(([label, issue]) => (
                          <span key={label} title={`${label} (${issue.count})`} className={`hidden max-w-[135px] truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset xl:inline-flex ${BADGE_CLASS[issue.cls] ?? BADGE_CLASS.ok}`}>
                            {label}
                          </span>
                        ))}
                        {openRecords.length > 0 ? (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{openRecords.length} open</span>
                        ) : resolvedCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Resolved</span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-3">No issues</span>
                        )}
                        <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-3">{group.records.length} invoice{group.records.length === 1 ? '' : 's'}</span>
                      </div>
                    </td>
                  </tr>
                );
              }
              const r = item.record;
              const resolved = resolutions[String(r.id)]?.status === 'resolved';
              const isSelected = selectedId === r.id;
              const preferredClasses = filterClasses(activeFilter);
              const distinctIssues = r.issues.filter((issue, index, all) => all.findIndex((candidate) => candidate.cls === issue.cls) === index);
              const orderedIssues = [...distinctIssues].sort((a, b) => {
                const aIndex = preferredClasses.indexOf(a.cls);
                const bIndex = preferredClasses.indexOf(b.cls);
                const aRank = aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex;
                const bRank = bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex;
                return aRank - bRank || a.priority - b.priority;
              });
              const selectedIssue = orderedIssues[0];
              const visibleClass = selectedIssue?.cls ?? r.primaryCls;
              const cleanLabel = isCleared(r) && activeFilter === 'all' && !preferredClasses.length;
              return (
                <tr
                  key={r.id}
                  onClick={() => onOpen(r)}
                  style={{ height: ROW_HEIGHT }}
                  className={`cursor-pointer border-b border-line/50 transition-colors duration-150 hover:bg-accent-soft/40 dark:border-white/[0.045] ${
                    isSelected ? 'bg-accent-soft/70' : ROW_TINT[visibleClass] ?? ''
                  } ${resolved ? 'opacity-60' : ''}`}
                >
                  <td className="px-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select invoice ${r.invoiceNo}`}
                      checked={checked.has(r.id)}
                      onChange={() => onToggleChecked(r.id)}
                      className="h-4 w-4 cursor-pointer accent-accent"
                    />
                  </td>
                  <td className="px-3">
                    <span className="font-mono text-xs font-medium">{r.invoiceNo}</span>
                    {r.documentId !== '-' && <div className="font-mono text-xs text-ink-3">{r.documentId}</div>}
                  </td>
                  <td className="max-w-[180px] truncate px-3 text-ink-2">{r.driverName || '-'}</td>
                  <td className="max-w-[220px] px-3">
                    <div className="truncate font-medium">{r.customer || '-'}</div>
                    <div className="font-mono text-xs text-ink-3">{r.account || '-'}</div>
                  </td>
                  <td className="px-3 font-mono text-xs">{r.territory || '-'}</td>
                  <td className="px-3 text-right font-mono text-xs tabular-nums">{r.weight.toLocaleString()}</td>
                  <td className="px-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {<span
                        title={orderedIssues.map((issue) => issue.status).join(' · ') || 'Clean'}
                        className={`inline-flex max-w-[440px] items-center gap-1 whitespace-nowrap truncate rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          BADGE_CLASS[visibleClass] ?? BADGE_CLASS.ok
                        }`}
                      >
                        <span className="truncate">{cleanLabel || !selectedIssue ? 'Clean' : selectedIssue.status}</span>
                      </span>}
                      {orderedIssues.length > 1 && <span className="shrink-0 text-xs text-ink-3">+{orderedIssues.length - 1} more</span>}
                      {resolved && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-500/15 dark:text-slate-300">
                          <Check className="h-3 w-3" /> Resolved
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {end < displayRows.length && <tr style={{ height: (displayRows.length - end) * ROW_HEIGHT }} aria-hidden><td colSpan={7} /></tr>}
          </tbody>
        </table>
      </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 md:hidden">
        <div className="space-y-2">
          {displayRows.slice(0, mobileLimit).map((item) => {
            if (item.type === 'account') {
              const { group, groupIndex } = item;
              const collapsed = !expandedAccounts.has(group.key);
              const openCount = group.records.filter((record) => isFlagged(record) && resolutions[String(record.id)]?.status !== 'resolved').length;
              const resolvedCount = group.records.filter((record) => isFlagged(record) && resolutions[String(record.id)]?.status === 'resolved').length;
              const names = [...group.customers];
              const topIssues = [...new Set(group.records
                .filter((record) => isFlagged(record) && resolutions[String(record.id)]?.status !== 'resolved')
                .flatMap((record) => record.issues.map((issue) => issue.status)))].slice(0, 2);
              const toggleAccount = () => setExpandedAccounts((previous) => {
                const next = new Set(previous);
                if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                return next;
              });
              return (
                <button key={`mobile-account:${group.key}`} type="button" onClick={toggleAccount} aria-expanded={!collapsed} className="w-full rounded-xl border border-line bg-surface-2 p-3 text-left shadow-sm">
                  <span className="flex items-start gap-2">
                    {collapsed ? <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" /> : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-ink">{group.account}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${openCount ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' : resolvedCount ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-surface-3 text-ink-3'}`}>{openCount ? `${openCount} open` : resolvedCount ? 'Resolved' : 'No issues'}</span>
                      </span>
                      <span className="mt-1 block truncate text-sm text-ink-2">{names.slice(0, 2).join(' · ') || 'Customer name not listed'}{names.length > 2 ? ` · +${names.length - 2}` : ''}</span>
                      {topIssues.length > 0 && <span className="mt-2 flex flex-wrap gap-1">{topIssues.map((label) => <span key={label} className="max-w-full truncate rounded-md bg-surface px-2 py-0.5 text-xs text-ink-2">{label}</span>)}</span>}
                      <span className="mt-1 block text-xs text-ink-3">Account {groupIndex + 1} · {group.records.length} invoice{group.records.length === 1 ? '' : 's'}</span>
                    </span>
                  </span>
                </button>
              );
            }
            const r = item.record;
            const resolved = resolutions[String(r.id)]?.status === 'resolved';
            const preferredClasses = filterClasses(activeFilter);
            const orderedIssues = [...r.issues].sort((a, b) => {
              const aRank = preferredClasses.indexOf(a.cls);
              const bRank = preferredClasses.indexOf(b.cls);
              return (aRank < 0 ? Number.MAX_SAFE_INTEGER : aRank) - (bRank < 0 ? Number.MAX_SAFE_INTEGER : bRank) || a.priority - b.priority;
            });
            const issue = orderedIssues[0];
            const issueClass = issue?.cls ?? r.primaryCls;
            return (
              <article key={`mobile-record:${r.id}`} className={`rounded-xl border border-line p-3 shadow-sm ${ROW_TINT[issueClass] ?? 'bg-surface'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" aria-label={`Select invoice ${r.invoiceNo}`} checked={checked.has(r.id)} onChange={() => onToggleChecked(r.id)} className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-accent" />
                  <button type="button" onClick={() => onOpen(r)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-mono text-sm font-semibold text-ink">{r.invoiceNo}</span>
                        <span className="mt-0.5 block truncate text-sm font-medium text-ink">{r.customer || 'Customer not listed'}</span>
                      </span>
                      <span className={`max-w-[48%] truncate rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${BADGE_CLASS[issueClass] ?? BADGE_CLASS.ok}`}>{issue?.status ?? 'Clean'}</span>
                    </span>
                    <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-2">
                      <span>Account <b className="font-mono">{r.account || '—'}</b></span>
                      <span>Driver <b className="truncate">{r.driverName || '—'}</b></span>
                      <span>Territory <b className="font-mono">{r.territory || '—'}</b></span>
                      <span>Weight <b className="font-mono">{r.weight.toLocaleString()}</b></span>
                    </span>
                    <span className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                      {r.documentId !== '-' && <span className="truncate font-mono">Doc {r.documentId}</span>}
                      {orderedIssues.length > 1 && <span>+{orderedIssues.length - 1} more flags</span>}
                      {resolved && <span className="font-medium text-emerald-700 dark:text-emerald-300">Resolved</span>}
                      <span className="ml-auto text-accent">Review details ›</span>
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
          {mobileLimit < displayRows.length && <button type="button" onClick={() => setMobileLimit((limit) => limit + 80)} className="btn-secondary w-full py-3">Show next {Math.min(80, displayRows.length - mobileLimit)} items</button>}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2.5 text-xs text-ink-3 dark:border-white/[0.06] dark:bg-[#1d1d1d]">
        <span>{records.length.toLocaleString()} invoices{groupByAccount ? ` · ${accountGroups.length.toLocaleString()} accounts` : ' · account grouping off'}</span>
        <span className="hidden md:inline">Click a row to review it</span>
        <span className="md:hidden">Tap an invoice to review it</span>
      </div>
    </div>
  );
}

function filterClasses(filter: FilterKey): IssueClass[] {
  switch (filter) {
    case 'error': return ['error'];
    case 'zero': return ['zero'];
    case 'duplicate': return ['duplicate', 'conflict'];
    case 'mismatch': return ['mismatch'];
    case 'split': return ['split'];
    case 'weightflag': return ['checkweight', 'suspectweight'];
    case 'suspicious': return ['suspicious'];
    case 'repairs': return ['repairs'];
    case 'collections': return ['collections'];
    case 'cclinternal': return ['cclinternal'];
    case 'redelivery': return ['redelivery'];
    case 'multidriver': return ['multidriver'];
    case 'driverunusual': return ['driverinfo'];
    case 'ambiguous': return ['ambiguous'];
    case 'unknownaccount': return ['unknownaccount'];
    default: return [];
  }
}

