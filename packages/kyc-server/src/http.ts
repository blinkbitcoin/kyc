// HTTP error + retry/backoff shared by every provider call.

// Non-2xx response from a provider
export class HttpError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`HTTP ${status}: ${body}`);
    this.name = 'HttpError';
  }
}

export interface RetryConfig {
  maxAttempts: number;
  // Delay before the second attempt; doubles on each further attempt
  baseDelay: number;
}

export const RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 500, // 500ms, 1s exponential backoff
};

// Non-retryable client error (4xx excluding 429, which is transient)
export const isClientError = (error: unknown): boolean =>
  error instanceof HttpError &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 429;

// Not-found error (404)
export const isNotFoundError = (error: unknown): boolean =>
  error instanceof HttpError && error.status === 404;

/**
 * Errors that mean "the call never got an answer": fetch rejects with a
 * TypeError for connection failures, and AbortSignal.timeout rejects with a
 * TimeoutError (an AbortError when something else aborts it).
 */
const NETWORK_ERROR_NAMES: ReadonlySet<string> = new Set([
  'TypeError',
  'TimeoutError',
  'AbortError',
]);

export const isNetworkError = (error: unknown): boolean =>
  error instanceof Error && NETWORK_ERROR_NAMES.has(error.name);

/**
 * Retry a transient upstream condition or a call that never landed - never
 * an arbitrary thrown error, which is far more likely to be our own bug than
 * something a second attempt fixes.
 */
export const shouldRetry = (error: unknown): boolean =>
  error instanceof HttpError
    ? error.status >= 500 || error.status === 429
    : isNetworkError(error);

export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// Exponential backoff retry wrapper
export const withRetry = async <T>(
  fn: () => Promise<T>,
  config: RetryConfig = RETRY_CONFIG,
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error)) {
        throw error;
      }
      if (attempt < config.maxAttempts - 1) {
        await sleep(config.baseDelay * 2 ** attempt);
      }
    }
  }

  throw lastError;
};
