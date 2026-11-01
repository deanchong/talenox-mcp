import * as z from 'zod/v4';
import type { ApiRequest } from './client.js';
import type { ToolDefinition } from './tools.js';
import { id, ids, text, code, date, apiDate, amount, period, jsonObject, nonempty } from './schemas.js';

type Args = Record<string, unknown>;
type Method = NonNullable<ApiRequest['method']>;
const optionalText = z.string().nullable().optional();
const optionalDate = z.union([apiDate, z.literal(''), z.null()]).optional();
const assignment = ids.optional().describe('If supplied, replaces the existing employee assignments; [] clears them');

function write(name: string, description: string, method: Method, path: string, schema: z.ZodType<Args>, options: { query?: boolean; destructive?: boolean; idempotent?: boolean; source?: string } = {}): ToolDefinition {
  return {
    name: `talenox_${name}`, description: `${description} ${options.source ? `Reference: https://talenox.github.io/api-doc/#${options.source}` : ''}`.trim(), schema,
    annotations: { readOnlyHint: false, destructiveHint: options.destructive ?? method !== 'POST', idempotentHint: options.idempotent ?? method !== 'POST', openWorldHint: true },
    request: args => {
      const { id: resourceId, ...params } = args;
      const endpoint = path.replace(':id', String(resourceId));
      if (options.query) {
        const query = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value]));
        return { method, path: endpoint, query };
      }
      return { method, path: endpoint, ...(Object.keys(params).length ? { body: params } : {}) };
    },
  };
}

function crud(name: string, path: string, wrapper: string, create: z.ZodType, update: z.ZodType, extras: z.ZodRawShape = {}, updateMethod: Method = 'PUT'): ToolDefinition[] {
  return [
    write(`create_${name}`, `Create ${name.replaceAll('_', ' ')}.`, 'POST', path, z.strictObject({ ...extras, [wrapper]: create })),
    write(`update_${name}`, `Update ${name.replaceAll('_', ' ')} by API ID. Supplied assignment arrays replace existing assignments.`, updateMethod, `${path}/:id`, z.strictObject({ id, [wrapper]: update })),
    write(`delete_${name}`, `Delete ${name.replaceAll('_', ' ')} by API ID.`, 'DELETE', `${path}/:id`, z.strictObject({ id })),
  ];
}

const branch = { name: text.optional(), address: optionalText, postcode: optionalText, head_id: id.nullable().optional(), employee_ids: assignment };
const costCentre = { name: text.optional(), employee_ids: assignment, enable_custom_cpf_csn: z.boolean().optional(), custom_cpf_csn: optionalText, enable_custom_mpf: z.boolean().optional(), custom_mpf_employer_no: optionalText, mpf_provider_id: id.nullable().optional(), custom_empf_scheme: optionalText, custom_empf_payroll_group_name: optionalText };
const role = { name: text.optional(), employee_ids: assignment };
const job = { title: optionalText, department: optionalText, start_date: optionalDate, end_date: optionalDate, currency: text.optional(), amount: amount.optional(), rate_of_pay: text.optional(), remarks: optionalText };
const kin = { name: text.optional(), relationship: text.optional(), contact_number: code.nullable().optional(), alternate_contact_number: code.nullable().optional(), birthdate: optionalDate, marriage_date: optionalDate, gender: optionalText, citizenship: optionalText, ssn: optionalText, passport: optionalText };
const workingDay = { name: text.optional(), company_default: z.boolean().optional(), employee_ids: assignment, week_schedule: z.array(z.enum(['not_working', 'full_day', 'first_half', 'second_half', 'rest_day'])).length(7).optional().describe('Seven days starting Sunday; rest_day is Singapore only') };
const workingHour = { name: text.optional(), company_default: z.boolean().optional(), employee_ids: assignment, hours_per_week: z.number().min(0).max(168).optional(), hours_per_day: z.number().min(0).max(24).optional().describe('Required for part-time ADW calculation where applicable') };
const customPayItem = {
  name: text.optional(), proration_enabled: z.boolean().optional(), category: z.enum(['Recurring', 'Adhoc', 'Attendance', 'Additional']).optional(), item_type: text.optional(), gross_net_settings: z.enum(['gross', 'net']).optional(), tax: z.boolean().optional(),
  payslip_display_settings: z.array(z.enum(['Item Name', 'Remarks', 'Period', 'Calculation'])).optional(), overtime_rate: z.number().min(0).optional(),
  additional_sg_info_attributes: z.strictObject({ cpf: z.boolean().optional(), sdl: z.boolean().optional(), shg: z.boolean().optional(), cpf_owage_awage: z.enum(['owage', 'awage']).optional() }).optional(),
  additional_hk_info_attributes: z.strictObject({ mpf: z.boolean().optional(), adw: z.boolean().optional() }).optional(),
  additional_my_info_attributes: z.strictObject({ epf: z.boolean().optional(), socso: z.boolean().optional(), eis: z.boolean().optional(), hrdf: z.boolean().optional() }).optional(),
  additional_id_info_attributes: z.strictObject({ bpjs: z.boolean().optional(), thr: z.boolean().optional() }).optional(),
};

