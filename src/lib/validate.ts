import {
  DRIVER_CONFIDENCE_THRESHOLD,
  DRIVER_MIN_SAMPLE,
  INVOICE_RULES,
  REDELIVERY_PATTERN,
  getCCLLabel,
  isCCLAccount,
  normalizeAccountKey,
} from './rules';
import type {
  DriverShare,
  Issue,
  IssueClass,
  MasterData,
  RawRow,
  ValidatedRecord,
} from './types';

const text = (v: unknown) => String(v ?? '').trim();

function comparableCustomerName(value: string) {
  return value.trim().replace(/^\d{5}\s+/, '').toLocaleUpperCase().replace(/[^A-Z0-9]/g, '');
}

function resolveAccountAndCustomer(row: RawRow, master: MasterData) {
  const reportedAccount = normalizeAccountKey(row['Customer']);
  const reportedName = text(row['Customer Name']);
  const codedName = reportedName.match(/^(\d{5})\s+(.+)$/);
  if (!codedName) return { account: reportedAccount, customer: reportedName };

  const nameAccount = normalizeAccountKey(codedName[1]);
  if (nameAccount === reportedAccount || !master.accountInfo[nameAccount]) {
    return { account: reportedAccount, customer: reportedName };
  }

  // Use an account code embedded in the customer name only when the master file
  // independently maps that code to the same customer; otherwise keep the report ID.
  const expectedName = comparableCustomerName(master.accountInfo[nameAccount].customer);
  const trailingName = comparableCustomerName(codedName[2]);
  if (expectedName && expectedName === trailingName) {
    return { account: nameAccount, customer: codedName[2].trim() };
  }
  return { account: reportedAccount, customer: reportedName };
}

const pickFirst = (r: RawRow, keys: string[]) => {
  for (const k of keys) {
    const v = text(r[k]);
    if (v) return v;
  }
  return '';
};

