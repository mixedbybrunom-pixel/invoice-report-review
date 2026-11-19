export const MASTER_API_URL = 'https://ccl-master-api.cclvalidator.workers.dev/master';
export const MASTER_FETCH_TIMEOUT_MS = 5000;
export const MASTER_POLL_INTERVAL_MS = 3 * 60 * 1000;
export const HISTORY_LIMIT = 30;

export const DRIVER_CONFIDENCE_THRESHOLD = 60;
export const DRIVER_MIN_SAMPLE = 5;

// Matches "drop ship" however it is typed: dropship, drop-ship, drop_ship, drop shipment, dropshipping,
// and common slips such as dropshp, drp ship, dop ship, dropp ship or drop sihp.
export const DROPSHIP_PATTERN = /\b(?:dr?[oa]p{1,2}|drp|dro)[\s_\-./]*s[hi]{1,2}p/i;
export const REDELIVERY_PATTERN = /re.?load|re.?d[ei]?l[il]?[iy]?v[ea]?r?[yi]?/i;

export const INVOICE_RULES = {
  repairs: /^\d{5}$/,
  internal: /ACC-SINV/i,
  validStart: /^(00|02)/,
  valid8: /^\d{8}$/,
  // New numbering series introduced in Nov 2026: 7 digits starting with 56 (e.g. 5600014).
  validNew7: /^56\d{5}$/,
};

export const REQUIRED_COLUMNS = [
  'Invoice No',
  'Customer',
  'Customer Name',
  'Territory',
  'Weight',
  'Invoice Qty',
  'Driver Name',
] as const;

export function normalizeAccountKey(raw: unknown): string {
  let s = String(raw ?? '').trim().toUpperCase();
  // Spreadsheet exports sometimes turn an integer identifier into text like "2665.0".
  if (/^\d+\.0+$/.test(s)) s = s.slice(0, s.indexOf('.'));
  // Account numbers are five digit identifiers. Excel may read a cell such
  // as 00103 as the number 103, so restore its leading zeroes here.
  return /^\d+$/.test(s) ? s.padStart(5, '0') : s;
}

export function isCCLAccount(account: string): boolean {
  return account.startsWith('CCL');
}

export function getCCLLabel(account: string): string {
  return account ? `CCL Internal (${account})` : 'CCL Internal';
}