// Regional employee fields are extensive and differ by company locale. Keep typed
// common fields and preserve additional documented attributes as JSON, including
// bank_account_attributes, location_attributes and regional statutory settings.
const employeeFields = {
  employee_id: code.optional(), first_name: text.optional(), last_name: optionalText, identification_full_name: optionalText,
  email: z.email().optional(), ssn: text.optional(), citizenship: text.optional(), payment_method: text.optional(),
  hired_date: optionalDate, confirmation_date: optionalDate, resign_date: optionalDate, birthdate: optionalDate,
  ssn_should_validate: z.boolean().optional(), cost_centre_ids: ids.optional(), default_cost_centre_id: z.union([id, z.literal(''), z.null()]).optional(),
  current_job_attributes: z.object(job).catchall(z.json()).optional(), bank_account_attributes: jsonObject.optional(), location_attributes: jsonObject.optional(),
  additional_sg_employee_info_attributes: jsonObject.optional(), additional_hk_employee_info_attributes: jsonObject.optional(), additional_my_employee_info_attributes: jsonObject.optional(), additional_id_employee_info_attributes: jsonObject.optional(),
  custom_fields: jsonObject.optional(), next_of_kins_attributes: z.array(z.object(kin).catchall(z.json())).optional(),
};
const employeeTools = ['SG', 'MY', 'HK', 'ID'].map(country => {
  const employee = z.object({ ...employeeFields, first_name: text, email: z.email(), ssn: text, citizenship: text, payment_method: text,
    ...(country === 'HK' ? { additional_hk_employee_info_attributes: z.object({ mpf_scheme: z.union([z.literal(0), z.literal(2)]) }).catchall(z.json()) } : {}),
    ...(country === 'ID' ? { additional_id_employee_info_attributes: z.object({ tax_processing_date: apiDate, ptkp: text, tax_scheme: text, bpjs_tk_policy: text, bpjs_tk_jht_borne_by_employer: z.boolean(), bpjs_jp_policy: text, bpjs_jp_borne_by_employer: z.boolean(), bpjs_jkm_policy: text, bpjs_tk_jht_policy: text, bpjs_kesehatan_policy: text, bpjs_kesehatan_borne_by_employer: z.boolean() }).catchall(z.json()) } : {}),
  }).catchall(z.json());
  return write(`create_${country.toLowerCase()}_employee`, `Create a ${country} employee in the company associated with the token. The company determines the locale. invite_user=true sends an invitation. Employee attributes accept additional documented regional JSON fields.`, 'POST', 'employees', z.strictObject({ invite_user: z.boolean().optional(), employee }), { source: `create-${country.toLowerCase()}-employee` });
});

const holiday = { name: text.optional(), country_id: id.optional(), state_id: id.nullable().optional(), description: optionalText };
const duration = z.strictObject({ date, type: z.enum(['full_day', 'first_half', 'second_half']) });
const approvers = z.array(z.strictObject({ approver_id: id, level: z.number().int().positive() })).min(1);
const structureFields = { name: text.optional(), company_id: id.optional(), company_default: z.boolean().optional(), employee_ids: ids.optional(), approver_order: z.enum(['no_order', 'ascending_order', 'descending_order']).optional(), flexible_approval_structure: z.boolean().optional() };
const structurePath = 'leave_beta/leave_approval_structures';
const levelApprovers = z.array(z.strictObject({ approver_ids: ids.min(1), level: z.number().int().positive() })).min(1);
const payment = z.strictObject({ id: id.optional(), month: period.month.optional(), year: period.year.optional(), period: text.optional(), pay_group: optionalText })
  .refine(value => value.id !== undefined || (value.month !== undefined && value.year !== undefined && value.period !== undefined), 'Specify payment.id or month, year and period together');
