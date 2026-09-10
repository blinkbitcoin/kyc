import { createServer, userFromAuthorization } from '../src/server';

const MUTATION =
  'mutation Start($platform: VerificationPlatform!, $tier: String!) { verificationAccessToken(platform: $platform, tier: $tier) { accessToken provider applicantId expiresAt } }';

describe('userFromAuthorization', () => {
  it('takes the bearer token as the user id (a real host verifies its session here)', () => {
    expect(userFromAuthorization('Bearer user-1')).toBe('user-1');
    expect(userFromAuthorization('Bearer  user-1 ')).toBe('user-1');
    expect(userFromAuthorization('Basic abc')).toBeNull();
    expect(userFromAuthorization(undefined)).toBeNull();
  });
});

describe('createServer', () => {
  const startSession = vi.fn(
    async (userId: string, platform: string, levelName: string) => ({
      accessToken: `token-${userId}-${platform}-${levelName}`,
      providerApplicantId: 'app-1',
      expiresAt: '2026-09-10T10:10:00.000Z',
    }),
  );

  afterEach(() => {
    delete process.env.KYC_PROVIDER;
  });

  it('serves the mutation over HTTP for an authenticated caller', async () => {
    process.env.KYC_PROVIDER = 'mock';
    const { server, start } = createServer(startSession);
    const { url } = await start(0);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer user-1',
        },
        body: JSON.stringify({
          query: MUTATION,
          variables: { platform: 'IOS', tier: 'basic' },
        }),
      });
      expect(await response.json()).toEqual({
        data: {
          verificationAccessToken: {
            accessToken: 'token-user-1-IOS-basic-kyc-level',
            provider: 'mock',
            applicantId: 'app-1',
            expiresAt: '2026-09-10T10:10:00.000Z',
          },
        },
      });
      expect(startSession).toHaveBeenCalledWith(
        'user-1',
        'IOS',
        'basic-kyc-level',
      );
    } finally {
      await server.stop();
    }
  });

  it('answers with errors, not a token, for an unauthenticated caller or an unknown tier', async () => {
    const { server, start } = createServer(startSession);
    const { url } = await start(0);
    startSession.mockClear();
    try {
      const post = (headers: Record<string, string>, tier: string) =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({
            query: MUTATION,
            variables: { platform: 'WEB', tier },
          }),
        }).then(r => r.json());
      const anonymous = await post({}, 'basic');
      expect(anonymous.errors[0].message).toBe('Unauthenticated');
      const unknown = await post({ authorization: 'Bearer user-1' }, 'gold');
      expect(unknown.errors[0].message).toMatch(/tier must be/);
      expect(startSession).not.toHaveBeenCalled();
      const health = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ health }' }),
      }).then(r => r.json());
      expect(health).toEqual({ data: { health: 'ok' } });
    } finally {
      await server.stop();
    }
  });

  it('reports the default provider and null fields the provider does not know yet', async () => {
    const sumsubLike = vi.fn(async () => ({ accessToken: 'live' }));
    const { server, start } = createServer(sumsubLike);
    const { url } = await start(0);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer user-1',
        },
        body: JSON.stringify({
          query: MUTATION,
          variables: { platform: 'WEB', tier: 'enhanced' },
        }),
      });
      expect(await response.json()).toEqual({
        data: {
          verificationAccessToken: {
            accessToken: 'live',
            provider: 'sumsub',
            applicantId: null,
            expiresAt: null,
          },
        },
      });
    } finally {
      await server.stop();
    }
  });
});
