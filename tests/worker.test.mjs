// Tests the master Worker against a fake R2 bucket. Run: node tests/worker.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import worker from '../worker/ccl-master-api.js';

// Cloudflare provides crypto.subtle.timingSafeEqual; Node does not, so add it for the test.
if (!crypto.subtle.timingSafeEqual) crypto.subtle.timingSafeEqual = (a, b) => timingSafeEqual(Buffer.from(a), Buffer.from(b));

function fakeBucket() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? { text: async () => store.get(k) } : null; },
    async put(k, v) { store.set(k, v); },
    async delete(keys) { for (const k of [].concat(keys)) store.delete(k); },
    async list({ prefix }) { return { objects: [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }; },
  };
}
const accounts = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i).padStart(5, '0'), 'JHB']));
const post = (body, key = 'secret', extra = {}) => new Request('https://x/master', { method: 'POST', headers: { 'x-upload-key': key, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const env = () => ({ MASTER_BUCKET: fakeBucket(), UPLOAD_KEY: 'secret' });

test('wrong or missing key is refused', async () => {
  const e = env();
  assert.equal((await worker.fetch(post({ territoryMap: accounts(3) }, 'nope'), e)).status, 401);
  assert.equal((await worker.fetch(new Request('https://x/master', { method: 'POST', body: '{}' }), e)).status, 401);
  assert.equal(e.MASTER_BUCKET.store.size, 0);
});

test('bad content is refused and nothing is saved', async () => {
  const e = env();
  for (const bad of ['not json', [], { territoryMap: {} }, { territoryMap: { '1': '' } }, { territoryMap: accounts(2), dropshipAccounts: 'x' }]) {
    const res = await worker.fetch(post(bad), e);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  assert.equal(e.MASTER_BUCKET.store.size, 0);
});

test('a save keeps a backup of the previous file', async () => {
  const e = env();
  await worker.fetch(post({ territoryMap: accounts(200) }), e);
  const res = await worker.fetch(post({ territoryMap: accounts(201) }), e);
  const out = await res.json();
  assert.equal(out.accounts, 201);
  assert.ok(out.backup.startsWith('backups/master-'));
  assert.equal(JSON.parse(e.MASTER_BUCKET.store.get(out.backup)).territoryMap['00199'], 'JHB');
  assert.equal(JSON.parse(e.MASTER_BUCKET.store.get('master.json')).territoryMap['00200'], 'JHB');
});

test('a save that wipes out most accounts is refused unless confirmed', async () => {
  const e = env();
  await worker.fetch(post({ territoryMap: accounts(500) }), e);
  const refused = await worker.fetch(post({ territoryMap: accounts(10) }), e);
  assert.equal(refused.status, 409);
  assert.equal(Object.keys(JSON.parse(e.MASTER_BUCKET.store.get('master.json')).territoryMap).length, 500);
  const confirmed = await worker.fetch(post({ territoryMap: accounts(10) }, 'secret', { 'x-confirm-shrink': 'yes' }), e);
  assert.equal(confirmed.status, 200);
});

test('deleting one account is allowed', async () => {
  const e = env();
  await worker.fetch(post({ territoryMap: accounts(500) }), e);
  assert.equal((await worker.fetch(post({ territoryMap: accounts(499) }), e)).status, 200);
});

test('only the newest 50 backups are kept', async () => {
  const e = env();
  for (let i = 0; i < 60; i++) {
    e.MASTER_BUCKET.store.set(`backups/master-2026-01-01T00-00-${String(i).padStart(2, '0')}-000Z.json`, '{}');
  }
  await worker.fetch(post({ territoryMap: accounts(5) }), e);
  const kept = [...e.MASTER_BUCKET.store.keys()].filter((k) => k.startsWith('backups/'));
  assert.equal(kept.length, 50);
  assert.ok(!kept.includes('backups/master-2026-01-01T00-00-00-000Z.json'));
});

test('reading the master file still works', async () => {
  const e = env();
  assert.equal((await worker.fetch(new Request('https://x/master'), e)).status, 404);
  await worker.fetch(post({ territoryMap: accounts(3) }), e);
  const res = await worker.fetch(new Request('https://x/master'), e);
  assert.equal(res.status, 200);
  assert.equal(Object.keys((await res.json()).territoryMap).length, 3);
});
