import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  GitBranch,
  HelpCircle,
  Layers,
  LayoutGrid,
  MapPin,
  Scale,
  ShieldAlert,
  Truck,
  Undo2,
  UserX,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { IssueClass, Resolution, ValidatedRecord } from './types';

export type FilterKey =
  | 'all'
  | 'needsaction'
  | 'resolved'
  | 'ok'
  | 'error'
  | 'zero'
  | 'duplicate'
  | 'mismatch'
  | 'split'
  | 'weightflag'
  | 'suspicious'
  | 'repairs'
  | 'cclinternal'
  | 'redelivery'
  | 'multidriver'
  | 'driverunusual'
  | 'ambiguous'
  | 'unknownaccount';

export interface FilterDef {
  key: FilterKey;
  label: string;
  description: string;
  icon: LucideIcon;
  text: string;
  chip: string;
}

export const FILTERS: FilterDef[] = [
  { key: 'all', label: 'All records', description: 'Every row in the report', icon: LayoutGrid, text: 'text-slate-600 dark:text-slate-300', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300' },
  { key: 'needsaction', label: 'Needs action', description: 'Flagged and not yet resolved', icon: Clock, text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  { key: 'resolved', label: 'Resolutions', description: 'Invoices that have been resolved', icon: Undo2, text: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' },
  { key: 'ok', label: 'Clean', description: 'No issues found', icon: CheckCircle2, text: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' },
  { key: 'error', label: 'Invalid invoice', description: 'Invoice number is not 02xxxxxx, 56xxxxx, 5 digits or ACC-SINV', icon: XCircle, text: 'text-red-600 dark:text-red-400', chip: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400' },
  { key: 'zero', label: 'Zero weight', description: 'Weight is zero or missing', icon: Scale, text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  { key: 'duplicate', label: 'Duplicates / conflicts', description: 'Same invoice appears more than once', icon: Layers, text: 'text-orange-600 dark:text-orange-400', chip: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400' },
  { key: 'mismatch', label: 'Territory mismatch', description: 'Territory differs from master file', icon: MapPin, text: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  { key: 'split', label: 'Territory split', description: 'Account spans several territories', icon: GitBranch, text: 'text-orange-600 dark:text-orange-400', chip: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400' },
  { key: 'weightflag', label: 'Weight flags', description: 'Heavy weight for the quantity', icon: Scale, text: 'text-yellow-600 dark:text-yellow-400', chip: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400' },
  { key: 'suspicious', label: 'Suspicious invoice no', description: 'Invoice number looks wrong', icon: ShieldAlert, text: 'text-red-700 dark:text-red-400', chip: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  { key: 'repairs', label: 'For repairs', description: 'Repair jobs', icon: Wrench, text: 'text-teal-600 dark:text-teal-400', chip: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400' },
  { key: 'cclinternal', label: 'CCL internal', description: 'Internal CCL accounts', icon: Building2, text: 'text-sky-600 dark:text-sky-400', chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
  { key: 'redelivery', label: 'Redeliveries', description: 'Details mention a redelivery', icon: Truck, text: 'text-violet-600 dark:text-violet-400', chip: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
  { key: 'multidriver', label: 'Multi-driver address', description: 'Account or address served by several drivers', icon: Users, text: 'text-cyan-700 dark:text-cyan-400', chip: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400' },
  { key: 'driverunusual', label: 'Unusual driver', description: 'Driver differs from the usual one', icon: UserX, text: 'text-sky-600 dark:text-sky-400', chip: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
  { key: 'ambiguous', label: 'Unclear territory', description: 'Tied territory in the master file', icon: HelpCircle, text: 'text-violet-600 dark:text-violet-400', chip: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
  { key: 'unknownaccount', label: 'Unknown account', description: 'Account missing from master file', icon: AlertTriangle, text: 'text-slate-600 dark:text-slate-300', chip: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300' },
];

export const FILTER_BY_KEY = Object.fromEntries(FILTERS.map((f) => [f.key, f])) as Record<FilterKey, FilterDef>;

export function isCleared(r: ValidatedRecord): boolean {
  return r.primaryCls === 'ok' || r.primaryCls === 'repairs' || r.primaryCls === 'cclinternal';
}

export function isFlagged(r: ValidatedRecord): boolean {
  return !isCleared(r);
}

export function matchesFilter(r: ValidatedRecord, key: FilterKey, res: Resolution | undefined): boolean {
  const resolved = res?.status === 'resolved';
  const has = (c: IssueClass) => r.issueClasses.has(c);
  switch (key) {
    case 'all': return true;
    case 'needsaction': return isFlagged(r) && !resolved;
    case 'resolved': return resolved;
    case 'ok': return r.primaryCls === 'ok';
    case 'error': return has('error');
    case 'zero': return has('zero');
    case 'duplicate': return has('duplicate') || has('conflict');
    case 'mismatch': return r.isMismatch;
    case 'split': return has('split');
    case 'weightflag': return has('checkweight') || has('suspectweight');
    case 'suspicious': return has('suspicious');
    case 'repairs': return r.primaryCls === 'repairs';
    case 'cclinternal': return r.isCCLAccount;
    case 'redelivery': return r.isRedelivery;
    case 'multidriver': return has('multidriver');
    case 'driverunusual': return r.isDriverUnusual;
    case 'ambiguous': return r.isAmbiguous;
    case 'unknownaccount': return r.isUnknownAccount;
  }
}

export function countFilters(records: ValidatedRecord[], resolutions: Record<string, Resolution>): Record<FilterKey, number> {
  const out = Object.fromEntries(FILTERS.map((f) => [f.key, 0])) as Record<FilterKey, number>;
  for (const r of records) {
    const res = resolutions[String(r.id)];
    for (const f of FILTERS) if (matchesFilter(r, f.key, res)) out[f.key]++;
  }
  return out;
}

export const STATUS_LABEL: Record<string, string> = {
  ok: 'Clean',
  error: 'Invalid invoice',
  mismatch: 'Territory mismatch',
  ambiguous: 'Unclear territory',
  unknownaccount: 'Unknown account',
  zero: 'Zero weight',
  duplicate: 'Duplicate',
  conflict: 'Conflict',
  split: 'Territory split',
  checkweight: 'Check weight',
  suspectweight: 'Weight flag',
  suspicious: 'Suspicious',
  repairs: 'Repairs',
  cclinternal: 'CCL internal',
  multidriver: 'Multi-driver',
  redelivery: 'Redelivery',
  driverinfo: 'Unusual driver',
  noterritory: 'No territory',
};

/** Solid badge colours for the primary status. */
export const BADGE_CLASS: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30',
  error: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/30',
  suspicious: 'bg-red-50 text-red-800 ring-red-700/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/30',
  mismatch: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
  zero: 'bg-amber-50 text-amber-800 ring-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/30',
  duplicate: 'bg-orange-50 text-orange-800 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30',
  conflict: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/30',
  split: 'bg-orange-50 text-orange-800 ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/30',
  ambiguous: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30',
  unknownaccount: 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-400/30',
  checkweight: 'bg-yellow-50 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-500/15 dark:text-yellow-300 dark:ring-yellow-400/30',
  suspectweight: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/30',
  repairs: 'bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/30',
  cclinternal: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/30',
  multidriver: 'bg-cyan-50 text-cyan-800 ring-cyan-600/20 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/30',
  redelivery: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/30',
  driverinfo: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/30',
  noterritory: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/30',
};

/** Faint row tint for the primary status. */
export const ROW_TINT: Record<string, string> = {
  error: 'bg-red-50/60 dark:bg-white/[0.018]',
  suspicious: 'bg-red-50/60 dark:bg-white/[0.018]',
  mismatch: 'bg-amber-50/60 dark:bg-white/[0.018]',
  zero: 'bg-amber-50/60 dark:bg-white/[0.018]',
  duplicate: 'bg-orange-50/60 dark:bg-white/[0.018]',
  conflict: 'bg-rose-50/60 dark:bg-white/[0.018]',
  split: 'bg-orange-50/60 dark:bg-white/[0.018]',
  ambiguous: 'bg-violet-50/60 dark:bg-white/[0.018]',
  unknownaccount: 'bg-slate-100/70 dark:bg-white/[0.018]',
  noterritory: 'bg-red-50/60 dark:bg-white/[0.018]',
  checkweight: 'bg-yellow-50/60 dark:bg-white/[0.018]',
  suspectweight: 'bg-red-50/60 dark:bg-white/[0.018]',
  multidriver: 'bg-cyan-50/60 dark:bg-white/[0.018]',
  redelivery: 'bg-violet-50/60 dark:bg-white/[0.018]',
};
