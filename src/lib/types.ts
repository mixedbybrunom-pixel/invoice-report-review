export type RawRow = Record<string, unknown>;

export type IssueClass =
  | 'ok'
  | 'repairs'
  | 'cclinternal'
  | 'suspicious'
  | 'error'
  | 'zero'
  | 'duplicate'
  | 'conflict'
  | 'split'
  | 'ambiguous'
  | 'mismatch'
  | 'driverinfo'
  | 'checkweight'
  | 'suspectweight'
  | 'multidriver'
  | 'redelivery'
  | 'unknownaccount'
  | 'noterritory';

export interface DriverShare {
  driver: string;
  count: number;
  pct: number;
}

export interface AccountInfo {
  customer: string;
  address: string;
}

export interface MasterData {
  territory: Record<string, string>;
  accountInfo: Record<string, AccountInfo>;
  driverMap: Record<string, DriverShare[]>;
  ambiguousAccounts: string[];
  ambiguousDetail: Record<string, string[]>;
}

export interface Issue {
  status: string;
  cls: IssueClass;
  priority: number;
  primaryEligible: boolean;
}

export interface MismatchInfo {
  expected: string;
  seen: string;
  seenPct: number;
  breakdown: { territory: string; count: number; pct: number }[];
}

export interface DriverConfidenceInfo {
  topDriver: string;
  topPct: number;
  sampleSize: number;
  breakdown: DriverShare[];
}

export interface DuplicateSibling {
  documentId: string;
  driver: string;
  account: string;
  crossAccount: boolean;
}

export interface MultiDriverSibling {
  invoice: string;
  driver: string;
  account?: string;
  address?: string;
}

export interface SplitSibling {
  invoice: string;
  territory: string;
  driver: string;
}

export interface ValidatedRecord {
  id: number;
  invoiceNo: string;
  customer: string;
  account: string;
  territory: string;
  weight: number;
  qty: number;
  documentId: string;
  driverName: string;
  vehicle: string;
  address: string;
  details: string;
  status: string;
  primaryCls: IssueClass;
  issueClasses: Set<IssueClass>;
  issues: Issue[];
  isCCLAccount: boolean;
  isRedelivery: boolean;
  isMismatch: boolean;
  isDriverUnusual: boolean;
  isAmbiguous: boolean;
  isUnknownAccount: boolean;
  mismatchInfo: MismatchInfo | null;
  driverConfidenceInfo: DriverConfidenceInfo | null;
  ambiguousTerritories: string[];
  duplicateSiblings: DuplicateSibling[];
  multiDriver: {
    subtype: 'account' | 'address';
    drivers: DriverShare[];
    siblings: MultiDriverSibling[];
  } | null;
  splitSiblings: SplitSibling[];
  searchText: string;
}

export type ResolutionStatus = 'resolved' | 'unresolved';

export interface Resolution {
  status: ResolutionStatus;
  reason?: string;
  note: string;
  resolvedAt: string;
  resolvedBy: string;
}

export interface ResolutionEvent {
  id: number;
  recordId: string;
  invoiceNo: string;
  action: 'resolved' | 'reopened';
  reason: string;
  note: string;
  actorEmail: string;
  occurredAt: string;
}

export interface RunHistoryEntry {
  id: string;
  fileName: string;
  date: string;
  total: number;
  flagged: number;
  cleared: number;
  drivers: number;
  dateRange: string;
}
