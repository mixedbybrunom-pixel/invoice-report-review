import { MASTER_API_URL, MASTER_FETCH_TIMEOUT_MS, normalizeAccountKey, isCCLAccount } from './rules';
import type { DriverShare, MasterData, RawRow, ValidatedRecord } from './types';

export const EMPTY_MASTER: MasterData = {
  territory: {},
  accountInfo: {},
  driverMap: {},
  ambiguousAccounts: [],
  ambiguousDetail: {},
};

export function masterAccountCount(m: MasterData): number {
  return Object.keys(m.territory).length;
}

function rekeyRecord<T>(obj: Record<string, T> | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(obj ?? {})) out[normalizeAccountKey(k)] = v;
  return out;
}

export function parseMasterPayload(payload: unknown): MasterData {
  const p = (payload ?? {}) as Record<string, unknown>;
  const isEnvelope = !!p.territoryMap && !!p.accountInfo;
  if (!isEnvelope) {
    return { ...EMPTY_MASTER, territory: rekeyRecord(p as Record<string, string>) };
  }
  return {
    territory: rekeyRecord(p.territoryMap as Record<string, string>),
    accountInfo: rekeyRecord(p.accountInfo as MasterData['accountInfo']),
    driverMap: rekeyRecord(p.driverMap as Record<string, DriverShare[]>),
    ambiguousAccounts: ((p.ambiguousAccounts as string[]) ?? []).map(normalizeAccountKey),
    ambiguousDetail: rekeyRecord(p.ambiguousDetail as Record<string, string[]>),
  };
}

