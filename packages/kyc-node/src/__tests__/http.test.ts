import {
  HttpError,
  isClientError,
  isNetworkError,
  isNotFoundError,
  RETRY_CONFIG,
  shouldRetry,
  sleep,
  withRetry,
} from '../http';

const named = (name: string): Error => {
  const error = new Error(name);
  error.name = name;
  return error;
};

describe('HttpError', () => {
  it('carries status and body in the message', () => {
    const error = new HttpError(502, 'bad gateway');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('HttpError');
    expect(error.status).toBe(502);
    expect(error.body).toBe('bad gateway');
    expect(error.message).toBe('HTTP 502: bad gateway');
  });
});

describe('error classification', () => {
  it('isClientError: 4xx except 429', () => {
    expect(isClientError(new HttpError(400, ''))).toBe(true);
    expect(isClientError(new HttpError(404, ''))).toBe(true);
    expect(isClientError(new HttpError(429, ''))).toBe(false);
    expect(isClientError(new HttpError(500, ''))).toBe(false);
    expect(isClientError(new Error('x'))).toBe(false);
  });

  it('isNotFoundError: exactly 404', () => {
    expect(isNotFoundError(new HttpError(404, ''))).toBe(true);
    expect(isNotFoundError(new HttpError(400, ''))).toBe(false);
    expect(isNotFoundError('404')).toBe(false);
  });

  it('isNetworkError: the three names fetch and AbortSignal produce', () => {
    expect(isNetworkError(named('TypeError'))).toBe(true);
    expect(isNetworkError(named('TimeoutError'))).toBe(true);
    expect(isNetworkError(named('AbortError'))).toBe(true);
    expect(isNetworkError(named('RangeError'))).toBe(false);
    expect(isNetworkError('TypeError')).toBe(false);
  });

  it('shouldRetry: 5xx, 429 and network errors only', () => {
    expect(shouldRetry(new HttpError(500, ''))).toBe(true);
    expect(shouldRetry(new HttpError(503, ''))).toBe(true);
    expect(shouldRetry(new HttpError(429, ''))).toBe(true);
    expect(shouldRetry(new HttpError(400, ''))).toBe(false);
    expect(shouldRetry(named('TypeError'))).toBe(true);
    expect(shouldRetry(new Error('our own bug'))).toBe(false);
  });
});

describe('withRetry', () => {
  const fast = { maxAttempts: 3, baseDelay: 0 };

  it('returns the first successful result', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new HttpError(503, ''))
      .mockResolvedValueOnce('ok');
    await expect(withRetry(fn, fast)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxAttempts with the last error', async () => {
    const fn = jest.fn().mockRejectedValue(new HttpError(500, 'down'));
    await expect(withRetry(fn, fast)).rejects.toThrow('HTTP 500: down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-retryable error', async () => {
    const fn = jest.fn().mockRejectedValue(new HttpError(400, 'nope'));
    await expect(withRetry(fn, fast)).rejects.toThrow('HTTP 400: nope');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('backs off exponentially between attempts', async () => {
    jest.useFakeTimers();
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new HttpError(500, ''))
      .mockRejectedValueOnce(new HttpError(500, ''))
      .mockResolvedValueOnce('ok');
    const pending = withRetry(fn, { maxAttempts: 3, baseDelay: 100 });
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);
    await expect(pending).resolves.toBe('ok');
    jest.useRealTimers();
  });

  it('uses the default config when none is given', async () => {
    expect(RETRY_CONFIG).toEqual({ maxAttempts: 3, baseDelay: 500 });
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('sleep', () => {
  it('resolves after the delay', async () => {
    jest.useFakeTimers();
    const pending = sleep(50);
    jest.advanceTimersByTime(50);
    await expect(pending).resolves.toBeUndefined();
    jest.useRealTimers();
  });
});