const payrollCode = text.describe('Company-assigned employee code, e.g. K00001');
const payItem = { employee_id: payrollCode, item_type: text, amount: amount.optional(), remarks: optionalText };
const payItems = (extra: z.ZodRawShape = {}, requireAmount = true) => z.array(z.strictObject({ ...payItem, ...(requireAmount ? { amount } : {}), ...extra })).min(1).max(1000);
const payrollTools: ToolDefinition[] = [
  write('create_payroll_payment', 'Create a payroll payment. employee_ids are company-assigned employee codes.', 'POST', 'payroll/payroll_payment', z.strictObject({ payment: z.strictObject({ ...period, period: text, pay_group: optionalText, with_pay_items: z.boolean().optional() }), employee_ids: z.array(payrollCode).min(1).optional() })),
  write('create_adhoc_payment', 'Add ad hoc payroll items to the specified payment.', 'POST', 'payroll/adhoc_payment', z.strictObject({ payment, pay_items: payItems() })),
  write('create_attendance_payment', 'Add attendance payroll items to the specified payment.', 'POST', 'payroll/attendance_payment', z.strictObject({ payment, pay_items: payItems({ rate_of_pay: amount.optional(), no_of_hours_slash_days: z.number().min(0).optional() }) })),
  write('create_leave_payment_or_deduction', 'Add leave payments or deductions. Optional amount overrides the calculated value.', 'POST', 'payroll/leave_payment_or_deduction', z.strictObject({ payment, pay_items: payItems({ override_working_days: z.number().min(0).optional() }, false) })),
  write('create_recurring_payment', 'Add recurring payroll items. Talenox documents a known statutory proration issue for PR-effective employees; review upstream results.', 'POST', 'payroll/recurring_payment', z.strictObject({ payment, pay_items: payItems({ actual_no_of_working_days: z.number().min(0).optional(), total_no_of_working_days: z.number().min(0).optional() }) })),
  write('pull_leave_applications', 'Pull leave applications into the specified payroll payment.', 'POST', 'payroll/pull_leave_applications', z.strictObject({ payment }), { destructive: true }),
  write('update_payment_settings', 'Update employee payment methods and cost centres for the specified payroll payment.', 'POST', 'payroll/update_payment_settings', z.strictObject({ payment, settings: z.array(nonempty({ employee_id: payrollCode, is_bank_payment: z.boolean().optional(), selected_cost_centre_id: id.nullable().optional(), employees_payment_methods: text.optional() }).refine(value => value.is_bank_payment !== undefined || value.selected_cost_centre_id !== undefined || value.employees_payment_methods !== undefined, 'Provide a setting to change')).min(1).max(1000) }), { destructive: true }),
  write('process_payroll_payment', 'Process the payroll payment identified by API payment ID.', 'POST', 'payroll/payroll_payment/:id/process', z.strictObject({ id }), { destructive: true }),
  write('set_payment_to_draft', 'Return the payroll payment to draft.', 'POST', 'payroll/payroll_payment/:id/draft', z.strictObject({ id }), { destructive: true }),
  write('publish_payslips', 'Publish payslips for a month. Email delivery is controlled by the required send/attachment settings.', 'POST', 'payroll/publish_payslips', z.strictObject({ ...period, payslip_pay_date: apiDate, payslip_send_on_pd_setting: z.number().int().min(0), attach_payslip_to_email: z.union([z.literal(0), z.literal(1)]), employee_ids: z.array(code).min(1).optional() }), { destructive: true }),
  write('unpublish_payslips', 'Unpublish payslips for the specified month and optionally specified employees.', 'POST', 'payroll/unpublish_payslips', z.strictObject({ ...period, employee_ids: z.array(code).min(1).optional() }), { destructive: true }),
  write('export_payroll', 'Export payroll for the specified period. Returns the upstream JSON export response.', 'POST', 'payroll/export_payroll', z.strictObject({ ...period, period: text, pay_date: apiDate.optional() }), { destructive: true }),
];
for (const [name, path] of [['adhoc_pay_item', 'adhoc_payment'], ['attendance_pay_item', 'attendance_payment'], ['leave_pay_item', 'leave_payment_or_deduction'], ['payroll_payment', 'payroll_payment'], ['recurring_pay_item', 'recurring_payment']]) {
  payrollTools.push(write(`delete_${name}`, `Delete ${name!.replaceAll('_', ' ')} by API ID.`, 'DELETE', `payroll/${path}/:id`, z.strictObject({ id })));
}

