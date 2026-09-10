import { createHmac } from 'node:crypto';
import { HttpError } from '../../../http';
import type { Logger } from '../../../log';
import type { FetchLike } from '../../../types';
import { createSumsubClient, signPayload } from '../client';
import { type SumsubConfig, sumsubConfigFromEnv } from '../config';

const config = sumsubConfigFromEnv({
  SUMSUB_APP_TOKEN: 'app-token',
  SUMSUB_SECRET_KEY: 'secret-key',
  SUMSUB_BASE_URL: 'https://api.sumsub.test',
});

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

// A fetch that answers from a queue and records every call
const fakeFetch = (replies: Response[] = []) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init: init ?? {} });
    return replies.shift() ?? jsonResponse({ ok: true });
  };
  return {
    fetchImpl,
    calls,
    headers: (i: number) => calls[i].init.headers as Record<string, string>,
  };
};

const fakeLogger = (): Logger & { error: jest.Mock } => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('signPayload', () => {
  it('signs ts + METHOD + path+query + body with hex HMAC-SHA256', () => {
    expect(
      signPayload({
        ts: 1700000000,
        method: 'post',
        pathWithQuery: '/resources/accessTokens?userId=u1',
        body: '',
        secretKey: 'secret-key',
      }),
    ).toBe(
      createHmac('sha256', 'secret-key')
        .update('1700000000POST/resources/accessTokens?userId=u1', 'utf8')
        .digest('hex'),
    );
  });

  it('includes the body in the signed string', () => {
    const base = { ts: 1, method: 'POST', pathWithQuery: '/x', secretKey: 'k' };
    expect(signPayload({ ...base, body: '{"a":1}' })).not.toBe(
      signPayload({ ...base, body: '' }),
    );
  });

  it('signs a binary body byte for byte (a multipart document upload)', () => {
    // Bytes above 0x7f would be mangled by a string round trip; the
    // signature must cover exactly what goes on the wire
    const base = { ts: 1, method: 'POST', pathWithQuery: '/x', secretKey: 'k' };
    const bytes = Uint8Array.from([0xff, 0xd8, 0x00, 0x80, 0xfe]);
    expect(signPayload({ ...base, body: bytes })).toBe(
      createHmac('sha256', 'k')
        .update('1POST/x', 'utf8')
        .update(bytes)
        .digest('hex'),
    );
    expect(signPayload({ ...base, body: 'abc' })).toBe(
      signPayload({ ...base, body: Buffer.from('abc', 'utf8') }),
    );
  });
});

