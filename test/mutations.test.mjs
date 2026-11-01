import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mutationTools } from '../dist/mutations.js';
import { mutationCases } from './mutation-cases.mjs';
import { TalenoxClient } from '../dist/client.js';
const byName = name => mutationTools.find(tool => tool.name === `talenox_${name}`);

test('every mutation tool is covered by the public API reference', () => {
  assert.equal(mutationTools.length, 69);
  assert.equal(new Set(mutationTools.map(tool => tool.name)).size, mutationTools.length);
  assert.deepEqual(new Set(mutationCases.map(example => example.name)), new Set(mutationTools.map(tool => tool.name)));
  for (const example of mutationCases) {
    const tool = mutationTools.find(tool => tool.name === example.name);
    assert.ok(tool, example.title);
    assert.ok(tool.schema.safeParse(example.args).success, `${example.title}: ${tool.schema.safeParse(example.args).error}`);
    const request = tool.request(example.args);
    assert.equal(request.path, example.path.replace('/api/v2/', ''));
    assert.equal(request.method, example.method);
    assert.equal(tool.annotations.readOnlyHint, false);
    if (request.method === 'DELETE') assert.equal(tool.annotations.destructiveHint, true);
  }
});

test('update and payroll schemas reject empty or incomplete modifications', () => {
  const invalid = [
    ['update_employee', { id: 1, employee: {} }],
    ['update_branch', { id: 1, branch: {} }],
    ['update_job', { id: 1, job: {} }],
    ['create_sg_employee', { employee: { first_name: 'Test' } }],
    ['create_hk_employee', { employee: { first_name: 'Test', email: 'test@example.com', ssn: 'X', citizenship: 'Resident', payment_method: 'Cash' } }],
    ['create_working_day', { working_day: { name: 'Week', week_schedule: ['full_day'] } }],
    ['create_recurring_payment', { payment: {}, pay_items: [{ employee_id: 'K00001', item_type: 'Basic Pay', amount: 1000 }] }],
    ['create_recurring_payment', { payment: { month: 'November' }, pay_items: [] }],
    ['update_payment_settings', { payment: { id: 1 }, settings: [{ employee_id: 'K00001' }] }],
    ['delete_leave_attachments', { ids: Array.from({ length: 11 }, (_, i) => i + 1) }],
    ['create_leave_application', { employee_id: 1, category: 'type', category_id: 2, start_date: '2026-11-30', end_date: '2026-11-01', approvers: [{ approver_id: 3, level: 1 }] }],
    ['publish_payslips', { month: 'November', year: 2026 }],
  ];
  for (const [name, args] of invalid) assert.equal(byName(name).schema.safeParse(args).success, false, name);
});

test('employee updates preserve regional, banking and custom JSON attributes', () => {
  const args = { id: 123, employee: { identification_full_name: 'New name', bank_account_attributes: { number: '001234567890123456789', bank_type: 'DBS' }, additional_sg_employee_info_attributes: { shg_override_amount: 0 }, custom_fields: { Education: { Degree: 'Example' } } } };
  assert.deepEqual(byName('update_employee').schema.parse(args), args);
  assert.deepEqual(byName('update_employee').request(args).body, { employee: args.employee });
});

test('attachment schemas reject invalid base64, unsafe filenames and files above the local limit', () => {
  const base = { leave_application_id: 1, employee_id: 2, filename: 'note.txt', mime_type: 'text/plain', file_base64: 'dGVzdA==' };
  for (const change of [{ file_base64: 'not base64!' }, { filename: '../secret.txt' }, { mime_type: 'text/plain\r\nX: bad' }, { file_base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }]) {
    assert.equal(byName('upload_leave_attachment').schema.safeParse({ ...base, ...change }).success, false);
  }
});

test('JSON PUT, PATCH and DELETE bodies retain their payload and are never retried automatically', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    let calls = 0;
    const client = new TalenoxClient({ token: 'test-token', fetch: async (_url, options) => {
      calls++;
      assert.equal(options.method, method);
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(options.body), { levels: [1] });
      return new Response('private-data', { status: 503 });
    } });
    await assert.rejects(client.request({ method, path: 'leave_beta/leave_approval_structures/1/levels', body: { levels: [1] } }), /HTTP 503/);
    assert.equal(calls, 1);
  }
});
