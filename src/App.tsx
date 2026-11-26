import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCheck, CloudUpload, Download, KeyRound, LogOut, Menu, Moon, RefreshCw, Sun, UserPlus } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { FILTER_BY_KEY, countFilters, matchesFilter, type FilterKey } from '@/lib/filters';
import { fetchMasterFromServer, EMPTY_MASTER, masterAccountCount, collectUnknownAccounts } from '@/lib/master';
import { exportRecords, readReport } from '@/lib/workbook';
import { validateRows } from '@/lib/validate';
import { loadColorTheme, loadTheme, saveColorTheme, saveTheme, type ColorTheme } from '@/lib/storage';
import { fetchResolutionEvents, fetchResolutions, saveResolutions } from '@/lib/resolutionStore';
import { MASTER_POLL_INTERVAL_MS } from '@/lib/rules';
import type { MasterData, RawRow, Resolution, ResolutionEvent, ValidatedRecord } from '@/lib/types';
import { Sidebar } from '@/components/Sidebar';
import { LiveFixesCard, type LiveFix } from '@/components/LiveFixesCard';
import { RecordTable } from '@/components/RecordTable';
import { DetailPanel } from '@/components/DetailPanel';
import { UploadZone } from '@/components/UploadZone';
import { Toaster, useToasts } from '@/components/Toaster';
import { MasterModal } from '@/components/MasterModal';
import { PushAccountsDialog } from '@/components/PushAccountsDialog';
import { createReportId } from '@/lib/report';
import { normalizeAccountKey } from '@/lib/rules';
import { OTHER_RESOLUTION_REASON } from '@/lib/resolutionReasons';
import { AuthScreen, AccessDeniedScreen } from '@/components/AuthScreen';
import { SetPasswordDialog } from '@/components/SetPasswordDialog';
import { AddReviewerDialog } from '@/components/AddReviewerDialog';
import { ReviewActivityDialog } from '@/components/ReviewActivityDialog';
import { ResolutionPicker } from '@/components/ResolutionPicker';
import { supabase } from '@/lib/supabase';
import { publishAccountEdit } from '@/lib/masterSync';
import { DriversView } from '@/components/DriversView';
import { useDriverDays } from '@/hooks/useDriverDays';
import { buildDriverDays, buildReviewGroups, singleDayFromRange, summariseDay } from '@/lib/drivers';
import { InvoiceHistoryView } from '@/components/InvoiceHistoryView';

