# Talenox MCP server

A local TypeScript MCP server for the [Talenox v2 API](https://talenox.github.io/api-doc/). It exposes 91 tools (22 reads and 69 modifications) over stdio using the official MCP SDK. Modification tools are available on startup, subject to your Talenox token permissions. No HTTP listener is started.

## Run from GitHub with npx

Requires Node.js 22.9 or later, npm (which includes `npx`), and Git available on your PATH.

The examples below target `deanchong/talenox-mcp`. They become usable after the GitHub repository is created and this project is pushed to it. No npm registry publication is required.

Get your company API token from **Talenox > top-right navigation > API Settings**. Configure it through your MCP client's environment settings or the process environment.

For clients that accept an `mcpServers` JSON configuration, merge this entry into the client's configuration:

```json
{
  "mcpServers": {
    "talenox": {
      "command": "npx",
      "args": ["--yes", "github:deanchong/talenox-mcp"],
      "env": {
        "TALENOX_API_TOKEN": "your-company-api-token",
        "TALENOX_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

Replace the token placeholder locally. The same configuration is in `mcp-config.example.json`. On Windows, if your client cannot resolve `npx`, use `npx.cmd` as the command. Keep configurations containing real tokens outside the repository.

To launch it manually in PowerShell:

```powershell
$env:TALENOX_API_TOKEN = 'your-company-api-token'
npx --yes github:deanchong/talenox-mcp
```

The process waits for MCP requests on stdin. No startup output on stdout is expected. `npx` fetches the GitHub package and npm runs its `prepare` script to compile TypeScript before installation. Allow dependency lifecycle scripts for that build. The first launch needs network access and may take longer while dependencies are installed. See [npm's Git preparation behavior](https://docs.npmjs.com/cli/v11/using-npm/scripts/#prepare-and-prepublish).

The token is sent in the Authorization header to `https://api.talenox.com/api/v2/`. The server reads environment variables supplied by its client; it does not automatically load an `.env` file when run through `npx`.

To select a specific revision, append a branch, tag or commit to the GitHub specifier:

```text
github:deanchong/talenox-mcp#<tag-or-commit-sha>
```

To inspect tools interactively after creating and pushing the repository:

```powershell
$env:TALENOX_API_TOKEN = 'your-company-api-token'
npx --yes @modelcontextprotocol/inspector npx --yes github:deanchong/talenox-mcp
```

## Local development

Once the repository exists, clone it and install dependencies. `npm ci` runs the build through the `prepare` script.

```powershell
git clone https://github.com/deanchong/talenox-mcp.git
cd talenox-mcp
npm ci
Copy-Item .env.example .env
```

For an existing checkout, start with `npm ci` in the project directory. Set `TALENOX_API_TOKEN` in `.env`, then run:

```powershell
npm run dev
```

`npm run dev` builds and starts the server, loading `.env` if present. `npm start` uses environment variables already supplied by the host. To run the built server with a local `.env` directly:

```powershell
node --env-file=.env dist/index.js
```

For a client that launches a local checkout, use `node` as the command and absolute paths to `--env-file=/path/to/talenox-mcp/.env` and `/path/to/talenox-mcp/dist/index.js` as the arguments. Keep `.env` out of Git.

## Read tools

Every tool name starts with `talenox_`.

| Area | Tool names (without prefix) |
| --- | --- |
| Employees | `list_employees`, `get_employee` |
| Organization | `list_branches`, `get_branch`, `list_cost_centres`, `get_company_settings`, `get_job` |
| Holidays | `list_holiday_policies` |
| Leave (BETA) | `list_leave_applications`, `list_leave_types`, `get_leave_type`, `get_leave_balance`, `get_leave_entitlement`, `list_leave_approvers` |
| Off in lieu (BETA) | `list_off_in_lieus`, `get_off_in_lieu_balance`, `get_off_in_lieu_entitlement` |
| Payroll | `list_payroll_payments`, `get_payroll_payment`, `get_payslips_data`, `get_payslips` |
| Reference data | `get_metadata` |

Examples of MCP tool arguments:

```json
{"name":"talenox_list_leave_applications","arguments":{"overlap_from":"2026-11-01","overlap_to":"2026-11-30","leave_application_status":"pending","limit":20}}
```

```json
{"name":"talenox_get_leave_balance","arguments":{"employee_id":123,"query_date":"2026-11-01"}}
```

```json
{"name":"talenox_get_payslips_data","arguments":{"month":"November","year":2026,"employee_ids":["K00001"]}}
```

## Modification tools

All names below also start with `talenox_`. Modification tools advertise `readOnlyHint: false`; deletions and updates advertise destructive behavior. Client approval behavior is determined by your MCP client. The server sends each requested modification once and never retries it automatically.

| Area | Tool names (without prefix) |
| --- | --- |
| Employees | `create_sg_employee`, `create_my_employee`, `create_hk_employee`, `create_id_employee`, `update_employee`, `delete_employee` |
| Branches | `create_branch`, `update_branch`, `delete_branch` |
| Cost centres | `create_cost_centre`, `update_cost_centre`, `delete_cost_centre` |
| Roles | `create_role`, `update_role`, `delete_role` |
| Company settings | `update_company_settings` |
| Jobs and salary | `create_job`, `update_job`, `delete_job` |
| Next of kin | `create_next_of_kin`, `update_next_of_kin`, `delete_next_of_kin` |
| Work schedules | `create_working_day`, `update_working_day`, `delete_working_day`, `create_working_hour`, `update_working_hour`, `delete_working_hour` |
| Holidays | `create_holiday_policy`, `update_holiday_policy`, `delete_holiday_policy`, `upsert_holiday_policy_modification`, `delete_holiday_policy_modification` |
| Leave (BETA) | `create_leave_application`, `approve_leave`, `reject_leave`, `delete_leave_application`, `delete_multiple_leave_applications`, `upload_leave_attachment`, `delete_leave_attachments` |
| Approval structures (BETA) | `create_leave_approval_structure`, `update_leave_approval_structure`, `delete_leave_approval_structure`, `add_leave_approval_levels`, `remove_leave_approval_levels`, `assign_leave_approvers`, `unassign_leave_approvers`, `assign_leave_employees`, `unassign_leave_employees` |
| Custom pay items | `create_custom_pay_item`, `update_custom_pay_item`, `delete_custom_pay_item` |
| Payroll payments | `create_payroll_payment`, `delete_payroll_payment`, `process_payroll_payment`, `set_payment_to_draft`, `pull_leave_applications`, `update_payment_settings`, `export_payroll` |
| Payroll items | `create_adhoc_payment`, `create_attendance_payment`, `create_leave_payment_or_deduction`, `create_recurring_payment`, `delete_adhoc_pay_item`, `delete_attendance_pay_item`, `delete_leave_pay_item`, `delete_recurring_pay_item` |
| Payslips | `publish_payslips`, `unpublish_payslips` |

Examples:

```json
{"name":"talenox_update_job","arguments":{"id":85,"job":{"amount":4500,"currency":"SGD"}}}
```

```json
{"name":"talenox_approve_leave","arguments":{"id":21}}
```

```json
{"name":"talenox_create_adhoc_payment","arguments":{"payment":{"id":20},"pay_items":[{"employee_id":"K00001","item_type":"Allowance","amount":100,"remarks":"Travel allowance"}]}}
```

Payload notes:

- Employee, job, branch, role, cost-centre, schedule, next-of-kin and custom-pay-item tools use the documented nested body names, such as `employee`, `job` or `branch`. Employee updates include `identification_full_name` and preserve additional documented regional, banking and custom attributes as JSON. Talenox validates these additional attributes.
- Country-specific employee creation tools all call `POST /employees`; the token's company determines the actual locale. `invite_user: true` requests an employee invitation.
- Assignment arrays on branch, role, cost-centre and schedule updates replace existing assignments. An explicit empty array clears them. Approval-structure assignment/unassignment tools use comma-separated query parameters internally.
- Payroll item creation, leave import and payment-settings changes require either `payment.id` or all three of `payment.month`, `payment.year` and `payment.period`. Empty selectors are rejected. Payroll item `employee_id` values are company-assigned codes.
- Leave attachment upload accepts `leave_application_id`, `employee_id`, `filename`, `mime_type` and canonical padded `file_base64`. Maximum decoded file size is 5 MiB. It sends multipart form data without reading local paths or downloading remote URLs. Attachment deletion accepts an `ids` array with at most ten IDs.
- `publish_payslips` requires month, year, `payslip_pay_date`, numeric `payslip_send_on_pd_setting` and `attach_payslip_to_email` (0 or 1). These settings control upstream publication/email behavior.
- A timeout or network failure cannot establish whether a modification was applied. Check the record state before retrying.
- The approval-structure update parameter table requires `company_default` although the example omits it. This tool requires it explicitly. Working-hour `hours_per_day` is supported and should be supplied for part-time ADW calculations where applicable.
- Talenox documents a statutory-proration bug example for recurring payments involving PR-effective employees. The tool preserves the documented payload; review the returned payroll data. See the [upstream example](https://talenox.github.io/api-doc/#should-preserve-statutory-proration-settings-for-pr-effective-employees-currently-demonstrates-bug).

## API behavior and limitations

- API resource `id` and a company-assigned `employee_id` code are different. Employee lookups, leave calls, and PDF URL retrieval use resource IDs; `get_payslips_data` accepts company-assigned employee codes, matching the documented example.
- Leave and holiday dates use `YYYY-MM-DD`. Legacy employee, job and next-of-kin dates accept `DD/MM/YYYY` (including single-digit days/months) or ISO dates. Payroll months use full English names such as `November`. Leave creation/modification filters use UTC timestamps in `YYYY-MM-DD HH:MM:SSZ` format.
- The leave balance documentation describes `query_date` as `YYYY-MM-DD`, although its examples use compact dates. This implementation follows the parameter description. Confirm this against your account during live verification.
- Paginated tools return one upstream page without aggregating. Pass the final result's ID as `last_seen_id` to request more. Limits are 1–50 where documented. Employee listing has no documented pagination or search filters.
- Payslip data, PDF URL retrieval, and metadata lookup are read operations implemented as POST by Talenox. PDF URLs are returned as data; files are not downloaded.
- Payroll data can include salaries; employee responses can include identity numbers, bank details and other personal data. Results are returned to the connected MCP client without field redaction. Use a client and token appropriate for that access.
- HTTP errors are returned as MCP tool errors. Upstream error bodies and internal exception details are omitted. Requests time out after 30 seconds by default, reject redirects, and reject responses exceeding 5 MiB. Requests are not retried automatically.
- Supported scope is the tools listed above, including HR and payroll modifications and attachment uploads. Tax forms, remote hosting and OAuth authorization/refresh flows are not implemented. This version uses a company API token for one company per process.

## Development and validation

```powershell
npm test
npm run check
```

The 23 tests cover authentication, request encoding, mutation schemas, API errors, timeouts, response and upload limits, missing credentials and every tool through real stdio discovery/calls with both legacy and automatic MCP negotiation. Mutation cases use the public API examples in `docs/api-write-reference.json`; all 69 modification tools are covered. Integration tests preload a fetch mock in a child process; they never call Talenox or require real credentials.

Live account verification is still required. Add a real token locally, connect the Inspector, and start with `talenox_get_metadata` using `{"fields":["company"]}`. Then verify employee IDs and leave date handling using your account.

Source layout:

- `src/client.ts`: fixed API origin, bearer authentication, timeout, response parsing and safe errors.
- `src/tools.ts`: read-tool schemas and endpoint mappings.
- `src/mutations.ts`: HR/payroll modification schemas, payloads and annotations.
- `src/schemas.ts`: shared input validators.
- `src/server.ts`: MCP registration and per-tool annotations.
- `src/index.ts`: environment configuration and stdio entry point.
- `test/`: API-client tests and stdio integration tests.

API reference: [Talenox documentation](https://talenox.github.io/api-doc/). MCP implementation reference: [official TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server).


