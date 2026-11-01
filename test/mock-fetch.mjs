// Loaded only by integration-test child processes; never contacts Talenox.
globalThis.fetch = async (url, options) => {
  if (url.origin !== 'https://api.talenox.com' || options.headers.Authorization !== 'Bearer integration-test-token') throw new Error('Unexpected destination or authentication');
  if (url.pathname === '/api/v2/employees/401') return new Response('private-data integration-test-token', { status: 401 });
  let body = options.body ? JSON.parse(typeof options.body === 'string' ? options.body : 'null') : null;
  if (options.body instanceof FormData) {
    if (options.headers['Content-Type']) throw new Error('Multipart Content-Type must be set by fetch');
    const file = options.body.get('file');
    body = {
      leave_application_id: options.body.get('leave_application_id'), employee_id: options.body.get('employee_id'),
      file: { name: file.name, type: file.type, size: file.size, base64: Buffer.from(await file.arrayBuffer()).toString('base64') },
    };
  }
  return Response.json({ path: url.pathname, method: options.method, query: Object.fromEntries(url.searchParams), body });
};
