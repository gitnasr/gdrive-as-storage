const RETRYABLE_STATUS_CODES = new Set([403, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1_000;

/**
 * Wraps a Drive API call with exponential backoff.
 * Retries on 403 (rate limit), 429 (too many requests), and transient 5xx errors.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      console.log("🚀 ~ withRetry ~ err:", err)
      lastError = err;
      const status = extractStatusCode(err);

      if (!RETRYABLE_STATUS_CODES.has(status) || attempt === MAX_RETRIES) {
        throw err;
      }

      // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s (+0–1s jitter)
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1_000;
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function extractStatusCode(err: unknown): number {
  if (err === null || typeof err !== 'object') return 0;

  const e = err as Record<string, unknown>;

  // googleapis wraps HTTP errors with a numeric `code` field
  if (typeof e['code'] === 'number') return e['code'];

  // Axios-style response envelope
  const response = e['response'];
  if (response !== null && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    if (typeof r['status'] === 'number') return r['status'];
  }

  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
