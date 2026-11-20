import type { RawRow } from './types';

/** One driver, in one vehicle, on one delivery day, as read from a report. */
export interface DriverDay {
  date: string; // YYYY-MM-DD
  driverKey: string; // the driver code from the report, or the name when there is no code
  driverName: string;
  vehicle: string; // upper case, no spaces. Empty when the report has no vehicle.
  invoiceCount: number;
  tripCount: number;
  trips: string[];
  weight: number;
}

export type DriverFlagKind = 'multi_vehicle' | 'shared_vehicle' | 'no_vehicle';

export const DRIVER_FLAG_LABEL: Record<DriverFlagKind, string> = {
  multi_vehicle: 'More than one vehicle',
  shared_vehicle: 'Vehicle shared',
  no_vehicle: 'No vehicle on report',
};

export const DRIVER_REVIEW_REASONS = [
  'Vehicle swapped during the day',
  'Shift change on the same vehicle',
  'Second vehicle for an extra run',
  'Wrong vehicle on the report',
  'Other (describe)',
] as const;
export const DRIVER_OTHER_REASON = 'Other (describe)';

const VEHICLE_COLUMNS = ['Vehicle', 'Vehicle No', 'Vehicle Reg', 'Vehicle Registration', 'Reg No'];

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim());

export function normaliseVehicle(value: unknown): string {
  return text(value).toUpperCase().replace(/[\s-]+/g, '');
}

