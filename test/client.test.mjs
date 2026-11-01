import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TalenoxClient, clientFromEnv } from '../dist/client.js';
import { tools } from '../dist/tools.js';

const clientWith = fetch => new TalenoxClient({ token: 'test-token', fetch });

test('requires valid credentials and bounded timeout configuration', () => {
  for (const token of ['', '   ', 'abc\ndef']) assert.throws(() => new TalenoxClient({ token }));
  for (const timeoutMs of [0, -1, 1.2, NaN, 300001]) {
    assert.throws(() => new TalenoxClient({ token: 'test', timeoutMs }));
  }
  assert.throws(() => clientFromEnv({ TALENOX_API_TOKEN: 'test', TALENOX_TIMEOUT_MS: 'invalid' }));
});

test('sends token only in the header, encodes query values, preserves false and omits absent values', async () => {
  const client = clientWith(async (url, options) => {
    assert.equal(url.origin, 'https://api.talenox.com');
    assert.equal(url.pathname, '/api/v2/employees');
    assert.equal(url.searchParams.get('name'), 'A & B');
    assert.equal(url.searchParams.get('created_by_webhook'), 'false');
    assert.equal(url.searchParams.has('missing'), false);
    assert.equal(url.toString().includes('test-token'), false);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.redirect, 'error');
    return Response.json([{ id: 1 }]);
  });
  assert.deepEqual(await client.request({ path: 'employees', query: { name: 'A & B', created_by_webhook: false, missing: undefined } }), [{ id: 1 }]);
});

test('serializes read-only POST operations as JSON', async () => {
  const body = { month: 'November', year: 2026, employee_ids: ['K00001'] };
  const client = clientWith(async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), body);
    return Response.json({ payslips: [] });
  });
  assert.deepEqual(await client.request({ method: 'POST', path: 'payroll/get_payslips_data', body }), { payslips: [] });
});

for (const status of [401, 403, 404, 422, 429, 500]) {
  test(`HTTP ${status} errors omit upstream bodies and credentials`, async () => {
    const client = clientWith(async () => new Response('test-token private-employee-data', { status }));
    await assert.rejects(client.request({ path: 'employees' }), error => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(error.message, /test-token|private-employee-data/);
      return true;
    });
  });
}

test('handles invalid JSON, empty bodies and network failure without leaking details', async () => {
  await assert.rejects(clientWith(async () => new Response('<html>secret</html>')).request({ path: 'employees' }), /not valid JSON/);
  assert.equal(await clientWith(async () => new Response(null, { status: 204 })).request({ path: 'employees' }), null);
  assert.equal(await clientWith(async () => new Response('')).request({ path: 'employees' }), null);
  await assert.rejects(clientWith(async () => { throw new Error('test-token'); }).request({ path: 'employees' }), error => !error.message.includes('test-token'));
});

test('times out a pending API request', async () => {
  const client = new TalenoxClient({ token: 'test', timeoutMs: 10, fetch: async (_url, { signal }) => {
    return await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  await assert.rejects(client.request({ path: 'employees' }), /timed out/);
});

test('limits streamed response size instead of returning partial JSON', async () => {
  const client = clientWith(async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1)));
  await assert.rejects(client.request({ path: 'employees' }), /exceeds 5 MiB/);
});

test('rejects external or traversing endpoint paths before sending a request', async () => {
  const client = clientWith(async () => { assert.fail('fetch must not run'); });
  for (const path of ['https://example.com', '//example.com', '../employees', '/employees', 'employees?token=bad']) {
    await assert.rejects(client.request({ path }), /Invalid API endpoint/);
  }
});

test('schemas reject invalid dates, cursors, IDs, unknown fields and reversed ranges', () => {
  const byName = name => tools.find(tool => tool.name === `talenox_${name}`).schema;
  assert.equal(byName('get_employee').safeParse({ id: '../payroll' }).success, false);
  assert.equal(byName('list_employees').safeParse({ arbitrary: true }).success, false);
  assert.equal(byName('list_leave_types').safeParse({ limit: 51 }).success, false);
  assert.equal(byName('get_leave_balance').safeParse({ employee_id: 1, query_date: '2026-02-30' }).success, false);
  assert.equal(byName('list_leave_applications').safeParse({ overlap_from: '2026-11-30', overlap_to: '2026-11-01' }).success, false);
  assert.equal(byName('list_payroll_payments').safeParse({ month: '11', year: 2026 }).success, false);
  assert.equal(byName('get_payslips_data').safeParse({ month: 'November', year: 2026, employee_ids: ['K00001'] }).success, true);
});

test('propagates caller cancellation to the API request', async () => {
  const controller = new AbortController();
  const client = clientWith(async (_url, { signal }) => {
    return await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const request = client.request({ path: 'employees' }, controller.signal);
  controller.abort();
  await assert.rejects(request, /cancelled/);
});
