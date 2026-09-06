import crypto from 'crypto';
import { vi } from 'vitest';
import {
  createAccessToken,
  fetchApplicantByExternalUserId,
  fetchApplicantStatus,
  HttpError,
  isClientError,
  isNetworkError,
  isNotFoundError,
  shouldRetry,
  signPayload,
  sleep,
  sumsubRequest,
  withRetry,
} from '../src/providers/sumsub/client';

const ENV = {
  SUMSUB_APP_TOKEN: 'app-token',
  SUMSUB_SECRET_KEY: 'secret-key',
  SUMSUB_BASE_URL: 'https://api.sumsub.test',
};

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

describe('signPayload', () => {
  it('signs ts + METHOD + path+query + body with hex HMAC-SHA256', () => {
    const signature = signPayload({
      ts: 1700000000,
      method: 'post',
      pathWithQuery: '/resources/accessTokens?userId=u1',
      body: '',
      secretKey: 'secret-key',
    });
    expect(signature).toBe(
      crypto
        .createHmac('sha256', 'secret-key')
        .update('1700000000POST/resources/accessTokens?userId=u1', 'utf8')
        .digest('hex')
    );
  });

  it('includes the body in the signed string', () => {
    const withBody = signPayload({
      ts: 1,
      method: 'POST',
      pathWithQuery: '/x',
      body: '{"a":1}',
      secretKey: 'k',
    });
    const withoutBody = signPayload({
      ts: 1,
      method: 'POST',
      pathWithQuery: '/x',
      body: '',
      secretKey: 'k',
    });
    expect(withBody).not.toBe(withoutBody);
  });
});

describe('HTTP error classification', () => {
  it('classifies client, not-found and retryable errors', () => {
    expect(isClientError(new HttpError(400, ''))).toBe(true);
    expect(isClientError(new HttpError(429, ''))).toBe(false);
    expect(isClientError(new HttpError(500, ''))).toBe(false);
    expect(isClientError(new Error('boom'))).toBe(false);
    expect(isNotFoundError(new HttpError(404, ''))).toBe(true);
    expect(isNotFoundError(new HttpError(400, ''))).toBe(false);
    expect(shouldRetry(new HttpError(500, ''))).toBe(true);
    expect(shouldRetry(new HttpError(429, ''))).toBe(true);
    expect(shouldRetry(new HttpError(404, ''))).toBe(false);
    expect(shouldRetry(new TypeError('fetch failed'))).toBe(true);
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    expect(shouldRetry(timeout)).toBe(true);
    // An arbitrary thrown error is our bug, not a transient upstream one.
    expect(shouldRetry(new Error('boom'))).toBe(false);
    expect(isNetworkError(new Error('boom'))).toBe(false);
    expect(isNetworkError('not an error')).toBe(false);
  });

  it('formats its message', () => {
    expect(new HttpError(502, 'upstream').message).toBe('HTTP 502: upstream');
    expect(new HttpError(502, 'upstream').name).toBe('HttpError');
  });
});

describe('withRetry', () => {
  it('returns the first success without sleeping', async () => {
    await expect(withRetry(async () => 'ok')).resolves.toBe('ok');
  });

  it('retries retryable failures and succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new HttpError(500, 'later');
        return 'ok';
      },
      { maxAttempts: 3, baseDelay: 0 }
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after maxAttempts and rethrows the last error', async () => {
    await expect(
      withRetry(
        async () => {
          throw new HttpError(503, 'down');
        },
        { maxAttempts: 2, baseDelay: 0 }
      )
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('does not retry an arbitrary thrown error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error('programmer error');
        },
        { maxAttempts: 3, baseDelay: 0 }
      )
    ).rejects.toThrow(/programmer error/);
    expect(calls).toBe(1);
  });

  it('does not retry a client error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new HttpError(400, 'bad');
        },
        { maxAttempts: 3, baseDelay: 0 }
      )
    ).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(1);
  });
});

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

describe('sumsubRequest', () => {
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Object.assign(process.env, ENV);
    fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the app-token headers and the signature', async () => {
    await sumsubRequest('GET', '/resources/x');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sumsub.test/resources/x');
    expect(init.method).toBe('GET');
    expect(init.headers['X-App-Token']).toBe('app-token');
    expect(init.headers['X-App-Access-Ts']).toMatch(/^\d+$/);
    expect(init.headers['X-App-Access-Sig']).toMatch(/^[0-9a-f]{64}$/);
    expect(init.headers.Accept).toBe('application/json');
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('gives up on a request that exceeds SUMSUB_REQUEST_TIMEOUT_MS', async () => {
    process.env.SUMSUB_REQUEST_TIMEOUT_MS = '5';
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        })
    );
    await expect(sumsubRequest('GET', '/resources/x')).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('sets the JSON content type when a body is sent', async () => {
    await sumsubRequest('POST', '/resources/x', '{"a":1}');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe('{"a":1}');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('throws HttpError with the response body on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'not found',
    } as unknown as Response);
    const error = await sumsubRequest('GET', '/resources/x').catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(404);
    expect(error.body).toBe('not found');
  });

  it('throws when the credentials are missing', async () => {
    delete process.env.SUMSUB_APP_TOKEN;
    await expect(sumsubRequest('GET', '/resources/x')).rejects.toThrow(/SUMSUB_APP_TOKEN/);
    delete process.env.SUMSUB_SECRET_KEY;
    process.env.SUMSUB_APP_TOKEN = 'app-token';
    await expect(sumsubRequest('GET', '/resources/x')).rejects.toThrow(/SUMSUB_SECRET_KEY/);
  });
});

describe('endpoint helpers', () => {
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Object.assign(process.env, ENV);
    fetchMock = vi.fn(async () => jsonResponse({ token: 't', userId: 'u1' }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it('mints an access token with url-encoded query parameters', async () => {
    await expect(createAccessToken('user 1', 'basic level', 600)).resolves.toEqual({
      token: 't',
      userId: 'u1',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.sumsub.test/resources/accessTokens?userId=user%201&levelName=basic%20level&ttlInSecs=600'
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('reads an applicant status by applicant id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reviewStatus: 'completed' }));
    await expect(fetchApplicantStatus('a1')).resolves.toEqual({ reviewStatus: 'completed' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.sumsub.test/resources/applicants/a1/status'
    );
  });

  it('reads an applicant by external user id and returns its review', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'a1', review: { reviewStatus: 'pending' } })
    );
    await expect(fetchApplicantByExternalUserId('u1')).resolves.toEqual({
      applicantId: 'a1',
      review: { reviewStatus: 'pending' },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.sumsub.test/resources/applicants/-;externalUserId=u1/one'
    );
  });

  it('tolerates an applicant with no review block', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'a1' }));
    await expect(fetchApplicantByExternalUserId('u1')).resolves.toEqual({
      applicantId: 'a1',
      review: {},
    });
  });
});
