import { useMemo, useState } from 'react';
import { CloudUpload, KeyRound, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { buildAdditionsFromCandidates, type UnknownAccountCandidate } from '@/lib/master';
import { publishAdditions } from '@/lib/masterSync';
import type { MasterData } from '@/lib/types';

interface PushAccountsDialogProps {
  candidates: UnknownAccountCandidate[];
  /** Accounts ticked when the dialog opens. */
  initialSelected: string[];
  uploadKey: string;
  onUploadKeyChange: (key: string) => void;
  onClose: () => void;
  onPushed: (master: MasterData, addedCount: number, requestedCount: number) => void;
  onError: (message: string) => void;
}

export function PushAccountsDialog({ candidates, initialSelected, uploadKey, onUploadKeyChange, onClose, onPushed, onError }: PushAccountsDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [territories, setTerritories] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidates.map((c) => [c.account, c.territory])),
  );
  const [pushing, setPushing] = useState(false);

  const chosen = useMemo(() => candidates.filter((c) => selected.has(c.account)), [candidates, selected]);
  const missingTerritory = chosen.some((c) => !(territories[c.account] ?? '').trim());
  const canPush = chosen.length > 0 && !missingTerritory && uploadKey.trim().length > 0 && !pushing;
  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.account));

  const toggle = (account: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(account)) next.delete(account);
      else next.add(account);
      return next;
    });

  const push = async () => {
    if (!canPush) return;
    setPushing(true);
    try {
      const incoming = buildAdditionsFromCandidates(
        chosen.map((c) => ({ ...c, territory: territories[c.account] ?? '' })),
      );
      const { master, added } = await publishAdditions(incoming, uploadKey.trim());
      onPushed(master, added.length, chosen.length);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Pushing to the master file failed.');
    } finally {
      setPushing(false);
    }
  };

  return (
    <Modal
      title="Push accounts to master file"
      subtitle="Add accounts that are missing from the master file. Check each territory before you push."
      onClose={onClose}
      width="lg"
      footer={
        <>
          <button onClick={onClose} disabled={pushing} className="btn-secondary">Cancel</button>
          <button onClick={push} disabled={!canPush} className="btn-primary">
            {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            Push {chosen.length} {chosen.length === 1 ? 'account' : 'accounts'}
          </button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-ink-3">There are no unknown accounts in this report.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-ink-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => setSelected(e.target.checked ? new Set(candidates.map((c) => c.account)) : new Set())}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
              Select all ({candidates.length})
            </label>
            <span className="text-xs text-ink-3">{chosen.length} selected</span>
          </div>

          <ul className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {candidates.map((c) => {
              const territory = territories[c.account] ?? '';
              const isChosen = selected.has(c.account);
              const conflict = c.territoriesSeen.length > 1;
              return (
                <li key={c.account} className={`rounded-xl border px-4 py-3 ${isChosen ? 'border-accent/40 bg-accent-soft/30' : 'border-line bg-surface'}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Select account ${c.account}`}
                      checked={isChosen}
                      onChange={() => toggle(c.account)}
                      className="mt-1 h-4 w-4 cursor-pointer accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-semibold">{c.account}</p>
                      <p className="mt-0.5 truncate text-sm text-ink-2">{c.customer || 'Customer name not listed'}</p>
                      <p className="mt-0.5 text-xs text-ink-3">{c.invoiceCount} invoice{c.invoiceCount === 1 ? '' : 's'} in this report</p>
                      {conflict && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Seen in more than one territory: {c.territoriesSeen.map((t) => `${t.territory} (${t.count})`).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="w-28 shrink-0">
                      <label className="mb-1 block text-[11px] font-bold text-ink-3" htmlFor={`terr-${c.account}`}>Territory</label>
                      <input
                        id={`terr-${c.account}`}
                        value={territory}
                        onChange={(e) => setTerritories((prev) => ({ ...prev, [c.account]: e.target.value.toUpperCase() }))}
                        className={`field py-1.5 font-mono text-xs ${isChosen && !territory.trim() ? 'border-red-400' : ''}`}
                        placeholder="e.g. JHB"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="space-y-2">
            <label htmlFor="push-upload-key" className="flex items-center gap-2 text-sm font-bold">
              <KeyRound className="h-4 w-4 text-ink-3" /> Upload key
            </label>
            <input
              id="push-upload-key"
              type="password"
              value={uploadKey}
              onChange={(e) => onUploadKeyChange(e.target.value)}
              placeholder="Needed to write to the master file"
              className="field"
              autoComplete="off"
            />
            <p className="text-xs text-ink-3">Only accounts the master file does not already have are added. Existing entries are never changed. The key is kept in memory for this visit only.</p>
            {missingTerritory && <p className="text-xs text-red-600 dark:text-red-400">Enter a territory for every selected account.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
