import {
  GetSocialAPIError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  InstagramError,
} from './errors.js';

export const DEFAULT_BASE_URL = 'https://api.getsocialapi.com/v1';

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Seconds to wait per the Retry-After header (clamped to 0..30, default 1). */
function retryAfterSeconds(headers) {
  const value = Number(headers?.get?.('retry-after'));
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.round(value), 0), 30);
}

/** Map a fetch Response to a decoded body or a typed exception. */
async function parseResponse(resp) {
  const text = await resp.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  const ctx = { status: resp.status, headers: resp.headers, body };

  if (resp.status === 401) throw new UnauthorizedError(ctx);
  if (resp.status === 400) throw new BadRequestError(ctx);
  if (resp.status === 404) throw new NotFoundError(ctx);
  if (resp.status === 429) throw new RateLimitError(ctx, { retryAfter: retryAfterSeconds(resp.headers) });
  if (resp.status === 503) throw new ServiceUnavailableError(ctx, { retryAfter: retryAfterSeconds(resp.headers) });
  if (resp.status >= 400) {
    // Instagram errors in raw mode: {"message": "...", "status": "fail"}
    if (body?.status === 'fail') {
      throw new InstagramError(resp.status, body.message ?? 'unknown', ctx);
    }
    throw new GetSocialAPIError(`HTTP ${resp.status}: ${text}`, ctx);
  }
  return body;
}

/** HTTP transport: auth, JSON parsing, retries with Retry-After. */
export class Transport {
  constructor({ baseUrl = DEFAULT_BASE_URL, apiKey, timeout = 30, maxRetries = 3, fetchImpl } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.timeout = timeout;
    this.maxRetries = maxRetries;
    this.fetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (typeof this.fetch !== 'function') {
      throw new Error('fetch is not available (use Node.js >= 18 or pass fetchImpl)');
    }
  }

  /**
   * @param {Record<string, any>} [params] query parameters
   * @returns {Promise<Record<string, any>>} decoded JSON body
   */
  async request(method, path, params = null, { auth = true } = {}) {
    let url = this.baseUrl + path;
    if (params && Object.keys(params).length > 0) {
      url += '?' + new URLSearchParams(params).toString();
    }
    const headers = auth ? { 'X-API-Key': this.apiKey } : {};
    const attempts = this.maxRetries + 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      let resp;
      try {
        resp = await this.fetch(url, {
          method,
          headers,
          signal: AbortSignal.timeout(this.timeout * 1000),
        });
      } catch (e) {
        if (attempt < attempts - 1) {
          await sleep(Math.min(2 ** attempt, 10) * 1000);
          continue;
        }
        throw new GetSocialAPIError(`Network error: ${e?.message ?? e}`);
      }

      if (RETRYABLE.has(resp.status) && attempt < attempts - 1) {
        await sleep(retryAfterSeconds(resp.headers) * 1000);
        continue;
      }
      return parseResponse(resp);
    }

    throw new GetSocialAPIError('Request failed after retries'); // unreachable
  }
}