export default function App() {
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const [serverMaster, setServerMaster] = useState<MasterData>(EMPTY_MASTER);
  const [sessionMaster, setSessionMaster] = useState<MasterData | null>(null);
  const [masterStatus, setMasterStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [masterOpen, setMasterOpen] = useState(false);
  const [masterView, setMasterView] = useState<'search' | 'accounts' | 'manage'>('search');
  const [pushOpen, setPushOpen] = useState(false);
  const [pushPreselect, setPushPreselect] = useState<string[]>([]);
  const [uploadKey, setUploadKey] = useState('');
  const master = sessionMaster ?? serverMaster;

  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [resolutionEvents, setResolutionEvents] = useState<ResolutionEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [liveFeed, setLiveFeed] = useState<LiveFix[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [addReviewerOpen, setAddReviewerOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [dark, setDark] = useState(loadTheme);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(loadColorTheme);
  const [view, setView] = useState<'invoices' | 'drivers' | 'history'>(() => {
    try {
      const saved = sessionStorage.getItem('invoice-review-active-view-v1');
      return saved === 'drivers' || saved === 'history' ? saved : 'invoices';
    } catch {
      return 'invoices';
    }
  });
  const [filter, setFilter] = useState<FilterKey>('needsaction');
  const [search, setSearch] = useState('');
  const [groupByAccount, setGroupByAccount] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [bulkReason, setBulkReason] = useState('');
  const [bulkNote, setBulkNote] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toasts, notify, dismiss } = useToasts();

  const records = useMemo<ValidatedRecord[]>(
    () => (rows ? validateRows(rows, master) : []),
    [rows, master],
  );

  const reportDays = useMemo(
    () => (rows ? buildDriverDays(rows, singleDayFromRange(dateRange)).days : []),
    [rows, dateRange],
  );
  const driverDays = useDriverDays({ enabled: !!session && isMember, reportId, reportDays, notify });
  const driversToReview = useMemo(
    () => buildReviewGroups(driverDays.stored).filter((g) => !g.rows.every((r) => !!r.reviewedAt)).length,
    [driverDays.stored],
  );
  const driversOut = useMemo(() => {
    const source = reportDays.length ? reportDays : driverDays.stored;
    const latest = source.reduce((max, d) => (d.date > max ? d.date : max), '');
    return latest ? summariseDay(source.filter((d) => d.date === latest)).drivers : 0;
  }, [reportDays, driverDays.stored]);

  const counts = useMemo(() => countFilters(records, resolutions), [records, resolutions]);
  const unknownAccounts = useMemo(() => collectUnknownAccounts(records), [records]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(
      (r) => matchesFilter(r, filter, resolutions[String(r.id)]) && (!q || r.searchText.includes(q)),
    );
  }, [records, filter, search, resolutions]);

  const checkedRecords = useMemo(() => records.filter((record) => checked.has(record.id)), [records, checked]);

  const selected = records.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setAuthLoading(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
      setMembershipChecked(false);
      setIsMember(false);
      setIsAdmin(false);
      setMustChangePassword(false);
      if (event === 'PASSWORD_RECOVERY') setPasswordDialogOpen(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setResolutions({});
      setMembershipChecked(false);
      setIsMember(false);
      return;
    }
    let active = true;
    supabase.from('invoice_review_members').select('user_id, role, must_change_password').maybeSingle().then(({ data, error }) => {
      if (!active) return;
      setIsMember(!error && !!data);
      setIsAdmin(!error && data?.role === 'admin');
      setMustChangePassword(!error && data?.must_change_password === true);
      if (!error && data?.must_change_password === true) setPasswordDialogOpen(true);
      setMembershipChecked(true);
    });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    try { sessionStorage.setItem('invoice-review-active-view-v1', view); } catch { /* Keep navigation usable when storage is unavailable. */ }
  }, [view]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    saveTheme(dark);
  }, [dark]);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-green', colorTheme === 'green');
    saveColorTheme(colorTheme);
  }, [colorTheme]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchMasterFromServer();
        if (cancelled) return;
        setServerMaster(data);
        setMasterStatus('ready');
      } catch {
        if (!cancelled) setMasterStatus((s) => (s === 'ready' ? s : 'offline'));
      }
    };
    load();
    const timer = setInterval(load, MASTER_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => { setLiveFeed([]); }, [reportId]);

  useEffect(() => {
    if (!reportId || !session || !isMember) {
      setResolutions({});
      setResolutionEvents([]);
      return;
    }
    let active = true;
    setActivityLoading(true);
    Promise.all([fetchResolutions(reportId), fetchResolutionEvents(reportId)])
      .then(([data, events]) => { if (active) { setResolutions(data); setResolutionEvents(events); } })
      .catch(() => { if (active) notify('Could not load saved reviews. Check your connection and reload.', 'error'); })
      .finally(() => { if (active) setActivityLoading(false); });
    return () => { active = false; };
  }, [reportId, session, isMember]);

  useEffect(() => {
    if (!reportId || !session || !isMember || activityLoading) return;
    const channel = supabase
      .channel(`invoice-review-${reportId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'invoice_resolution_events',
        filter: `report_id=eq.${reportId}`,
      }, ({ new: row }) => {
        const event = row as {
          id: number; report_id: string; record_id: string; invoice_no: string;
          action: 'resolved' | 'reopened'; reason: string; note: string;
          actor_email: string; occurred_at: string;
        };
        const record = records.find((candidate) => String(candidate.id) === event.record_id);
        const incoming: ResolutionEvent = {
          id: event.id,
          recordId: event.record_id,
          invoiceNo: event.invoice_no,
          action: event.action,
          reason: event.reason,
          note: event.note,
          actorEmail: event.actor_email,
          occurredAt: event.occurred_at,
        };
        setResolutionEvents((previous) => {
          const withoutOptimisticCopy = previous.filter((item) => !(item.id > 1_000_000_000_000 && item.recordId === incoming.recordId && item.action === incoming.action && item.actorEmail === incoming.actorEmail && item.reason === incoming.reason));
          if (withoutOptimisticCopy.some((item) => item.id === incoming.id)) return withoutOptimisticCopy;
          return [incoming, ...withoutOptimisticCopy].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
        });
        setResolutions((previous) => {
          const next = { ...previous };
          if (incoming.action === 'reopened') delete next[incoming.recordId];
          else next[incoming.recordId] = {
            status: 'resolved', reason: incoming.reason, note: incoming.note,
            resolvedAt: incoming.occurredAt, resolvedBy: incoming.actorEmail,
          };
          return next;
        });
        if (incoming.actorEmail.toLowerCase() !== (session.user.email ?? '').toLowerCase()) {
          setLiveFeed((previous) => previous.some((f) => f.id === `e${incoming.id}`) ? previous : [{
            id: `e${incoming.id}`,
            invoiceNo: incoming.invoiceNo,
            customer: record?.customer ?? '',
            account: record?.account ?? '',
            action: incoming.action,
            reason: incoming.reason,
            note: incoming.note,
            actor: incoming.actorEmail,
            at: incoming.occurredAt,
          }, ...previous].slice(0, 200));
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [reportId, session, isMember, activityLoading, records]);

  const handleFile = async (file: File) => {
    setIsReading(true);
    setLoadError(null);
    try {
      const parsed = await readReport(file);
      const nextReportId = await createReportId(parsed.rows, parsed.dateRange);
      setRows(parsed.rows);
      setReportId(nextReportId);
      setFileName(file.name);
      setDateRange(parsed.dateRange);
      setFilter('needsaction');
      setView('invoices');
      setGroupByAccount(true);
      setSelectedId(null);
      setChecked(new Set());
      notify(`Loaded ${parsed.rows.length.toLocaleString()} rows from ${file.name}`, 'success');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setIsReading(false);
    }
  };

  const handleSessionMaster = (data: MasterData, name: string) => {
    setSessionMaster(data);
    setMasterOpen(false);
    notify(`Using ${name} for this session`, 'success');
  };

  const handlePublished = (data: MasterData, addedCount: number) => {
    setServerMaster(data);
    setSessionMaster(null);
    setMasterStatus('ready');
    setMasterOpen(false);
    notify(
      addedCount ? `Added ${addedCount.toLocaleString()} new accounts to the master file` : 'The master file already had these accounts',
      'success',
    );
  };

  const markAccountDropship = async (record: ValidatedRecord) => {
    const account = normalizeAccountKey(record.account);
    const territory = serverMaster.territory[account];
    if (!territory) { notify('Push this account to the master file first, then mark it as drop-ship.', 'error'); return; }
    if (!uploadKey.trim()) { notify('Enter the upload key first (Master file, then Manage accounts).', 'error'); return; }
    const info = serverMaster.accountInfo[account];
    try {
      const { after } = await publishAccountEdit(
        account,
        { customer: info?.customer ?? record.customer, address: info?.address ?? '', territory, dropship: true },
        uploadKey.trim(),
      );
      setServerMaster(after);
      setSessionMaster(null);
      notify(`Account ${account} is now marked as drop-ship`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not mark that account as drop-ship.', 'error');
    }
  };

  const openPushDialog = (accounts: string[]) => {
    setPushPreselect(accounts);
    setPushOpen(true);
  };

  const pushAccountsFromChecked = () => {
    const known = new Set(unknownAccounts.map((c) => c.account));
    const fromChecked = [...new Set(
      records.filter((r) => checked.has(r.id) && r.isUnknownAccount).map((r) => normalizeAccountKey(r.account)),
    )].filter((account) => known.has(account));
    openPushDialog(fromChecked.length > 0 ? fromChecked : unknownAccounts.map((c) => c.account));
  };

  const handleAccountsPushed = (data: MasterData, addedCount: number, requestedCount: number) => {
    setServerMaster(data);
    setSessionMaster(null);
    setMasterStatus('ready');
    setPushOpen(false);
    if (addedCount === 0) notify('The master file already had those accounts', 'success');
    else if (addedCount < requestedCount) notify(`Added ${addedCount} of ${requestedCount} accounts. The master file already had the rest.`, 'success');
    else notify(`Pushed ${addedCount.toLocaleString()} ${addedCount === 1 ? 'account' : 'accounts'} to the master file`, 'success');
  };

  const setResolution = async (recordsToUpdate: ValidatedRecord[], status: Resolution['status'] | null, reason = '', note = '') => {
    if (!reportId) return false;
    const uniqueRecords = [...new Map(recordsToUpdate.map((record) => [record.id, record])).values()];
    if (uniqueRecords.length === 0) return true;
    const keys = uniqueRecords.map((record) => String(record.id));
    try {
      await saveResolutions(reportId, uniqueRecords.map((record) => ({ recordId: String(record.id), invoiceNo: record.invoiceNo })), status, reason, note, session?.user.email ?? 'Unknown reviewer');
      setResolutions((prev) => {
        const next = { ...prev };
        for (const key of keys) {
          if (status === null) delete next[key];
          else next[key] = { status, reason, note, resolvedAt: new Date().toISOString(), resolvedBy: session?.user.email ?? 'Unknown reviewer' };
        }
        return next;
      });
      const changedAt = new Date().toISOString();
      setResolutionEvents((prev) => [
        ...uniqueRecords.map((record, index) => ({ id: Date.now() + index, recordId: String(record.id), invoiceNo: record.invoiceNo, action: status === null ? 'reopened' as const : 'resolved' as const, reason: status === null ? '' : reason, note: status === null ? '' : note, actorEmail: session?.user.email ?? 'Unknown reviewer', occurredAt: changedAt })),
        ...prev,
      ]);
      return true;
    } catch {
      notify('Could not save that change. Your review has not been updated.', 'error');
      return false;
    }
  };

  const resolveRecord = async (record: ValidatedRecord, reason: string, note: string) => {
    const saved = await setResolution([record], 'resolved', reason, note);
    if (saved) {
      notify(`Invoice ${record.invoiceNo} resolved`, 'success', reason);
    }
    return saved;
  };

  const reopenRecord = async (record: ValidatedRecord) => {
    const saved = await setResolution([record], null);
    if (saved) notify(`Invoice ${record.invoiceNo} reopened`);
  };

  const toggleChecked = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const markCheckedResolved = async () => {
    if (!bulkReason || (bulkReason === OTHER_RESOLUTION_REASON && !bulkNote.trim())) return;
    const saved = await setResolution(checkedRecords, 'resolved', bulkReason, bulkNote.trim());
    if (saved) {
      notify(`${checkedRecords.length} ${checkedRecords.length === 1 ? 'invoice' : 'invoices'} resolved`, 'success', bulkReason);
      setChecked(new Set());
      setBulkReason('');
      setBulkNote('');
    }
  };

  const exportCurrent = () => {
    const base = fileName.replace(/\.[^.]+$/, '') || 'report';
    exportRecords(visible, FILTER_BY_KEY[filter].label, `${base} - ${FILTER_BY_KEY[filter].label}.xlsx`);
    notify(`Exported ${visible.length.toLocaleString()} rows`, 'success');
  };

  const changeFilter = (key: FilterKey) => {
    setFilter(key);
    setView('invoices');
    setChecked(new Set());
    setSidebarOpen(false);
  };

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-ink-3">Checking your sign-in…</div>;
  if (!session) return <AuthScreen />;
  if (!membershipChecked) return <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-ink-3">Checking team access…</div>;
  if (!isMember) return <AccessDeniedScreen onSignOut={() => { void supabase.auth.signOut(); }} />;

  return (
    <div className="flex h-full">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        filter={filter}
        counts={counts}
        onFilter={changeFilter}
        view={view}
        onOpenDrivers={() => { setView('drivers'); setSidebarOpen(false); }}
        onOpenHistory={() => { setView('history'); setSidebarOpen(false); }}
        driversOut={driversOut}
        driversToReview={driversToReview}
        masterStatus={masterStatus}
        masterCount={masterAccountCount(master)}
        hasReport={!!rows}
        fileName={fileName}
        onNewReport={() => document.getElementById('report-file-input')?.click()}
        isAdmin={isAdmin}
        onOpenMaster={() => { setMasterView('accounts'); setMasterOpen(true); }}
        onOpenAccountSearch={() => { setMasterView('search'); setMasterOpen(true); }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 md:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="btn-secondary px-2.5 md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <img src="/ccl-logo.png" alt="CCL Logistics & Distribution" className="h-10 w-auto md:hidden" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight">Report review</h1>
              <p className="truncate text-xs text-ink-3">
                {rows ? `${fileName}${dateRange ? ` · ${dateRange}` : ''}` : 'Upload a report to start validating'}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isAdmin && <button onClick={() => setAddReviewerOpen(true)} className="btn-secondary h-9 gap-1.5 px-2.5" title="Add a reviewer"><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Add reviewer</span></button>}
              <button onClick={() => setActivityOpen(true)} className="btn-secondary h-9 gap-1.5 px-2.5" title="See who resolved invoices"><Activity className="h-4 w-4" /><span className="hidden sm:inline">Activity</span></button>
              <div className="hidden items-center gap-1 rounded-lg border border-line bg-surface px-1.5 sm:flex" role="group" aria-label="Colour theme">
                {([['blue', 'Blue theme', '#2563eb'], ['green', 'CCL green theme', '#2e7d4f']] as const).map(([key, label, colour]) => (
                  <button
                    key={key}
                    onClick={() => setColorTheme(key)}
                    aria-label={label}
                    aria-pressed={colorTheme === key}
                    title={label}
                    className={`h-5 w-5 rounded-full border-2 transition-transform ${colorTheme === key ? 'scale-110 border-ink' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    style={{ backgroundColor: colour }}
                  />
                ))}
              </div>
              <button
                onClick={() => setDark((d) => !d)}
                className="btn-secondary h-9 w-9 p-0"
                aria-label="Toggle dark mode"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button onClick={() => setPasswordDialogOpen(true)} className="btn-secondary h-9 gap-1.5 px-2.5" title="Set or change your password">
                <KeyRound className="h-4 w-4" />
                <span className="hidden sm:inline">Set password</span>
              </button>
              <button onClick={() => { void supabase.auth.signOut(); }} className="btn-secondary h-9 w-9 p-0" aria-label="Sign out" title="Sign out">
                <LogOut className="h-4 w-4" />
              </button>
              {view === 'invoices' && <button onClick={exportCurrent} disabled={!rows || visible.length === 0} className="btn-primary">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export view</span>
              </button>}
            </div>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
          {view === 'history' ? (
            <InvoiceHistoryView notify={notify} />
          ) : view === 'drivers' ? (
            <DriversView
              reportDays={reportDays}
              hasReport={!!rows}
              stored={driverDays.stored}
              loading={driverDays.loading}
              saveState={driverDays.saveState}
              isAdmin={isAdmin}
              onReview={driverDays.review}
              onReopen={driverDays.reopen}
              onDelete={driverDays.remove}
              onRetrySave={driverDays.retrySave}
            />
          ) : !rows ? (
            <UploadZone onFile={handleFile} busy={isReading} error={loadError} />
          ) : (
            <>
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-3">CURRENT REVIEW</p>
                  <h2 className="truncate text-lg font-semibold text-ink">{FILTER_BY_KEY[filter].label}</h2>
                  <p className="text-sm text-ink-2">{fileName}{dateRange ? ` · ${dateRange}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-lg bg-accent-soft px-3 py-2 font-medium text-accent-ink">{visible.length.toLocaleString()} shown</span>
                  <span className="rounded-lg bg-surface-2 px-3 py-2 text-ink-2">{counts.needsaction.toLocaleString()} need action</span>
                </div>
              </section>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-2">
                  <input type="checkbox" checked={groupByAccount} onChange={(event) => setGroupByAccount(event.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />
                  Group by account
                </label>
                <div className="relative min-w-[220px] flex-1">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search invoice, customer, driver, status..."
                    className="field pl-3"
                  />
                </div>
                <span className="text-xs text-ink-3">
                  Showing {visible.length.toLocaleString()} of {records.length.toLocaleString()}
                </span>
                {filter === 'unknownaccount' && unknownAccounts.length > 0 && !isAdmin && (
                  <span className="text-sm text-ink-3">Only the admin can add accounts to the master file.</span>
                )}
                {isAdmin && filter === 'unknownaccount' && unknownAccounts.length > 0 && (
                  <>
                    <label className="relative block min-w-[220px] flex-1 sm:max-w-xs">
                      <span className="sr-only">Upload key for adding accounts</span>
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                      <input
                        type="password"
                        autoComplete="off"
                        value={uploadKey}
                        onChange={(event) => setUploadKey(event.target.value)}
                        placeholder="Upload key"
                        aria-label="Upload key for adding accounts"
                        className="field h-10 pl-9"
                      />
                    </label>
                    <button onClick={pushAccountsFromChecked} className="btn-primary h-10" title="Add these accounts to the master file">
                      <CloudUpload className="h-4 w-4" />
                      Push account{unknownAccounts.length === 1 ? '' : 's'} to master file
                    </button>
                  </>
                )}
              </div>


              {checked.size > 0 && (
                <section className="sticky bottom-2 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-surface/95 p-3 shadow-lg backdrop-blur animate-pop-in">
                  <div className="mr-auto min-w-[130px]">
                    <p className="text-sm font-semibold text-ink">{checkedRecords.length} invoice{checkedRecords.length === 1 ? '' : 's'} selected</p>
                    <p className="max-w-[340px] truncate text-xs text-ink-3" title={checkedRecords.map((record) => record.invoiceNo).join(', ')}>
                      {checkedRecords.slice(0, 4).map((record) => record.invoiceNo).join(' · ')}{checkedRecords.length > 4 ? ` · +${checkedRecords.length - 4} more` : ''}
                    </p>
                  </div>
                  <ResolutionPicker label="Resolution reason for selected invoices" value={bulkReason} onChange={setBulkReason} placeholder="Choose resolution" className="w-full sm:w-60" />
                  {bulkReason === OTHER_RESOLUTION_REASON && (
                    <input aria-label="Describe the resolution" value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} placeholder="Describe what was done" className="field w-full sm:w-56" />
                  )}
                  <button onClick={markCheckedResolved} disabled={!bulkReason || (bulkReason === OTHER_RESOLUTION_REASON && !bulkNote.trim())} className="btn-primary h-10 px-4">
                    <CheckCheck className="h-4 w-4" /> Mark resolved
                  </button>
                  <button onClick={() => { setChecked(new Set()); setBulkReason(''); setBulkNote(''); }} className="btn-secondary h-10 px-4">Clear selection</button>
                </section>
              )}

              <RecordTable
                key={reportId ?? 'no-report'}
                records={visible}
                resolutions={resolutions}
                selectedId={selectedId}
                checked={checked}
                activeFilter={filter}
                groupByAccount={groupByAccount}
                onOpen={(r) => setSelectedId(r.id)}
                onToggleChecked={toggleChecked}
                onToggleAll={(all) => setChecked(all ? new Set(visible.map((r) => r.id)) : new Set())}
              />
            </>
          )}
        </main>
      </div>

      <DetailPanel
        key={selected?.id ?? 'none'}
        record={selected}
        resolution={selected ? resolutions[String(selected.id)] : undefined}
        onClose={() => setSelectedId(null)}
        onResolve={resolveRecord}
        onReopen={reopenRecord}
        onPushAccount={isAdmin ? (record) => openPushDialog([normalizeAccountKey(record.account)]) : undefined}
        onMarkDropship={isAdmin ? markAccountDropship : undefined}
        canMarkDropship={!!selected && normalizeAccountKey(selected.account) in serverMaster.territory}
      />

      <input
        id="report-file-input"
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {rows && (
        <button
          onClick={() => document.getElementById('report-file-input')?.click()}
          className="btn-secondary fixed bottom-5 right-5 z-30 shadow-pop md:hidden"
        >
          <RefreshCw className="h-4 w-4" /> New report
        </button>
      )}
      {masterOpen && (
        <MasterModal
          master={master}
          serverMaster={serverMaster}
          isAdmin={isAdmin}
          initialTab={masterView}
          uploadKey={uploadKey}
          onUploadKeyChange={setUploadKey}
          onMasterChanged={(data, message) => { setServerMaster(data); setSessionMaster(null); setMasterStatus('ready'); notify(message, 'success'); }}
          onClose={() => setMasterOpen(false)}
          onUseLocal={handleSessionMaster}
          onPublished={handlePublished}
          onError={(message) => notify(message, 'error')}
        />
      )}
      {pushOpen && (
        <PushAccountsDialog
          candidates={unknownAccounts}
          initialSelected={pushPreselect}
          uploadKey={uploadKey}
          onUploadKeyChange={setUploadKey}
          onClose={() => setPushOpen(false)}
          onPushed={handleAccountsPushed}
          onError={(message) => notify(message, 'error')}
        />
      )}
      <LiveFixesCard fixes={liveFeed} onClose={() => setLiveFeed([])} />
      <Toaster toasts={toasts} onDismiss={dismiss} />
      {passwordDialogOpen && (
        <SetPasswordDialog
          required={mustChangePassword}
          onClose={() => setPasswordDialogOpen(false)}
          onSaved={async () => {
            if (mustChangePassword) {
              const { error } = await supabase.from('invoice_review_members').update({ must_change_password: false }).eq('user_id', session.user.id);
              if (error) throw error;
              setMustChangePassword(false);
            }
            setPasswordDialogOpen(false);
            notify('Your password has been saved', 'success');
          }}
        />
      )}
      {addReviewerOpen && <AddReviewerDialog onClose={() => setAddReviewerOpen(false)} />}
      {activityOpen && <ReviewActivityDialog events={resolutionEvents} loading={activityLoading} reportName={fileName} onClose={() => setActivityOpen(false)} />}
    </div>
  );
}

