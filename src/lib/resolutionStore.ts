import { supabase } from '@/lib/supabase';
import type { Resolution, ResolutionEvent, ResolutionStatus } from './types';

const PAGE_SIZE = 1000;
const WRITE_CHUNK = 200;

interface ResolutionRow {
  record_id: string;
  invoice_no: string;
  status: ResolutionStatus;
  reason: string;
  note: string;
  resolved_at: string;
  resolved_by: string;
}

interface ResolutionEventRow {
  id: number;
  record_id: string;
  invoice_no: string;
  action: 'resolved' | 'reopened';
  reason: string;
  note: string;
  actor_email: string;
  occurred_at: string;
}

export async function fetchResolutions(reportId: string): Promise<Record<string, Resolution>> {
  const result: Record<string, Resolution> = {};
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('invoice_resolutions')
      .select('record_id, invoice_no, status, reason, note, resolved_at, resolved_by')
      .eq('report_id', reportId)
      .order('record_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ResolutionRow[];
    for (const row of rows) {
      result[row.record_id] = { status: row.status, reason: row.reason, note: row.note, resolvedAt: row.resolved_at, resolvedBy: row.resolved_by };
    }
    if (rows.length < PAGE_SIZE) return result;
  }
}

export async function fetchResolutionEvents(reportId: string): Promise<ResolutionEvent[]> {
  const result: ResolutionEvent[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('invoice_resolution_events')
      .select('id, record_id, invoice_no, action, reason, note, actor_email, occurred_at')
      .eq('report_id', reportId)
      .order('occurred_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ResolutionEventRow[];
    for (const row of rows) result.push({ id: row.id, recordId: row.record_id, invoiceNo: row.invoice_no, action: row.action, reason: row.reason, note: row.note, actorEmail: row.actor_email, occurredAt: row.occurred_at });
    if (rows.length < PAGE_SIZE) return result;
  }
}

export async function saveResolutions(
  reportId: string,
  records: Array<{ recordId: string; invoiceNo: string }>,
  status: ResolutionStatus | null,
  reason = '',
  note = '',
  actorEmail = 'Unknown reviewer',
): Promise<void> {
  for (let i = 0; i < records.length; i += WRITE_CHUNK) {
    const chunk = records.slice(i, i + WRITE_CHUNK);
    if (status === null) {
      const { error } = await supabase.from('invoice_resolutions').delete().eq('report_id', reportId).in('record_id', chunk.map((row) => row.recordId));
      if (error) throw new Error(error.message);
      const { error: eventError } = await supabase.from('invoice_resolution_events').insert(chunk.map(({ recordId, invoiceNo }) => ({ report_id: reportId, record_id: recordId, invoice_no: invoiceNo, action: 'reopened', reason: '', note: '', actor_email: actorEmail })));
      if (eventError) throw new Error(eventError.message);
    } else {
      const resolvedAt = new Date().toISOString();
      const { error } = await supabase.from('invoice_resolutions').upsert(
        chunk.map(({ recordId, invoiceNo }) => ({ report_id: reportId, record_id: recordId, invoice_no: invoiceNo, status, reason, note, resolved_at: resolvedAt, resolved_by: actorEmail })),
        { onConflict: 'report_id,record_id' },
      );
      if (error) throw new Error(error.message);
      const { error: eventError } = await supabase.from('invoice_resolution_events').insert(chunk.map(({ recordId, invoiceNo }) => ({ report_id: reportId, record_id: recordId, invoice_no: invoiceNo, action: 'resolved', reason, note, actor_email: actorEmail })));
      if (eventError) throw new Error(eventError.message);
    }
  }
}
