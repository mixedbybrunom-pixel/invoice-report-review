import { supabase } from '@/lib/supabase';
import type { DriverDay } from './drivers';

const PAGE_SIZE = 1000;
const WRITE_CHUNK = 200;
const MAX_ROWS = 20000;

export interface StoredDriverDay {
  id: number;
  date: string;
  driverKey: string;
  driverName: string;
  vehicle: string;
  invoiceCount: number;
  tripCount: number;
  trips: string[];
  weight: number;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string;
  updatedBy: string;
}

interface DriverDayRow {
  id: number;
  delivery_date: string;
  driver_key: string;
  driver_name: string;
  vehicle: string;
  invoice_count: number;
  trip_count: number;
  trips: string;
  weight: number | string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string;
  updated_by: string;
}

const COLUMNS = 'id, delivery_date, driver_key, driver_name, vehicle, invoice_count, trip_count, trips, weight, reviewed_at, reviewed_by, review_note, updated_by';

const fromRow = (r: DriverDayRow): StoredDriverDay => ({
  id: r.id,
  date: r.delivery_date,
  driverKey: r.driver_key,
  driverName: r.driver_name,
  vehicle: r.vehicle,
  invoiceCount: r.invoice_count,
  tripCount: r.trip_count,
  trips: r.trips ? r.trips.split(',').filter(Boolean) : [],
  weight: Number(r.weight) || 0,
  reviewedAt: r.reviewed_at,
  reviewedBy: r.reviewed_by,
  reviewNote: r.review_note ?? '',
  updatedBy: r.updated_by ?? '',
});

/** Adds a report's driver days to the history. The same day uploaded twice updates the entry; it never doubles it. */
export async function saveDriverDays(days: DriverDay[]): Promise<number> {
  const rows = days
    .filter((d) => d.vehicle)
    .map((d) => ({
      delivery_date: d.date,
      driver_key: d.driverKey,
      driver_name: d.driverName,
      vehicle: d.vehicle,
      invoice_count: d.invoiceCount,
      trip_count: d.tripCount,
      trips: d.trips.join(','),
      weight: d.weight,
    }));
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const { error } = await supabase.from('driver_days').upsert(rows.slice(i, i + WRITE_CHUNK), { onConflict: 'delivery_date,driver_key,vehicle' });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

export async function fetchDriverDays(): Promise<StoredDriverDay[]> {
  const result: StoredDriverDay[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('driver_days')
      .select(COLUMNS)
      .order('delivery_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as DriverDayRow[];
    result.push(...page.map(fromRow));
    if (page.length < PAGE_SIZE) break;
  }
  return result;
}

export async function reviewDriverDays(ids: number[], note: string): Promise<void> {
  const { error } = await supabase.from('driver_days').update({ reviewed_at: new Date().toISOString(), review_note: note }).in('id', ids);
  if (error) throw new Error(error.message);
}

export async function reopenDriverDays(ids: number[]): Promise<void> {
  const { error } = await supabase.from('driver_days').update({ reviewed_at: null, review_note: '' }).in('id', ids);
  if (error) throw new Error(error.message);
}

/** Admin only. Returns false when the database did not allow the delete. */
export async function deleteDriverDay(id: number): Promise<boolean> {
  const { data, error } = await supabase.from('driver_days').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
