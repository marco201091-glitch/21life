import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
const origin = 'https://21life.win';
const calls = [];
const env = { DB: { prepare(sql) { return { bind(event) { return { async run() { calls.push({ sql, event }); } }; } }; } } };
function req(event, options = {}) { return new Request('https://counter.example/click', { method: 'POST', headers: { Origin: origin, ...options.headers }, body: event }); }
test('records only supported events from the site and acknowledges after the atomic write', async () => {
  for (const event of ['apk', 'web']) assert.equal((await worker.fetch(req(event), env)).status, 204);
  assert.deepEqual(calls.map(x => x.event), ['apk', 'web']);
  assert.match(calls[0].sql, /ON CONFLICT\(day, event\) DO UPDATE SET count = count \+ 1/);
});
test('rejects untrusted origins, unsupported actions and oversized bodies', async () => {
  assert.equal((await worker.fetch(req('apk', {headers:{Origin:'https://example.com'}}), env)).status, 403);
  assert.equal((await worker.fetch(req('other'), env)).status, 400);
  assert.equal((await worker.fetch(req('x'.repeat(17)), env)).status, 400);
  assert.equal(calls.length, 2);
});
test('reports storage failures instead of silently counting', async () => {
  const failing={DB:{prepare(){return {bind(){return {async run(){throw Error('unavailable')}}}}}}};
  assert.equal((await worker.fetch(req('apk'), failing)).status, 503);
});
