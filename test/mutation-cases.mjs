import { readFileSync } from 'node:fs';

const reference = JSON.parse(readFileSync(new URL('../docs/api-write-reference.json', import.meta.url), 'utf8'));
const readPaths = new Set(['metadata/get_items', 'payroll/get_payslips_data', 'payroll/get_payslips']);
const names = {
  'Update Employee identification_full_name': 'update_employee',
  'Add new levels to a leave approval structure': 'add_leave_approval_levels',
  'Remove levels to a leave approval structure': 'remove_leave_approval_levels',
  'Assign approvers to an existing level of a leave approval structure': 'assign_leave_approvers',
  'Unassign approvers to an existing level of a leave approval structure': 'unassign_leave_approvers',
  'Assign employees to a leave approval structure': 'assign_leave_employees',
  'Unassign employees of a leave approval structure': 'unassign_leave_employees',
  'creates a leave approval structure': 'create_leave_approval_structure',
  'updates a leave approval structure': 'update_leave_approval_structure',
  'deletes a leave approval structure': 'delete_leave_approval_structure',
  'Update without payment methods - is_bank_payment set to false': 'update_payment_settings',
  'Update without payment methods - is_bank_payment set to true': 'update_payment_settings',
  'should preserve statutory proration settings for PR effective employees (currently demonstrates bug)': 'create_recurring_payment',
};
const queryNames = new Set(['delete_leave_attachments', 'delete_multiple_leave_applications', 'assign_leave_employees', 'unassign_leave_employees']);

export const mutationCases = reference.operations.filter(op => !readPaths.has(op.path)).map(op => {
  const name = names[op.title] ?? op.title.toLowerCase().replaceAll(' ', '_');
  let args = typeof op.example === 'object' && op.example !== null ? structuredClone(op.example) : {};
  if (typeof op.example === 'string' && name !== 'upload_leave_attachment') {
    for (const line of op.example.split('\n')) {
      const match = line.match(/^(\w+): (.+)$/);
      if (!match) continue;
      const values = match[2].split(',').map(value => Number(value.trim()));
      args[match[1]] = match[1].endsWith('_ids') || match[1] === 'ids' ? values : values[0];
    }
  }
  if (op.path.includes(':id')) args.id = 123;
  // The parameter table marks this required although the example omits it.
  if (name === 'update_leave_approval_structure') args.company_default = false;
  if (name === 'upload_leave_attachment') args = { leave_application_id: 30, employee_id: 1531, filename: 'dummy.txt', mime_type: 'text/plain', file_base64: Buffer.from('attachment fixture').toString('base64') };
  const { id: _resourceId, ...payload } = args;
  return {
    name: `talenox_${name}`, title: op.title, args, method: op.method, path: `/api/v2/${op.path.replace(':id', '123')}`,
    query: queryNames.has(name) ? Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)])) : {},
    body: queryNames.has(name) || Object.keys(payload).length === 0 ? null : payload,
    multipart: name === 'upload_leave_attachment',
  };
});
