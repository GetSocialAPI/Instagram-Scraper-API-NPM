/**
 * Base class for all GetSocialAPI Instagram SDK failures.
 *
 * Exposes `.status` (HTTP status or null), `.headers` and `.body` of the
 * failing response.
 */
export class GetSocialAPIError extends Error {
  constructor(message, { status = null, headers = {}, body = {} } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.headers = headers;
    this.body = body;
  }
}

/**
 * Extract a human-readable reason:
 * {"error": "..."} | {"error": {"message": "..."}} | {"message": "..."}.
 */
function reason(body, fallback) {
  const err = body?.error;
  const fromError =
    typeof err === 'string' ? err : typeof err?.message === 'string' ? err.message : null;
  if (fromError) return fromError;
  if (typeof body?.message === 'string' && body.message) return body.message;
  return fallback;
}

/** 400 — invalid parameters (body: {"error", "field"}). `.field` points to the bad parameter. */
export class BadRequestError extends GetSocialAPIError {
  constructor(ctx = {}) {
    const field = typeof ctx.body?.field === 'string' ? ctx.body.field : null;
    let msg = reason(ctx.body, 'Bad request');
    if (field) msg += ` (field: ${field})`;
    super(msg, ctx);
    this.field = field;
  }
}

/** 401 — invalid or missing API key. */
export class UnauthorizedError extends GetSocialAPIError {
  constructor(ctx = {}) {
    super('Invalid API key', ctx);
  }
}

/** Convenience alias for UnauthorizedError. */
export const APIKeyError = UnauthorizedError;

/** 404 — target object does not exist. Do not retry. */
export class NotFoundError extends GetSocialAPIError {
  constructor(ctx = {}) {
    super(reason(ctx.body, 'Not found'), ctx);
  }
}

/** 429 — key rate limit exceeded. Honors Retry-After; `.retryAfter` seconds. */
export class RateLimitError extends GetSocialAPIError {
  constructor(ctx = {}, { retryAfter = 1 } = {}) {
    super(`Rate limit exceeded, retry after ${retryAfter}s`, ctx);
    this.retryAfter = retryAfter;
  }
}

/** 503 — no live accounts or the service is stopped. `.retryAfter` seconds when provided. */
export class ServiceUnavailableError extends GetSocialAPIError {
  constructor(ctx = {}, { retryAfter = null } = {}) {
    let msg = 'Service unavailable';
    if (retryAfter !== null) msg += `, retry after ${retryAfter}s`;
    super(msg, ctx);
    this.retryAfter = retryAfter;
  }
}

/** Non-404 error returned by the Instagram private API (raw mode). `.upstreamStatus` is the API status. */
export class InstagramError extends GetSocialAPIError {
  constructor(status, message, ctx = {}) {
    super(`Instagram API error ${status}: ${message}`, ctx);
    this.upstreamStatus = status;
  }
}
