import { useCallback, useEffect, useRef, useState } from 'react';
import type { DriverDay } from '@/lib/drivers';
import { deleteDriverDay, fetchDriverDays, reopenDriverDays, reviewDriverDays, saveDriverDays, type StoredDriverDay } from '@/lib/driverStore';

export type DriverSaveState = 'idle' | 'saving' | 'saved' | 'error';
type Notify = (message: string, tone?: 'success' | 'error', detail?: string) => void;

interface Options {
  /** True once the person is signed in and is a team member. */
  enabled: boolean;
  reportId: string | null;
  reportDays: DriverDay[];
  notify: Notify;
}

/** Saves each uploaded report's driver days, loads the history, and handles reviews. */
export function useDriverDays({ enabled, reportId, reportDays, notify }: Options) {
  const [stored, setStored] = useState<StoredDriverDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<DriverSaveState>('idle');
  const savedFor = useRef<string | null>(null);
  const notifyRef = useRef(notify);
  useEffect(() => { notifyRef.current = notify; }, [notify]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setStored(await fetchDriverDays());
    } catch {
      notifyRef.current('Could not load driver history. Check your connection and reload.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveReport = useCallback(async () => {
    setSaveState('saving');
    try {
      await saveDriverDays(reportDays);
      await reload();
      setSaveState('saved');
    } catch {
      savedFor.current = null;
      setSaveState('error');
      notifyRef.current('Could not save the driver days from this report.', 'error', 'Open Drivers and use Try again.');
    }
  }, [reportDays, reload]);

  useEffect(() => {
    if (!enabled) { setStored([]); return; }
    void reload();
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled || !reportId || reportDays.length === 0 || savedFor.current === reportId) return;
    savedFor.current = reportId;
    void saveReport();
  }, [enabled, reportId, reportDays, saveReport]);

  const run = async (action: () => Promise<unknown>, failMessage: string) => {
    try {
      await action();
      await reload();
      return true;
    } catch {
      notifyRef.current(failMessage, 'error');
      return false;
    }
  };

  return {
    stored,
    loading,
    saveState,
    retrySave: () => { savedFor.current = reportId; void saveReport(); },
    review: (ids: number[], note: string) => run(() => reviewDriverDays(ids, note), 'Could not save that review.'),
    reopen: (ids: number[]) => run(() => reopenDriverDays(ids), 'Could not reopen that review.'),
    remove: async (id: number) => {
      try {
        const done = await deleteDriverDay(id);
        if (!done) { notifyRef.current('Only the admin can delete driver history.', 'error'); return false; }
        await reload();
        return true;
      } catch {
        notifyRef.current('Could not delete that entry.', 'error');
        return false;
      }
    },
  };
}
