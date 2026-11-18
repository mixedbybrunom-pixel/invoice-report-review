import { fetchMasterFromServer, mergeAdditive, correctAccount, pushMasterToServer } from './master';
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