function isoFromParts(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** Reads a delivery date written as 19-11-2026, 2026-11-19, a real date, or an Excel date number. */
export function parseDeliveryDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : isoFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    return new Date(Math.round((value - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = text(value);
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (dmy) {
    const first = Number(dmy[1]);
    const second = Number(dmy[2]);
    // South African reports are day first. Only swap when the month cannot be right.
    return second > 12 && first <= 12 ? isoFromParts(Number(dmy[3]), first, second) : isoFromParts(Number(dmy[3]), second, first);
  }
  return null;
}

/** A report that covers a single day names that day in its header. */
export function singleDayFromRange(dateRange: string): string | null {
  const parts = dateRange.split(' to ').map((p) => parseDeliveryDate(p.trim()));
  return parts.length >= 1 && parts[0] && parts.every((p) => p === parts[0]) ? parts[0] : null;
}

function pickVehicle(row: RawRow): string {
  for (const column of VEHICLE_COLUMNS) {
    const value = normaliseVehicle(row[column]);
    if (value) return value;
  }
  return '';
}

/** Groups report rows into one entry per driver, vehicle and day. */
export function buildDriverDays(rows: RawRow[], fallbackDate: string | null = null): { days: DriverDay[]; skipped: number } {
  const groups = new Map<string, DriverDay & { invoices: Set<string>; tripSet: Set<string> }>();
  let skipped = 0;

  rows.forEach((row, index) => {
    const driverName = text(row['Driver Name']) || text(row['Driver']);
    const date = parseDeliveryDate(row['Delivery Date']) ?? fallbackDate;
    if (!driverName || !date) {
      skipped += 1;
      return;
    }
    const driverKey = text(row['Driver']) || driverName;
    const vehicle = pickVehicle(row);
    const key = `${date}|${driverKey}|${vehicle}`;
    let group = groups.get(key);
    if (!group) {
      group = { date, driverKey, driverName, vehicle, invoiceCount: 0, tripCount: 0, trips: [], weight: 0, invoices: new Set(), tripSet: new Set() };
      groups.set(key, group);
    }
    group.invoices.add(text(row['Invoice No']) || `row-${index}`);
    const trip = text(row['Document ID']);
    if (trip) group.tripSet.add(trip);
    group.weight += parseFloat(text(row['Weight']).replace(/[^0-9.-]/g, '')) || 0;
  });

  const days = [...groups.values()].map(({ invoices, tripSet, ...day }) => ({
    ...day,
    invoiceCount: invoices.size,
    tripCount: tripSet.size,
    trips: [...tripSet].sort(),
    weight: Math.round(day.weight * 100) / 100,
  }));
  days.sort((a, b) => b.date.localeCompare(a.date) || a.driverName.localeCompare(b.driverName) || a.vehicle.localeCompare(b.vehicle));
  return { days, skipped };
}

export interface DayKeyed {
  date: string;
  driverKey: string;
  driverName: string;
  vehicle: string;
}

export const dayRowKey = (r: Pick<DayKeyed, 'date' | 'driverKey' | 'vehicle'>) => `${r.date}|${r.driverKey}|${r.vehicle}`;

export interface ReviewGroup<T extends DayKeyed> {
  id: string;
  kind: DriverFlagKind;
  date: string;
  title: string;
  rows: T[];
}

/** Finds the days that need a person to look: a driver in 2+ vehicles, a vehicle with 2+ drivers, or no vehicle. */
export function buildReviewGroups<T extends DayKeyed>(rows: T[]): ReviewGroup<T>[] {
  const byDate = new Map<string, T[]>();
  for (const row of rows) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);

  const groups: ReviewGroup<T>[] = [];
  for (const [date, dayRows] of byDate) {
    const byDriver = new Map<string, T[]>();
    const byVehicle = new Map<string, T[]>();
    for (const row of dayRows) {
      if (!row.vehicle) {
        groups.push({ id: `${date}|none|${row.driverKey}`, kind: 'no_vehicle', date, title: `${row.driverName} has no vehicle on the report`, rows: [row] });
        continue;
      }
      byDriver.set(row.driverKey, [...(byDriver.get(row.driverKey) ?? []), row]);
      byVehicle.set(row.vehicle, [...(byVehicle.get(row.vehicle) ?? []), row]);
    }
    for (const [driverKey, driverRows] of byDriver) {
      if (new Set(driverRows.map((r) => r.vehicle)).size > 1) {
        const vehicles = [...new Set(driverRows.map((r) => r.vehicle))].sort();
        groups.push({ id: `${date}|multi|${driverKey}`, kind: 'multi_vehicle', date, title: `${driverRows[0].driverName} used ${vehicles.join(' and ')}`, rows: driverRows });
      }
    }
    for (const [vehicle, vehicleRows] of byVehicle) {
      const drivers = [...new Map(vehicleRows.map((r) => [r.driverKey, r.driverName])).values()].sort();
      if (drivers.length > 1) {
        groups.push({ id: `${date}|shared|${vehicle}`, kind: 'shared_vehicle', date, title: `${drivers.join(' and ')} both used ${vehicle}`, rows: vehicleRows });
      }
    }
  }
  groups.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  return groups;
}

/** Which flags apply to each row, keyed by dayRowKey. */
export function flagsByRow<T extends DayKeyed>(rows: T[]): Map<string, DriverFlagKind[]> {
  const result = new Map<string, DriverFlagKind[]>();
  for (const group of buildReviewGroups(rows)) {
    for (const row of group.rows) {
      const key = dayRowKey(row);
      result.set(key, [...(result.get(key) ?? []), group.kind]);
    }
  }
  return result;
}

export function summariseDay(rows: Pick<DayKeyed, 'driverKey' | 'vehicle'>[]): { drivers: number; vehicles: number } {
  return {
    drivers: new Set(rows.map((r) => r.driverKey)).size,
    vehicles: new Set(rows.map((r) => r.vehicle).filter(Boolean)).size,
  };
}

export interface DriverHistorySummary {
  driverKey: string;
  driverName: string;
  days: number;
  vehicles: { vehicle: string; days: number; first: string; last: string }[];
}

/** For each driver, which vehicles they used and on how many days. */
export function summariseByDriver<T extends DayKeyed>(rows: T[]): DriverHistorySummary[] {
  const drivers = new Map<string, { name: string; dates: Set<string>; vehicles: Map<string, Set<string>> }>();
  for (const row of rows) {
    const entry = drivers.get(row.driverKey) ?? { name: row.driverName, dates: new Set<string>(), vehicles: new Map<string, Set<string>>() };
    entry.dates.add(row.date);
    if (row.vehicle) entry.vehicles.set(row.vehicle, (entry.vehicles.get(row.vehicle) ?? new Set()).add(row.date));
    drivers.set(row.driverKey, entry);
  }
  return [...drivers.entries()]
    .map(([driverKey, entry]) => ({
      driverKey,
      driverName: entry.name,
      days: entry.dates.size,
      vehicles: [...entry.vehicles.entries()]
        .map(([vehicle, dates]) => {
          const sorted = [...dates].sort();
          return { vehicle, days: dates.size, first: sorted[0], last: sorted[sorted.length - 1] };
        })
        .sort((a, b) => b.days - a.days || a.vehicle.localeCompare(b.vehicle)),
    }))
    .sort((a, b) => a.driverName.localeCompare(b.driverName));
}

export function formatDriverDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