describe('request', () => {
  it('sends the app-token headers and a signature over ts, method, path and body', async () => {
    const f = fakeFetch();
    const client = createSumsubClient(config, {
      fetch: f.fetchImpl,
      now: () => 1700000000,
    });
    await client.request('GET', '/resources/x');
    expect(f.calls[0].url).toBe('https://api.sumsub.test/resources/x');
    expect(f.calls[0].init.method).toBe('GET');
    expect(f.headers(0)['X-App-Token']).toBe('app-token');
    expect(f.headers(0)['X-App-Access-Ts']).toBe('1700000000');
    expect(f.headers(0)['X-App-Access-Sig']).toBe(
      signPayload({
        ts: 1700000000,
        method: 'GET',
        pathWithQuery: '/resources/x',
        body: '',
        secretKey: 'secret-key',
      }),
    );
    expect(f.headers(0).Accept).toBe('application/json');
    expect(f.calls[0].init.body).toBeUndefined();
    expect(f.calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sets the JSON content type when a body is sent', async () => {
    const f = fakeFetch();
    await createSumsubClient(config, { fetch: f.fetchImpl }).request(
      'POST',
      '/resources/x',
      '{"a":1}',
    );
    expect(f.calls[0].init.body).toBe('{"a":1}');
    expect(f.headers(0)['Content-Type']).toBe('application/json');
    expect(f.headers(0)['X-App-Access-Ts']).toMatch(/^\d+$/);
  });

  it('gives up on a request that exceeds requestTimeoutMs', async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        );
      });
    const client = createSumsubClient(
      { ...config, requestTimeoutMs: 5 },
      { fetch: hanging },
    );
    await expect(client.request('GET', '/resources/x')).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('throws HttpError with the response body on a non-2xx response, logging the status only', async () => {
    const logger = fakeLogger();
    const f = fakeFetch([
      {
        ok: false,
        status: 404,
        text: async () => 'not found: applicant-1',
      } as unknown as Response,
    ]);
    const error = await createSumsubClient(config, {
      fetch: f.fetchImpl,
      logger,
    })
      .request('GET', '/resources/x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(404);
    expect((error as HttpError).body).toBe('not found: applicant-1');
    expect(logger.error).toHaveBeenCalledWith(
      'Sumsub request failed: GET HTTP 404',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'applicant-1',
    );
  });

  it('throws when the credentials are missing, reading a config getter per call', async () => {
    let current: SumsubConfig = { ...config, appToken: undefined };
    const client = createSumsubClient(() => current, {
      fetch: fakeFetch().fetchImpl,
    });
    await expect(client.request('GET', '/x')).rejects.toThrow(
      /SUMSUB_APP_TOKEN/,
    );
    current = { ...config, secretKey: undefined };
    await expect(client.request('GET', '/x')).rejects.toThrow(
      /SUMSUB_SECRET_KEY/,
    );
    current = config;
    await expect(client.request('GET', '/x')).resolves.toEqual({ ok: true });
  });

  it('uses the global fetch by default', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ok: 1 }));
    await expect(
      createSumsubClient(config).request('GET', '/x'),
    ).resolves.toEqual({ ok: 1 });
    expect(spy).toHaveBeenCalledWith(
      'https://api.sumsub.test/x',
      expect.any(Object),
    );
    spy.mockRestore();
  });
});

describe('endpoint helpers', () => {
  it('mints an access token with url-encoded query parameters', async () => {
    const f = fakeFetch([jsonResponse({ token: 't', userId: 'u1' })]);
    await expect(
      createSumsubClient(config, { fetch: f.fetchImpl }).createAccessToken(
        'user 1',
        'basic level',
        600,
      ),
    ).resolves.toEqual({ token: 't', userId: 'u1' });
    expect(f.calls[0].url).toBe(
      'https://api.sumsub.test/resources/accessTokens?userId=user%201&levelName=basic%20level&ttlInSecs=600',
    );
    expect(f.calls[0].init.method).toBe('POST');
  });

  it('reads an applicant status by applicant id', async () => {
    const f = fakeFetch([jsonResponse({ reviewStatus: 'completed' })]);
    await expect(
      createSumsubClient(config, { fetch: f.fetchImpl }).fetchApplicantStatus(
        'a1',
      ),
    ).resolves.toEqual({ reviewStatus: 'completed' });
    expect(f.calls[0].url).toBe(
      'https://api.sumsub.test/resources/applicants/a1/status',
    );
  });

  it('reads an applicant by external user id and returns its review, tolerating none', async () => {
    const f = fakeFetch([
      jsonResponse({ id: 'a1', review: { reviewStatus: 'pending' } }),
      jsonResponse({ id: 'a1' }),
    ]);
    const client = createSumsubClient(config, { fetch: f.fetchImpl });
    await expect(client.fetchApplicantByExternalUserId('u1')).resolves.toEqual({
      applicantId: 'a1',
      review: { reviewStatus: 'pending' },
    });
    expect(f.calls[0].url).toBe(
      'https://api.sumsub.test/resources/applicants/-;externalUserId=u1/one',
    );
    await expect(client.fetchApplicantByExternalUserId('u1')).resolves.toEqual({
      applicantId: 'a1',
      review: {},
    });
  });
});
