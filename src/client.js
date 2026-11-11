import { Transport, DEFAULT_BASE_URL } from './transport.js';
import { InstagramAPI } from './instagram.js';

/**
 * GetSocialAPI client.
 *
 * @example
 * const client = new Client({ apiKey: 'gsa_live_...' });
 * const user = await client.instagram.userByUsername('durov');
 */
export class Client {
  /** @type {InstagramAPI} */
  instagram;

  #transport;

  constructor({
    apiKey = process.env.GETSOCIALAPI_API_KEY,
    baseUrl = DEFAULT_BASE_URL,
    timeout = 30,
    maxRetries = 3,
    fetchImpl,
  } = {}) {
    if (!apiKey) {
      throw new Error('apiKey is required (pass apiKey or set GETSOCIALAPI_API_KEY)');
    }
    this.#transport = new Transport({ baseUrl, apiKey, timeout, maxRetries, fetchImpl });
    this.instagram = new InstagramAPI(this.#transport);
  }

  /** Upstream liveness probe: {"ok": true, "state": "ready"}. */
  health() {
    return this.#transport.request('GET', '/health', null, { auth: false });
  }
}