function toShares(counts: Map<string, number>): DriverShare[] {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()]
    .map(([driver, count]) => ({ driver, count, pct: total ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

interface Prepared {
  invoice: string;
  account: string;
  customer: string;
  driver: string;
  territory: string;
  address: string;
  documentId: string;
}

export function validateRows(rows: RawRow[], master: MasterData): ValidatedRecord[] {
  const masterLoaded = Object.keys(master.territory).length > 0;
  const hasDriverData = Object.keys(master.driverMap).length > 0;
  const ambiguous = new Set(master.ambiguousAccounts);

  const prepared: (Prepared | null)[] = rows.map((r) => {
    const invoice = text(r['Invoice No']).toUpperCase();
    if (!invoice) return null;
    const accountAndCustomer = resolveAccountAndCustomer(r, master);
    return {
      invoice,
      account: accountAndCustomer.account,
      customer: accountAndCustomer.customer,
      driver: text(r['Driver Name']),
      territory: text(r['Territory']).toUpperCase(),
      address: text(r['Customer Address']).toUpperCase(),
      documentId: text(r['Document ID']) || '-',
    };
  });

  const isRepairOrInternal = (p: Prepared) =>
    INVOICE_RULES.repairs.test(p.invoice) || INVOICE_RULES.internal.test(p.invoice);

  const dupMap = groupBy(
    prepared.flatMap((p, idx) => (p ? [{ ...p, idx }] : [])),
    (p) => p.invoice,
  );

  const multiDriverAddresses = new Set<string>();
  const addressDrivers = new Map<string, Map<string, number>>();
  const addressRecords = new Map<string, { invoice: string; driver: string; account: string }[]>();
  for (const p of prepared) {
    if (!p || !p.address || !p.driver || isRepairOrInternal(p)) continue;
    const drivers = addressDrivers.get(p.address) ?? new Map<string, number>();
    drivers.set(p.driver, (drivers.get(p.driver) ?? 0) + 1);
    addressDrivers.set(p.address, drivers);
    const recs = addressRecords.get(p.address) ?? [];
    recs.push({ invoice: p.invoice, driver: p.driver, account: p.account });
    addressRecords.set(p.address, recs);
  }
  for (const [addr, drivers] of addressDrivers) {
    if (drivers.size > 1) multiDriverAddresses.add(addr);
  }

  const accountDrivers = new Map<string, Map<string, number>>();
  const accountRecords = new Map<string, { invoice: string; driver: string; address: string }[]>();
  for (const p of prepared) {
    if (!p || !p.account || !p.driver || isRepairOrInternal(p)) continue;
    const drivers = accountDrivers.get(p.account) ?? new Map<string, number>();
    drivers.set(p.driver, (drivers.get(p.driver) ?? 0) + 1);
    accountDrivers.set(p.account, drivers);
    const recs = accountRecords.get(p.account) ?? [];
    recs.push({ invoice: p.invoice, driver: p.driver, address: p.address });
    accountRecords.set(p.account, recs);
  }
  const multiDriverAccounts = new Set(
    [...accountDrivers].filter(([, d]) => d.size > 1).map(([a]) => a),
  );

  const accountTerritories = new Map<string, Map<string, number>>();
  const accountSplitRecords = new Map<string, { invoice: string; territory: string; driver: string }[]>();
  for (const p of prepared) {
    if (!p || !p.account || !p.territory || isRepairOrInternal(p) || isCCLAccount(p.account)) continue;
    const counts = accountTerritories.get(p.account) ?? new Map<string, number>();
    counts.set(p.territory, (counts.get(p.territory) ?? 0) + 1);
    accountTerritories.set(p.account, counts);
    const recs = accountSplitRecords.get(p.account) ?? [];
    recs.push({ invoice: p.invoice, territory: p.territory, driver: p.driver });
    accountSplitRecords.set(p.account, recs);
  }

  const records: ValidatedRecord[] = [];

  rows.forEach((row, rowIdx) => {
    const p = prepared[rowIdx];
    if (!p) return;

    const { invoice, account, driver, territory, address, documentId } = p;
    const weight = parseFloat(text(row['Weight']).replace(/[^0-9.-]/g, '')) || 0;
    const qty = parseInt(text(row['Invoice Qty']), 10) || 0;
    const customer = p.customer;
    const vehicle = pickFirst(row, ['Vehicle', 'Vehicle No', 'Vehicle Reg', 'Vehicle Registration', 'Reg No']);
    const details = text(row['Details']);
    const isCCL = isCCLAccount(account);

    const issues: Issue[] = [];
    const add = (status: string, cls: IssueClass, priority: number, primaryEligible: boolean) =>
      issues.push({ status, cls, priority, primaryEligible });

    let mismatchInfo: ValidatedRecord['mismatchInfo'] = null;
    let driverConfidenceInfo: ValidatedRecord['driverConfidenceInfo'] = null;
    let ambiguousTerritories: string[] = [];

    if (INVOICE_RULES.repairs.test(invoice)) add('For Repairs', 'repairs', 10, true);
    else if (INVOICE_RULES.internal.test(invoice)) add(getCCLLabel(account), 'cclinternal', 20, true);
    else if (INVOICE_RULES.valid8.test(invoice) && INVOICE_RULES.validStart.test(invoice)) {
      // valid invoice number, no issue
    } else if (INVOICE_RULES.validNew7.test(invoice)) {
      // valid invoice number in the new 56xxxxx series, no issue
    } else if (INVOICE_RULES.valid8.test(invoice)) add('Suspicious Invoice No', 'suspicious', 30, true);
    else add('Invalid Invoice No', 'error', 40, true);

    let isUnknownAccount = false;
    let isAmbiguous = false;
    let isMismatch = false;
    let isDriverUnusual = false;

    if (!isCCL) {
      if (ambiguous.has(account)) {
        isAmbiguous = true;
        ambiguousTerritories = master.ambiguousDetail[account] ?? [];
        add('Unclear Territory (tied in master file)', 'ambiguous', 78, true);
      } else if (masterLoaded && account && !master.territory[account]) {
        isUnknownAccount = true;
        add('Unknown Account (not in master)', 'unknownaccount', 55, true);
      } else if (masterLoaded && master.territory[account] && territory !== master.territory[account]) {
        const expected = master.territory[account];
        const counts = accountTerritories.get(account) ?? new Map<string, number>();
        const total = [...counts.values()].reduce((a, b) => a + b, 0);
        const seenCount = counts.get(territory) ?? 0;
        const seenPct = total ? (seenCount / total) * 100 : 0;
        const breakdown = toShares(counts).map((s) => ({ territory: s.driver, count: s.count, pct: s.pct }));
        mismatchInfo = { expected, seen: territory, seenPct, breakdown };
        isMismatch = true;
        add(
          `Possible Territory Mismatch (expected ${expected}, seen ${seenPct.toFixed(0)}% as ${territory})`,
          'mismatch',
          80,
          false,
        );
      }

      const shares = hasDriverData && account && driver ? master.driverMap[account] : undefined;
      if (shares?.length) {
        const sample = shares.reduce((a, s) => a + s.count, 0);
        const top = shares[0];
        if (sample >= DRIVER_MIN_SAMPLE && top.pct >= DRIVER_CONFIDENCE_THRESHOLD) {
          isDriverUnusual = driver.toUpperCase() !== top.driver.toUpperCase();
          driverConfidenceInfo = { topDriver: top.driver, topPct: top.pct, sampleSize: sample, breakdown: shares };
          if (isDriverUnusual) {
            add(
              `Unusual Driver (usually ${top.driver}, ${top.pct.toFixed(0)}% of ${sample} past trips)`,
              'driverinfo',
              85,
              false,
            );
          }
        }
      }
    }

    const hasBlockingIssue = issues.some((i) =>
      ['repairs', 'cclinternal', 'suspicious', 'error'].includes(i.cls),
    );
    if (!hasBlockingIssue) {
      if (weight <= 0) add('Zero Weight', 'zero', 50, true);

      const dupes = dupMap.get(invoice) ?? [];
      const others = dupes.filter((d) => d.idx !== rowIdx);
      if (others.length) {
        if (others.some((o) => o.account === account)) add('Duplicate Invoice', 'duplicate', 60, true);
        else if (others.some((o) => o.account !== account)) add('Invoice Conflict (different account)', 'conflict', 61, true);
      }

      if (!territory) add('No Territory', 'noterritory', 45, true);

      const splitCounts = accountTerritories.get(account);
      if (!isCCL && splitCounts && splitCounts.size > 1) {
        add(`Territory Split (${[...splitCounts.keys()].join(' / ')})`, 'split', 70, true);
      }

      if (weight >= 100) {
        if (qty === 0) add('Suspect Weight (qty 0)', 'suspectweight', 90, true);
        else if (qty <= 10) add(`Check Weight (qty ${qty})`, 'checkweight', 95, true);
        else add('Suspect Weight (high qty)', 'suspectweight', 90, true);
      }
    }

    let multiDriver: ValidatedRecord['multiDriver'] = null;
    if (account && multiDriverAccounts.has(account)) {
      const drivers = toShares(accountDrivers.get(account) ?? new Map());
      add(`Multi-Driver Account (${drivers.length} drivers)`, 'multidriver', 100, true);
      multiDriver = {
        subtype: 'account',
        drivers,
        siblings: (accountRecords.get(account) ?? [])
          .filter((s) => s.invoice !== invoice)
          .map((s) => ({ invoice: s.invoice, driver: s.driver, address: s.address })),
      };
    } else if (address && multiDriverAddresses.has(address)) {
      const drivers = toShares(addressDrivers.get(address) ?? new Map());
      add(`Multi-Driver Address (${drivers.length} drivers)`, 'multidriver', 101, true);
      multiDriver = {
        subtype: 'address',
        drivers,
        siblings: (addressRecords.get(address) ?? [])
          .filter((s) => s.invoice !== invoice)
          .map((s) => ({ invoice: s.invoice, driver: s.driver, account: s.account })),
      };
    }

    const isRedelivery = !!details && REDELIVERY_PATTERN.test(details);
    if (isRedelivery) add('Redelivery', 'redelivery', 110, false);

    const eligible = issues.filter((i) => i.primaryEligible).sort((a, b) => a.priority - b.priority);
    const primary: Issue = eligible[0] ?? { status: 'OK', cls: 'ok', priority: 999, primaryEligible: true };
    const secondary = issues.filter((i) => i !== primary).map((i) => i.status);
    const status = secondary.length ? `${primary.status} · ${secondary.join(' · ')}` : primary.status;

    const issueClasses = new Set<IssueClass>(issues.map((i) => i.cls));
    issueClasses.add(primary.cls);
    if (isCCL) issueClasses.add('cclinternal');

    const duplicateSiblings = (dupMap.get(invoice) ?? [])
      .filter((d) => d.idx !== rowIdx)
      .map((d) => ({ documentId: d.documentId, driver: d.driver || '-', account: d.account, crossAccount: d.account !== account }));

    const splitSiblings = issueClasses.has('split')
      ? (accountSplitRecords.get(account) ?? [])
          .filter((s) => s.invoice !== invoice)
          .map((s) => ({ invoice: s.invoice, territory: s.territory, driver: s.driver }))
      : [];

    records.push({
      id: rowIdx,
      invoiceNo: invoice,
      customer,
      account,
      territory,
      weight,
      qty,
      documentId,
      driverName: driver,
      vehicle,
      address: text(row['Customer Address']),
      details,
      status,
      primaryCls: primary.cls,
      issueClasses,
      issues,
      isCCLAccount: isCCL,
      isRedelivery,
      isMismatch,
      isDriverUnusual,
      isAmbiguous,
      isUnknownAccount,
      mismatchInfo,
      driverConfidenceInfo,
      ambiguousTerritories,
      duplicateSiblings,
      multiDriver,
      splitSiblings,
      searchText: [invoice, customer, account, territory, documentId, driver, vehicle, address, details, status]
        .join(' ')
        .toLowerCase(),
    });
  });

  return records;
}
