import test from 'node:test';
import assert from 'node:assert/strict';
import { DROPSHIP_PATTERN } from '@/lib/rules';
import { validateRows } from '@/lib/validate';
import type { MasterData } from '@/lib/types';

const master: MasterData = {
  territory: { '02665': 'PTA', '00111': 'JHB', '00222': 'JHB' },
  accountInfo: {},
  driverMap: {},
  ambiguousAccounts: [],
  ambiguousDetail: {},
  dropshipAccounts: ['02665'],
};

const base = { 'Customer Name': 'X', Territory: 'JHB', Weight: 10, 'Invoice Qty': 2, 'Driver Name': 'Sam' };
const run = (extra: Record<string, unknown>) => validateRows([{ ...base, 'Invoice No': '02000001', ...extra }] as never, master)[0];

test('drop ship text is recognised, including common spelling slips', () => {
  for (const text of ['Drop Ship', 'DROPSHIP', 'drop-ship', 'drop_ship', 'drop shipment', 'Dropshipping', 'dropshp', 'drp ship', 'dop ship', 'dropp ship', 'drop sihp', 'pls drop.ship']) {
    assert.ok(DROPSHIP_PATTERN.test(text), `should match: ${text}`);
  }
});

test('normal words are not mistaken for drop ship', () => {
  for (const text of ['dropped shipment', 'drip ship', 'shipping', 'ship to JHB', 'drop off', 'drop at gate', 'workshop', 'backdrop shipping']) {
    assert.ok(!DROPSHIP_PATTERN.test(text), `should not match: ${text}`);
  }
});

test('a marked account in another territory needs confirmation and has no territory mismatch', () => {
  const r = run({ Customer: '02665', Territory: 'MP/2' });
  assert.equal(r.isDropship, true);
  assert.equal(r.dropshipSource, 'account');
  assert.equal(r.primaryCls, 'dropship');
  assert.equal(r.isMismatch, false);
});

test('text marker alone needs confirmation', () => {
  const r = run({ Customer: '00111', Details: 'DROPSHP to Nelspruit', Territory: 'MP/2' });
  assert.equal(r.dropshipSource, 'text');
  assert.equal(r.primaryCls, 'dropship');
});

test('marked account and text together are reported as both', () => {
  assert.equal(run({ Customer: '02665', Details: 'drop-ship' }).dropshipSource, 'both');
});

test('a normal account in another territory is still checked for mismatch', () => {
  const r = run({ Customer: '00222', Territory: 'MP/2' });
  assert.equal(r.isDropship, false);
  assert.equal(r.isMismatch, true);
});

test('an unknown account is still flagged on a drop-ship row', () => {
  const r = run({ Customer: '99999', Details: 'Drop Ship', Territory: 'NW/1' });
  assert.equal(r.isDropship, true);
  assert.ok(r.status.includes('Unknown Account'));
});

test('a clean row stays clean', () => {
  const r = run({ Customer: '00111', Territory: 'JHB' });
  assert.equal(r.primaryCls, 'ok');
  assert.equal(r.isDropship, false);
});
