export interface ClientOptions {
  token: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  formData?: FormData;
}

export class TalenoxError extends Error {}

const BASE_URL = 'https://api.talenox.com/api/v2/';
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export class TalenoxClient {
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: ClientOptions) {
    this.token = options.token.trim();
    if (!this.token || /\s/.test(this.token)) {
      throw new TalenoxError('Set TALENOX_API_TOKEN to a valid company API token.');
    }
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 300_000) {
      throw new TalenoxError('TALENOX_TIMEOUT_MS must be an integer between 1 and 300000.');
    }
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async request(request: ApiRequest, signal?: AbortSignal): Promise<unknown> {
    // Paths are supplied by our tool catalog, never by the MCP caller.
    if (!/^[a-zA-Z0-9_/-]+$/.test(request.path) || request.path.startsWith('/')) {
      throw new TalenoxError('Invalid API endpoint.');
    }
    const url = new URL(request.path, BASE_URL);
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    try {
      const response = await this.fetchImpl(url, {
        method: request.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          ...(request.formData || request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: request.formData ?? (request.body === undefined ? undefined : JSON.stringify(request.body)),
        redirect: 'error',
        signal: combinedSignal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        const hint = response.status === 401 ? 'Check TALENOX_API_TOKEN.'
          : response.status === 403 ? 'The token does not permit this operation.'
          : response.status === 404 ? 'The requested resource was not found.'
          : response.status === 429 ? 'Rate limit reached; retry later.'
          : response.status === 422 ? 'Check the supplied parameters against the API documentation.'
          : 'The API request failed. Check the record state before retrying a modification.';
        // Do not echo upstream error bodies: they can contain HR data or credentials.
        throw new TalenoxError(`Talenox API returned HTTP ${response.status}. ${hint}`);
      }
      if (response.status === 204 || !response.body) return null;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new TalenoxError('Talenox response exceeds 5 MiB. Narrow your filters or request a smaller page.');
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body.trim()) return null;
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new TalenoxError('Talenox returned a response that is not valid JSON.');
      }
    } catch (error) {
      if (error instanceof TalenoxError) throw error;
      if (signal?.aborted) throw new TalenoxError('Talenox request was cancelled.');
      if (controller.signal.aborted) throw new TalenoxError('Talenox request timed out. A modification may already have been applied; check the record before retrying.');
      throw new TalenoxError('Unable to complete the Talenox API request. Check the network and record state before retrying a modification.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function clientFromEnv(env: NodeJS.ProcessEnv = process.env): TalenoxClient {
  return new TalenoxClient({
    token: env.TALENOX_API_TOKEN ?? '',
    timeoutMs: env.TALENOX_TIMEOUT_MS === undefined ? undefined : Number(env.TALENOX_TIMEOUT_MS),
  });
}