const attachment = z.strictObject({
  leave_application_id: id, employee_id: id,
  filename: z.string().min(1).max(255).regex(/^[^/\\\r\n]+$/),
  mime_type: z.string().regex(/^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/),
  file_base64: z.string().min(4).max(6_990_508).refine(value => value.length <= 6_990_508 && value.length % 4 === 0 && Buffer.from(value, 'base64').toString('base64') === value, 'Provide canonical padded base64')
    .refine(value => Buffer.from(value, 'base64').byteLength <= 5 * 1024 * 1024, 'Maximum file size is 5 MiB'),
});
const upload: ToolDefinition = {
  name: 'talenox_upload_leave_attachment', description: 'Upload a leave attachment (BETA). Supply base64 file contents, filename and MIME type; maximum 5 MiB. No local file paths or remote URLs are read.', schema: attachment,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  request: args => {
    const form = new FormData();
    form.set('leave_application_id', String(args.leave_application_id));
    form.set('employee_id', String(args.employee_id));
    form.set('file', new Blob([new Uint8Array(Buffer.from(String(args.file_base64), 'base64'))], { type: String(args.mime_type) }), String(args.filename));
    return { method: 'POST', path: 'leave_beta/attachments/upload', formData: form };
  },
};

export const mutationTools: ToolDefinition[] = [
  ...crud('branch', 'branches', 'branch', z.strictObject({ ...branch, name: text }), nonempty(branch)),
  write('update_company_settings', 'Update company API settings, including support for multiple cost centres per employee.', 'PUT', 'company_settings', z.strictObject({ company_settings: z.strictObject({ api_allows_employee_multiple_cost_centres: z.boolean() }) })),
  ...crud('cost_centre', 'cost_centres', 'cost_centre', z.strictObject({ ...costCentre, name: text }), nonempty(costCentre)),
  ...crud('role', 'roles', 'role', z.strictObject({ ...role, name: text }), nonempty(role)),
  ...employeeTools,
  write('update_employee', 'Update employee attributes by API resource ID, including regional, bank, personal and job attributes. Additional documented employee attributes are preserved as JSON.', 'PUT', 'employees/:id', z.strictObject({ id, employee: z.object(employeeFields).catchall(z.json()).refine(value => Object.values(value).some(v => v !== undefined), 'Provide at least one employee field') })),
  write('delete_employee', 'Delete an employee by API resource ID.', 'DELETE', 'employees/:id', z.strictObject({ id })),
  ...crud('job', 'jobs', 'job', z.strictObject({ ...job, start_date: apiDate, end_date: apiDate.nullable() }), nonempty(job), { employee_id: id, title: z.string().optional() }),
  ...crud('next_of_kin', 'next_of_kins', 'next_of_kin', z.strictObject({ ...kin, name: text, relationship: text }), nonempty(kin), { employee_id: id }),
  ...crud('working_day', 'working_days', 'working_day', z.strictObject({ ...workingDay, name: text, week_schedule: workingDay.week_schedule.unwrap() }), nonempty(workingDay)),
  ...crud('working_hour', 'working_hours', 'working_hour', z.strictObject({ ...workingHour, name: text, hours_per_week: workingHour.hours_per_week.unwrap() }), nonempty(workingHour)),
  ...crud('custom_pay_item', 'payroll/custom_pay_items', 'custom_pay_item', nonempty(customPayItem), nonempty(customPayItem), {}, 'PATCH'),
  write('create_holiday_policy', 'Create a holiday policy and optionally assign employees.', 'POST', 'holiday_policies', z.strictObject({ ...holiday, name: text, employee_ids: ids.optional() })),
  write('update_holiday_policy', 'Update a holiday policy by API ID.', 'PUT', 'holiday_policies/:id', z.strictObject({ id, ...holiday }).refine(value => Object.keys(value).some(key => key !== 'id'), 'Provide a holiday policy field')),
  write('delete_holiday_policy', 'Delete a holiday policy by API ID.', 'DELETE', 'holiday_policies/:id', z.strictObject({ id })),
  write('upsert_holiday_policy_modification', 'Create or replace a holiday override on a policy for a specific date.', 'POST', 'holiday_policies/:id/modifications', z.strictObject({ id, holiday_date: date, name: text, duration: z.enum(['all_day', 'first_half_of_day', 'second_half_of_day']), is_active: z.boolean(), holiday_type: z.enum(['public_holiday', 'statutory_holiday']).optional() }), { destructive: true, idempotent: true }),
  write('delete_holiday_policy_modification', 'Delete a holiday override for a policy and date.', 'DELETE', 'holiday_policies/:id/modifications', z.strictObject({ id, holiday_date: date })),
  write('create_leave_application', 'Submit a leave application (BETA). Approvers and optional per-day working/duration arrays follow the documented leave flow.', 'POST', 'leave_beta/applications', z.strictObject({ employee_id: id, category_id: id, category: z.enum(['type', 'oil']), start_date: date, end_date: date, remarks: optionalText, approvers, applied_durations: z.array(duration).min(1).optional(), working_days: z.array(z.strictObject({ date, type: z.enum(['full_day', 'first_half', 'second_half', 'holiday', 'not_working']) })).min(1).optional() }).refine(value => value.start_date <= value.end_date, 'start_date must not be after end_date')),
  write('approve_leave', 'Approve a pending leave application (BETA).', 'PATCH', 'leave_beta/applications/approve/:id', z.strictObject({ id })),
  write('reject_leave', 'Reject a pending leave application (BETA).', 'PATCH', 'leave_beta/applications/reject/:id', z.strictObject({ id })),
  write('delete_leave_application', 'Delete a leave application by API ID (BETA).', 'DELETE', 'leave_beta/applications/:id', z.strictObject({ id })),
  write('delete_multiple_leave_applications', 'Delete the specified leave applications for an employee (BETA).', 'DELETE', 'leave_beta/applications', z.strictObject({ employee_id: id, leave_application_ids: ids.min(1) }), { query: true }),
  upload,
  write('delete_leave_attachments', 'Delete up to ten leave attachments (BETA).', 'DELETE', 'leave_beta/attachments', z.strictObject({ ids: ids.min(1).max(10) }), { query: true }),
  write('create_leave_approval_structure', 'Create a leave approval structure (BETA).', 'POST', structurePath, z.strictObject({ ...structureFields, name: text, company_id: id })),
  write('update_leave_approval_structure', 'Update a leave approval structure (BETA). Supplied employees replace the assigned list.', 'PUT', `${structurePath}/:id`, z.strictObject({ id, ...structureFields, name: text, company_id: id, company_default: z.boolean() })),
  write('delete_leave_approval_structure', 'Delete a leave approval structure (BETA).', 'DELETE', `${structurePath}/:id`, z.strictObject({ id })),
  write('add_leave_approval_levels', 'Add levels and their approvers to a leave approval structure (BETA).', 'POST', `${structurePath}/:id/levels`, z.strictObject({ id, approvers: levelApprovers })),
  write('remove_leave_approval_levels', 'Remove levels from a leave approval structure (BETA).', 'DELETE', `${structurePath}/:id/levels`, z.strictObject({ id, levels: z.array(z.number().int().positive()).min(1) })),
  ...['assign', 'unassign'].flatMap(action => [
    write(`${action}_leave_approvers`, `${action} approvers at existing leave approval levels (BETA).`, 'PUT', `${structurePath}/:id/${action}_approvers`, z.strictObject({ id, approvers: levelApprovers })),
    write(`${action}_leave_employees`, `${action} employees to/from a leave approval structure (BETA).`, 'PUT', `${structurePath}/:id/${action}_employees`, z.strictObject({ id, employee_ids: ids.min(1), ...(action === 'assign' ? { last_employee_id: id.optional(), limit: z.number().int().min(1).max(50).optional() } : {}) }), { query: true }),
  ]),
  ...payrollTools,
];


