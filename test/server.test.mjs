import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mutationCases } from './mutation-cases.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const fixture = new URL('./mock-fetch.mjs', import.meta.url).href;

for (const mode of ['legacy', 'auto']) {
  test(`stdio client can discover and call tools using ${mode} negotiation`, { timeout: 15000 }, async t => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', fixture, entry],
      cwd: root,
      env: { ...process.env, TALENOX_API_TOKEN: 'integration-test-token' },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'talenox-test', version: '1.0.0' });
    t.after(() => client.close());
    await client.connect(transport, { mode });
    const catalog = await client.listTools();
    assert.equal(catalog.tools.length, 91);
    const mutations = new Set(mutationCases.map(example => example.name));
    for (const tool of catalog.tools) {
      assert.equal(tool.annotations.readOnlyHint, !mutations.has(tool.name));
      if (!mutations.has(tool.name)) assert.equal(tool.annotations.destructiveHint, false);
    }
    const cases = [
      ['list_employees', {}, 'employees', 'GET'],
      ['get_employee', { id: 123 }, 'employees/123', 'GET'],
      ['list_branches', {}, 'branches', 'GET'],
      ['get_branch', { id: 123 }, 'branches/123', 'GET'],
      ['list_cost_centres', {}, 'cost_centres', 'GET'],
      ['get_company_settings', {}, 'company_settings', 'GET'],
      ['get_job', { id: 123 }, 'jobs/123', 'GET'],
      ['list_holiday_policies', { limit: 5, last_seen_id: 10 }, 'holiday_policies', 'GET'],
      ['list_leave_applications', { overlap_from: '2026-11-01', overlap_to: '2026-11-30', leave_application_status: 'pending' }, 'leave_beta/applications', 'GET'],
      ['list_leave_types', { employee_id: 123, limit: 5, last_seen_id: 10 }, 'leave_beta/types', 'GET'],
      ['get_leave_type', { id: 123 }, 'leave_beta/types/123', 'GET'],
      ['get_leave_balance', { employee_id: 123, query_date: '2026-11-01' }, 'leave_beta/types/balance', 'GET'],
      ['get_leave_entitlement', { employee_id: 123, id: 5, query_date: '2026-11-01' }, 'leave_beta/types/entitlement_period', 'GET'],
      ['list_leave_approvers', { employee_id: 123 }, 'leave_beta/approvers', 'GET'],
      ['list_off_in_lieus', { employee_id: 123 }, 'leave_beta/off_in_lieus', 'GET'],
      ['get_off_in_lieu_balance', { employee_id: 123, query_date: '2026-11-01' }, 'leave_beta/off_in_lieus/balance', 'GET'],
      ['get_off_in_lieu_entitlement', { employee_id: 123, id: 5, query_date: '2026-11-01' }, 'leave_beta/off_in_lieus/entitlement_period', 'GET'],
      ['list_payroll_payments', { month: 'November', year: 2026, created_by_webhook: false }, 'payroll/payroll_payment', 'GET'],
      ['get_payroll_payment', { id: 123 }, 'payroll/payroll_payment/123', 'GET'],
      ['get_payslips_data', { month: 'November', year: 2026, employee_ids: ['K00001'] }, 'payroll/get_payslips_data', 'POST'],
      ['get_payslips', { month: 'November', year: 2026, employee_ids: [123] }, 'payroll/get_payslips', 'POST'],
      ['get_metadata', { fields: ['company', 'currency'] }, 'metadata/get_items', 'POST'],
    ];
    for (const [name, args, path, method] of cases) {
      const result = await client.callTool({ name: `talenox_${name}`, arguments: args });
      assert.ok(!result.isError, `${name}: ${JSON.stringify(result)}`);
      const data = JSON.parse(result.content[0].text);
      assert.equal(data.path, `/api/v2/${path}`);
      assert.equal(data.method, method);
      if (method === 'POST') assert.deepEqual(data.body, args);
      else if (!path.endsWith('/123')) assert.deepEqual(data.query, Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)])));
    }
    for (const example of mutationCases) {
      const result = await client.callTool({ name: example.name, arguments: example.args });
      assert.ok(!result.isError, `${example.title}: ${JSON.stringify(result)}`);
      const data = JSON.parse(result.content[0].text);
      assert.equal(data.path, example.path, example.title);
      assert.equal(data.method, example.method, example.title);
      assert.deepEqual(data.query, example.query, example.title);
      if (example.multipart) {
        assert.deepEqual(data.body, { leave_application_id: String(example.args.leave_application_id), employee_id: String(example.args.employee_id), file: { name: example.args.filename, type: example.args.mime_type, size: Buffer.from(example.args.file_base64, 'base64').length, base64: example.args.file_base64 } });
      } else assert.deepEqual(data.body, example.body, example.title);
    }
    const invalidMutation = await client.callTool({ name: 'talenox_create_recurring_payment', arguments: { payment: {}, pay_items: [] } });
    assert.equal(invalidMutation.isError, true);
    const invalid = await client.callTool({ name: 'talenox_list_leave_types', arguments: { limit: 51 } });
    assert.equal(invalid.isError, true);
    const error = await client.callTool({ name: 'talenox_get_employee', arguments: { id: 401 } });
    assert.equal(error.isError, true);
    assert.match(error.content[0].text, /HTTP 401/);
    assert.doesNotMatch(error.content[0].text, /private-data|integration-test-token/);
  });
}

test('CLI fails clearly when no API token is configured', () => {
  const result = spawnSync(process.execPath, [entry], { env: { ...process.env, TALENOX_API_TOKEN: '' }, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /TALENOX_API_TOKEN/);
});

