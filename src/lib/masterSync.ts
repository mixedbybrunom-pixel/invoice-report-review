import {
  fetchMasterFromServer, mergeAdditive, correctAccount, pushMasterToServer,
  editAccount, deleteAccount, masterAccountCount, type AccountFields,
} from './master';
import type { MasterData } from './types';

/** Publishes accounts the server does not have yet. Existing server entries are never overwritten. */
export async function publishAdditions(incoming: MasterData, uploadKey: string) {
  const server = await fetchMasterFromServer();
  const { merged, added } = mergeAdditive(server, incoming);
  if (added.length > 0) await pushMasterToServer(merged, uploadKey);
  return { master: merged, added };
}

/** Overwrites one account on the server, typically after a manual territory correction. */
export async function publishCorrection(
  account: string,
  territory: string,
  customer: string,
  uploadKey: string,
): Promise<MasterData> {
  const server = await fetchMasterFromServer();
  const merged = correctAccount(server, account, territory, customer);
  await pushMasterToServer(merged, uploadKey);
  return merged;
}

/**
 * Saving replaces the whole master file on the server, so every single-account change
 * starts from a fresh copy and is checked before it is written.
 */
async function changeOneAccount(
  account: string,
  uploadKey: string,
  expectedAccountChange: 0 | -1,
  change: (fresh: MasterData) => MasterData,
): Promise<{ before: MasterData; after: MasterData }> {
  const before = await fetchMasterFromServer();
  const beforeCount = masterAccountCount(before);
  if (beforeCount === 0) throw new Error('The master file on the server looks empty, so nothing was changed.');
  if (!(account in before.territory)) throw new Error(`Account ${account} is no longer in the master file. Refresh and try again.`);
  const after = change(before);
  if (masterAccountCount(after) !== beforeCount + expectedAccountChange) {
    throw new Error('The account count did not come out as expected, so nothing was changed.');
  }
  await pushMasterToServer(after, uploadKey);
  return { before, after };
}

export function publishAccountEdit(account: string, fields: AccountFields, uploadKey: string) {
  return changeOneAccount(account, uploadKey, 0, (fresh) => editAccount(fresh, account, fields));
}

export function publishAccountDelete(account: string, uploadKey: string) {
  return changeOneAccount(account, uploadKey, -1, (fresh) => deleteAccount(fresh, account));
}

/** Puts a saved copy of the master file back on the server (used by Undo). */
export async function restoreMasterSnapshot(snapshot: MasterData, uploadKey: string): Promise<void> {
  if (masterAccountCount(snapshot) === 0) throw new Error('The saved copy is empty, so it was not restored.');
  await pushMasterToServer(snapshot, uploadKey);
}