export async function fetchMasterFromServer(): Promise<MasterData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MASTER_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(MASTER_API_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    return parseMasterPayload(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

export async function pushMasterToServer(data: MasterData, uploadKey: string): Promise<void> {
  const res = await fetch(MASTER_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-upload-key': uploadKey },
    body: JSON.stringify({
      territoryMap: data.territory,
      accountInfo: data.accountInfo,
      driverMap: data.driverMap,
      ambiguousAccounts: data.ambiguousAccounts,
      ambiguousDetail: data.ambiguousDetail,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(res.status === 401 || res.status === 403 ? 'The upload key was rejected.' : detail || `Server responded ${res.status}`);
  }
}

/** Builds master data from report rows. Pass skipCCL to ignore internal CCL accounts entirely. */
export function aggregateMasterRows(rows: RawRow[], skipCCL: boolean): MasterData {
  const counts = new Map<string, Map<string, number>>();
  const drivers = new Map<string, Map<string, number>>();
  const info: Record<string, { customer: string; address: string }> = {};

  for (const row of rows) {
    const acc = normalizeAccountKey(row['Customer']);
    const terr = String(row['Territory'] ?? '').trim().toUpperCase();
    if (!acc || !terr) continue;
    if (skipCCL && isCCLAccount(acc)) continue;

    const c = counts.get(acc) ?? new Map<string, number>();
    c.set(terr, (c.get(terr) ?? 0) + 1);
    counts.set(acc, c);

    const driver = String(row['Driver Name'] ?? '').trim();
    if (driver) {
      const d = drivers.get(acc) ?? new Map<string, number>();
      d.set(driver, (d.get(driver) ?? 0) + 1);
      drivers.set(acc, d);
    }

    if (!info[acc]) {
      info[acc] = {
        customer: String(row['Customer Name'] ?? '').trim(),
        address: String(row['Customer Address'] ?? '').trim(),
      };
    }
  }

  const territory: Record<string, string> = {};
  const ambiguousAccounts: string[] = [];
  const ambiguousDetail: Record<string, string[]> = {};
  for (const [acc, c] of counts) {
    const sorted = [...c.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted[0][1];
    const tied = sorted.filter(([, n]) => n === top).map(([t]) => t);
    if (tied.length > 1 && !isCCLAccount(acc)) {
      ambiguousAccounts.push(acc);
      ambiguousDetail[acc] = tied;
    }
    territory[acc] = tied[0];
  }

  const driverMap: Record<string, DriverShare[]> = {};
  for (const [acc, d] of drivers) {
    const total = [...d.values()].reduce((a, b) => a + b, 0);
    driverMap[acc] = [...d.entries()]
      .map(([driver, count]) => ({ driver, count, pct: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }

  return { territory, accountInfo: info, driverMap, ambiguousAccounts, ambiguousDetail };
}

/** Adds accounts from `incoming` that the server does not already know. Existing server entries win. */
export function mergeAdditive(server: MasterData, incoming: MasterData): { merged: MasterData; added: string[] } {
  const added = Object.keys(incoming.territory).filter((acc) => !(acc in server.territory));
  const merged: MasterData = {
    territory: { ...server.territory },
    accountInfo: { ...server.accountInfo },
    driverMap: { ...server.driverMap },
    ambiguousAccounts: [...server.ambiguousAccounts],
    ambiguousDetail: { ...server.ambiguousDetail },
  };
  const addedSet = new Set(added);
  for (const acc of added) {
    merged.territory[acc] = incoming.territory[acc];
    if (incoming.accountInfo[acc]) merged.accountInfo[acc] = incoming.accountInfo[acc];
    if (incoming.driverMap[acc]) merged.driverMap[acc] = incoming.driverMap[acc];
  }
  for (const acc of incoming.ambiguousAccounts) {
    if (addedSet.has(acc) && !merged.ambiguousAccounts.includes(acc)) {
      merged.ambiguousAccounts.push(acc);
      merged.ambiguousDetail[acc] = incoming.ambiguousDetail[acc] ?? [];
    }
  }
  return { merged, added };
}

/** Overwrites one account's territory and clears it from the ambiguous lists. */
export function correctAccount(server: MasterData, account: string, territory: string, customer: string): MasterData {
  const ambiguousAccounts = server.ambiguousAccounts.filter((a) => a !== account);
  const ambiguousDetail = { ...server.ambiguousDetail };
  delete ambiguousDetail[account];
  return {
    ...server,
    territory: { ...server.territory, [account]: territory },
    accountInfo: {
      ...server.accountInfo,
      [account]: { customer, address: server.accountInfo[account]?.address ?? '' },
    },
    ambiguousAccounts,
    ambiguousDetail,
  };
}

export interface UnknownAccountCandidate {
  account: string;
  customer: string;
  address: string;
  /** Most common territory for this account in the loaded report (editable before pushing). */
  territory: string;
  territoriesSeen: { territory: string; count: number }[];
  drivers: DriverShare[];
  invoiceCount: number;
}

/** Groups the report's unknown-account records into one candidate per account. */
export function collectUnknownAccounts(records: ValidatedRecord[]): UnknownAccountCandidate[] {
  const byAccount = new Map<string, {
    customer: string;
    address: string;
    territories: Map<string, number>;
    drivers: Map<string, number>;
    count: number;
  }>();

  for (const r of records) {
    if (!r.isUnknownAccount) continue;
    const account = normalizeAccountKey(r.account);
    if (!account) continue;
    const entry = byAccount.get(account) ?? { customer: '', address: '', territories: new Map(), drivers: new Map(), count: 0 };
    entry.count += 1;
    if (!entry.customer && r.customer.trim()) entry.customer = r.customer.trim();
    if (!entry.address && r.address.trim()) entry.address = r.address.trim();
    const terr = r.territory.trim().toUpperCase();
    if (terr) entry.territories.set(terr, (entry.territories.get(terr) ?? 0) + 1);
    const driver = r.driverName.trim();
    if (driver) entry.drivers.set(driver, (entry.drivers.get(driver) ?? 0) + 1);
    byAccount.set(account, entry);
  }

  return [...byAccount.entries()]
    .map(([account, e]) => {
      const territoriesSeen = [...e.territories.entries()]
        .map(([territory, count]) => ({ territory, count }))
        .sort((a, b) => b.count - a.count);
      const totalDrivers = [...e.drivers.values()].reduce((a, b) => a + b, 0);
      const drivers = [...e.drivers.entries()]
        .map(([driver, count]) => ({ driver, count, pct: totalDrivers ? (count / totalDrivers) * 100 : 0 }))
        .sort((a, b) => b.count - a.count);
      return {
        account,
        customer: e.customer,
        address: e.address,
        territory: territoriesSeen[0]?.territory ?? '',
        territoriesSeen,
        drivers,
        invoiceCount: e.count,
      };
    })
    .sort((a, b) => a.account.localeCompare(b.account, undefined, { numeric: true }));
}

/** Turns reviewed candidates into master data that can be merged additively into the server master. */
export function buildAdditionsFromCandidates(
  chosen: { account: string; customer: string; address: string; territory: string; drivers: DriverShare[] }[],
): MasterData {
  const data: MasterData = { territory: {}, accountInfo: {}, driverMap: {}, ambiguousAccounts: [], ambiguousDetail: {} };
  for (const c of chosen) {
    const account = normalizeAccountKey(c.account);
    data.territory[account] = c.territory.trim().toUpperCase();
    data.accountInfo[account] = { customer: c.customer, address: c.address };
    if (c.drivers.length) data.driverMap[account] = c.drivers;
  }
  return data;
}
