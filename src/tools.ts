import * as z from 'zod/v4';
import type { ApiRequest } from './client.js';

// API resource IDs differ from the employee's company-assigned employee_id code.
const id = z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^[A-Za-z0-9_-]+$/).max(128)]);
const date = z.iso.date().describe('Calendar date in YYYY-MM-DD format');
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z$/)
  .describe('UTC timestamp in YYYY-MM-DD HH:MM:SSZ format');
const page = {
  last_seen_id: id.optional().describe('Pagination cursor from the last result; request the next page explicitly'),
  limit: z.number().int().min(1).max(50).optional(),
};
const month = z.enum(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
const period = { month, year: z.number().int().min(1900).max(9999) };
const balance = { employee_id: id, id: id.optional().describe('Leave type or off-in-lieu ID; omit for all types'), query_date: date, ...page };
const entitlement = { employee_id: id, id, query_date: date };

type Args = Record<string, unknown>;
export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodType<Args>;
  annotations?: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  request: (args: Args) => ApiRequest;
}

function get(name: string, description: string, path: string, shape: z.ZodRawShape = {}): ToolDefinition {
  return { name, description, schema: z.strictObject(shape), request: query => ({ path, query }) };
}
function byId(name: string, description: string, path: string): ToolDefinition {
  return { name, description, schema: z.strictObject({ id }), request: args => ({ path: `${path}/${args.id}` }) };
}
function post(name: string, description: string, path: string, shape: z.ZodRawShape): ToolDefinition {
  return { name, description, schema: z.strictObject(shape), request: body => ({ method: 'POST', path, body }) };
}

const leaveApplications = z.strictObject({
  overlap_from: date,
  overlap_to: date,
  employee_id: id.optional(),
  approver_id: id.optional(),
  category: z.enum(['type', 'oil']).optional(),
  category_id: id.optional(),
  leave_application_status: z.enum(['pending', 'approved', 'rejected']).optional(),
  created_start: timestamp.optional(), created_end: timestamp.optional(),
  modified_start: timestamp.optional(), modified_end: timestamp.optional(),
  ...page,
}).refine(args => args.overlap_from <= args.overlap_to, { message: 'overlap_from must not be after overlap_to' });

export const tools: ToolDefinition[] = [
  get('talenox_list_employees', 'List employees. This endpoint has no documented pagination or server-side search. Returns sensitive employee data.', 'employees'),
  byId('talenox_get_employee', 'Get an employee by the API resource id, not the company-assigned employee_id code. Includes sensitive HR data.', 'employees'),
  get('talenox_list_branches', 'List company branches and assigned employee IDs.', 'branches'),
  byId('talenox_get_branch', 'Get a branch by ID.', 'branches'),
  get('talenox_list_cost_centres', 'List cost centres and assigned employee IDs.', 'cost_centres'),
  get('talenox_get_company_settings', 'Read company API settings.', 'company_settings'),
  byId('talenox_get_job', 'Get a job by API job ID, including pay information.', 'jobs'),
  get('talenox_list_holiday_policies', 'List holiday policies, one page at a time.', 'holiday_policies', page),
  { name: 'talenox_list_leave_applications', description: 'List leave applications overlapping a required date range (Talenox BETA API). Returns one page; use last_seen_id for more.', schema: leaveApplications, request: query => ({ path: 'leave_beta/applications', query }) },
  get('talenox_list_leave_types', 'List available leave types, optionally for an employee (BETA). Returns one page.', 'leave_beta/types', { employee_id: id.optional(), ...page }),
  byId('talenox_get_leave_type', 'Get a leave type by ID (BETA).', 'leave_beta/types'),
  get('talenox_get_leave_balance', 'Get leave balances for an employee on a query date, optionally for one leave type (BETA). Returns one page.', 'leave_beta/types/balance', balance),
  get('talenox_get_leave_entitlement', 'Get entitlement periods for an employee and leave type on a query date (BETA).', 'leave_beta/types/entitlement_period', entitlement),
  get('talenox_list_leave_approvers', 'List leave approval levels and approvers for an employee (BETA).', 'leave_beta/approvers', { employee_id: id, approver_id: id.optional() }),
  get('talenox_list_off_in_lieus', 'List off-in-lieu policies, optionally filtered by employee or policy ID (BETA). Uses last_seen_id pagination.', 'leave_beta/off_in_lieus', { employee_id: id.optional(), id: id.optional(), last_seen_id: id.optional() }),
  get('talenox_get_off_in_lieu_balance', 'Get off-in-lieu balances for an employee on a query date (BETA). Returns one page.', 'leave_beta/off_in_lieus/balance', balance),
  get('talenox_get_off_in_lieu_entitlement', 'Get entitlement for an employee and off-in-lieu policy on a query date (BETA).', 'leave_beta/off_in_lieus/entitlement_period', entitlement),
  get('talenox_list_payroll_payments', 'List payroll payments for a month and year, including pay items.', 'payroll/payroll_payment', { ...period, created_by_webhook: z.boolean().optional() }),
  byId('talenox_get_payroll_payment', 'Get a payroll payment by API payment ID.', 'payroll/payroll_payment'),
  post('talenox_get_payslips_data', 'Retrieve payslip data for a month. This read operation uses POST. employee_ids are company-assigned codes such as K00001.', 'payroll/get_payslips_data', { ...period, employee_ids: z.array(z.string().min(1).max(128)).min(1).max(100).optional() }),
  post('talenox_get_payslips', 'Retrieve payslip PDF URLs for employee API resource IDs. This read operation uses POST; no files are downloaded.', 'payroll/get_payslips', { ...period, employee_ids: z.array(id).min(1).max(100), include_employee_data: z.boolean().optional() }),
  post('talenox_get_metadata', 'Read allowed field values such as company, currency, nationality, bank_type, period, or pay_item_types. This read operation uses POST.', 'metadata/get_items', { fields: z.array(z.string().regex(/^[a-z_]+$/).max(100)).min(1).max(50) }),
];

