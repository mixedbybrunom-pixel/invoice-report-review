import * as XLSX from 'xlsx';
import { REQUIRED_COLUMNS } from './rules';
import type { RawRow, ValidatedRecord } from './types';

export interface ParsedTable {
  rows: RawRow[];
  dateRange: string;
}

const HEADER_SEARCH_DEPTH = 20;

/** Finds the header row that contains `anchor` and returns the data rows beneath it. */
export async function readTable(file: File, anchor: string, required: readonly string[]): Promise<ParsedTable> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The workbook has no sheets.');

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
  const headerIdx = grid.slice(0, HEADER_SEARCH_DEPTH).findIndex((row) =>
    row.some((cell) => String(cell).trim() === anchor),
  );
  if (headerIdx === -1) {
    throw new Error(`Could not find a header row containing "${anchor}" in the first ${HEADER_SEARCH_DEPTH} rows.`);
  }

  const headers = grid[headerIdx].map((h) => String(h).trim());
  const missing = required.filter((c) => !headers.includes(c));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);

  const rows: RawRow[] = grid
    .slice(headerIdx + 1)
    .filter((cells) => cells.some((c) => String(c).trim() !== ''))
    .map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])));
  if (rows.length === 0) throw new Error('The sheet has no data rows under the header.');

  const dateRange = [sheet['B1']?.w, sheet['B2']?.w].filter(Boolean).join(' to ');
  return { rows, dateRange };
}

export function readReport(file: File): Promise<ParsedTable> {
  return readTable(file, 'Invoice No', REQUIRED_COLUMNS);
}

const EXPORT_COLUMNS: { header: string; get: (r: ValidatedRecord) => string | number; width: number }[] = [
  { header: 'Invoice No', get: (r) => r.invoiceNo, width: 14 },
  { header: 'Document ID', get: (r) => r.documentId, width: 14 },
  { header: 'Driver Name', get: (r) => r.driverName, width: 22 },
  { header: 'Vehicle', get: (r) => r.vehicle, width: 12 },
  { header: 'Customer', get: (r) => r.account, width: 14 },
  { header: 'Customer Name', get: (r) => r.customer, width: 28 },
  { header: 'Customer Address', get: (r) => r.address, width: 34 },
  { header: 'Territory', get: (r) => r.territory, width: 12 },
  { header: 'Weight', get: (r) => r.weight, width: 10 },
  { header: 'Invoice Qty', get: (r) => r.qty, width: 10 },
  { header: 'Details', get: (r) => r.details, width: 30 },
  { header: 'Status', get: (r) => r.status, width: 48 },
];

export function exportRecords(records: ValidatedRecord[], sheetName: string, fileName: string) {
  const data = records.map((r) => Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.header, c.get(r)])));
  const sheet = XLSX.utils.json_to_sheet(data, { header: EXPORT_COLUMNS.map((c) => c.header) });
  sheet['!cols'] = EXPORT_COLUMNS.map((c) => ({ wch: c.width }));
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: EXPORT_COLUMNS.length - 1 } }) };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, fileName);
}
