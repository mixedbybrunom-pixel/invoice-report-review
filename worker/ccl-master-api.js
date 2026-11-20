// ccl-master-api: stores and serves the master file (master.json in R2).
// v2: keeps a dated backup before every save, checks what it is given,
// and compares the upload key in constant time.
// Needs: R2 binding MASTER_BUCKET and secret UPLOAD_KEY (both already exist).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-upload-key, x-confirm-shrink',
};

const MAX_BODY_BYTES = 8 * 1024 * 1024; // the real file is about 1 MB
const BACKUPS_TO_KEEP = 50;
const SHRINK_LIMIT = 0.8; // a save that drops more than 20% of accounts is refused

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

    if (url.pathname === '/master' && request.method === 'GET') {
      const obj = await env.MASTER_BUCKET.get('master.json');
      if (!obj) return json({ error: 'No master file uploaded yet' }, 404);
      return new Response(await obj.text(), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
      });
    }

    if (url.pathname === '/master' && request.method === 'POST') {
      if (!(await keyIsValid(request.headers.get('x-upload-key'), env.UPLOAD_KEY))) {
        log('rejected_key');
        return json({ error: 'Unauthorized' }, 401);
      }

      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return json({ error: 'The master file is too large.' }, 413);

      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'Body must be valid JSON' }, 400); }

      const problem = checkEnvelope(body);
      if (problem) return json({ error: problem }, 400);

      const newCount = Object.keys(body.territoryMap).length;
      const current = await env.MASTER_BUCKET.get('master.json');
      let backupName = null;

      if (current) {
        const currentText = await current.text();
        let currentCount = 0;
        try { currentCount = Object.keys(JSON.parse(currentText).territoryMap ?? {}).length; } catch { /* old file unreadable, still back it up */ }

        if (currentCount >= 100 && newCount < currentCount * SHRINK_LIMIT && request.headers.get('x-confirm-shrink') !== 'yes') {
          log('refused_shrink', { currentCount, newCount });
          return json({ error: `Refused: this save would cut the master file from ${currentCount} to ${newCount} accounts. Nothing was changed.` }, 409);
        }

        backupName = `backups/master-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        await env.MASTER_BUCKET.put(backupName, currentText);
      }

      await env.MASTER_BUCKET.put('master.json', JSON.stringify(body));
      await pruneBackups(env);
      log('saved', { accounts: newCount, backup: backupName });
      return json({ ok: true, accounts: newCount, backup: backupName });
    }

    return json({ error: 'Not found' }, 404);
  },
};

function checkEnvelope(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'Body must be a JSON object.';
  const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isObject(body.territoryMap) || Object.keys(body.territoryMap).length === 0) return 'territoryMap must be a non-empty object.';
  for (const [account, territory] of Object.entries(body.territoryMap)) {
    if (typeof territory !== 'string' || !territory.trim()) return `Account ${account} has no territory.`;
  }
  if (body.accountInfo !== undefined && !isObject(body.accountInfo)) return 'accountInfo must be an object.';
  if (body.driverMap !== undefined && !isObject(body.driverMap)) return 'driverMap must be an object.';
  if (body.ambiguousDetail !== undefined && !isObject(body.ambiguousDetail)) return 'ambiguousDetail must be an object.';
  for (const key of ['ambiguousAccounts', 'dropshipAccounts']) {
    if (body[key] !== undefined && !(Array.isArray(body[key]) && body[key].every((a) => typeof a === 'string'))) return `${key} must be a list of account numbers.`;
  }
  return null;
}

async function keyIsValid(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  // Hash both so the two values have the same length, then compare in constant time.
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function pruneBackups(env) {
  const names = [];
  let cursor;
  do {
    const page = await env.MASTER_BUCKET.list({ prefix: 'backups/', cursor });
    names.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  names.sort(); // names start with the date, so oldest first
  const extra = names.slice(0, Math.max(0, names.length - BACKUPS_TO_KEEP));
  if (extra.length) await env.MASTER_BUCKET.delete(extra);
}

function log(event, data = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
