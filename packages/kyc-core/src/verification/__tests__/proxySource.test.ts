import { CombinedGraphQLErrors } from '@apollo/client/errors';

import { createProxySource } from '../proxySource';
import { isTokenRefreshable } from '../types';

import type { ApolloClient } from '@apollo/client';

// Minimal ApolloClient stub - the proxy source only ever calls .mutate
const mockClient = (mutate: jest.Mock): ApolloClient =>
  ({ mutate }) as unknown as ApolloClient;

const fullSession = {
  sessionId: 's-1',
  provider: 'mock',
  status: 'initial',
  accessToken: 'tok-1',
  url: 'https://api.test/hosted/s-1',
  allowedOrigin: 'https://api.test',
  applicantId: 'a-1',
};

const graphQLError = (code: string) =>
  new CombinedGraphQLErrors({ data: null }, [
    { message: 'boom', extensions: { code } },
  ]);

describe('createProxySource', () => {
  it('is token refreshable', () => {
    expect(
      isTokenRefreshable(
        createProxySource({ client: mockClient(jest.fn()), platform: 'IOS' }),
      ),
    ).toBe(true);
  });

  it('interprets bridge messages (the proxy session runs in the hosted page)', () => {
    const source = createProxySource({
      client: mockClient(jest.fn()),
      platform: 'WEB',
    });

    expect(
      source.interpret({ source: 'kyc-bridge', v: 1, type: 'submitted' }),
    ).toEqual({ type: 'submitted' });
    expect(
      source.interpret({ source: 'sumsub', type: 'idCheck.onError' }),
    ).toBeNull();
  });
});

describe('createProxySource.start', () => {
  it('starts a session and maps every field', async () => {
    const mutate = jest
      .fn()
      .mockResolvedValue({ data: { verificationSessionStart: fullSession } });
    const source = createProxySource({
      client: mockClient(mutate),
      platform: 'ANDROID',
      levelName: 'basic-kyc',
      locale: 'es',
    });

    await expect(source.start()).resolves.toEqual({
      provider: 'mock',
      sessionId: 's-1',
      status: 'initial',
      accessToken: 'tok-1',
      url: 'https://api.test/hosted/s-1',
      allowedOrigin: 'https://api.test',
      applicantId: 'a-1',
    });
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: { platform: 'ANDROID', levelName: 'basic-kyc', locale: 'es' },
        },
      }),
    );
  });

  it('maps null optionals to undefined', async () => {
    const mutate = jest.fn().mockResolvedValue({
      data: {
        verificationSessionStart: {
          sessionId: 's-2',
          provider: 'sumsub',
          status: 'initial',
          accessToken: null,
          url: null,
          allowedOrigin: null,
          applicantId: null,
        },
      },
    });
    const source = createProxySource({
      client: mockClient(mutate),
      platform: 'WEB',
    });

    await expect(source.start()).resolves.toEqual({
      provider: 'sumsub',
      sessionId: 's-2',
      status: 'initial',
      accessToken: undefined,
      url: undefined,
      allowedOrigin: undefined,
      applicantId: undefined,
    });
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: { platform: 'WEB', levelName: undefined, locale: undefined },
        },
      }),
    );
  });

  it('rejects with the server code when the mutation fails', async () => {
    const source = createProxySource({
      client: mockClient(
        jest.fn().mockRejectedValue(graphQLError('PROVIDER_UNAVAILABLE')),
      ),
      platform: 'IOS',
    });

    await expect(source.start()).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('rejects with SESSION_CREATION_FAILED when the response is empty', async () => {
    const source = createProxySource({
      client: mockClient(jest.fn().mockResolvedValue({ data: null })),
      platform: 'IOS',
    });

    await expect(source.start()).rejects.toMatchObject({
      code: 'SESSION_CREATION_FAILED',
    });
  });

  it('rejects with SESSION_CREATION_FAILED for a network error, keeping its message', async () => {
    const source = createProxySource({
      client: mockClient(jest.fn().mockRejectedValue(new Error('offline'))),
      platform: 'IOS',
    });

    await expect(source.start()).rejects.toMatchObject({
      code: 'SESSION_CREATION_FAILED',
      message: 'offline',
    });
  });

  it('handles a non-Error, non-coded rejection', async () => {
    const source = createProxySource({
      client: mockClient(jest.fn().mockRejectedValue('weird')),
      platform: 'IOS',
    });

    const error = await source.start().catch((e: Error) => e);
    expect(error).toMatchObject({ code: 'SESSION_CREATION_FAILED' });
    expect((error as Error).message).toBe('');
  });

  it('maps a foreign coded error (e.g. DOMException AbortError) to SESSION_CREATION_FAILED, not its own code', async () => {
    const foreign = Object.assign(new Error('aborted'), { code: 20 });
    const source = createProxySource({
      client: mockClient(jest.fn().mockRejectedValue(foreign)),
      platform: 'IOS',
    });

    await expect(source.start()).rejects.toMatchObject({
      code: 'SESSION_CREATION_FAILED',
      message: 'aborted',
    });
  });
});

describe('createProxySource.refreshToken', () => {
  it('mints a fresh token for the session', async () => {
    const mutate = jest.fn().mockResolvedValue({
      data: { verificationSessionRefresh: { accessToken: 'tok-2' } },
    });
    const source = createProxySource({
      client: mockClient(mutate),
      platform: 'IOS',
    });

    await expect(
      source.refreshToken({ provider: 'mock', sessionId: 's-1' }),
    ).resolves.toBe('tok-2');
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { sessionId: 's-1' } }),
    );
  });

  it('rejects without a sessionId', async () => {
    const source = createProxySource({
      client: mockClient(jest.fn()),
      platform: 'IOS',
    });

    await expect(
      source.refreshToken({ provider: 'mock' }),
    ).rejects.toMatchObject({
      code: 'TOKEN_REFRESH_FAILED',
      message: 'the session has no sessionId to refresh',
    });
  });

  it('rejects with TOKEN_REFRESH_FAILED when the response is empty', async () => {
    const source = createProxySource({
      client: mockClient(jest.fn().mockResolvedValue({ data: null })),
      platform: 'IOS',
    });

    await expect(
      source.refreshToken({ provider: 'mock', sessionId: 's-1' }),
    ).rejects.toMatchObject({ code: 'TOKEN_REFRESH_FAILED' });
  });

  it('rejects with the server code when the refresh mutation fails', async () => {
    const source = createProxySource({
      client: mockClient(
        jest.fn().mockRejectedValue(graphQLError('SESSION_NOT_FOUND')),
      ),
      platform: 'IOS',
    });

    await expect(
      source.refreshToken({ provider: 'mock', sessionId: 's-1' }),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('falls back to TOKEN_REFRESH_FAILED for a network error', async () => {
    const source = createProxySource({
      client: mockClient(jest.fn().mockRejectedValue(new Error('offline'))),
      platform: 'IOS',
    });

    await expect(
      source.refreshToken({ provider: 'mock', sessionId: 's-1' }),
    ).rejects.toMatchObject({
      code: 'TOKEN_REFRESH_FAILED',
      message: 'offline',
    });
  });

  it('handles a non-Error, non-coded rejection', async () => {
    const source = createProxySource({
      client: mockClient(jest.fn().mockRejectedValue('weird')),
      platform: 'IOS',
    });

    const error = await source
      .refreshToken({ provider: 'mock', sessionId: 's-1' })
      .catch((e: Error) => e);
    expect(error).toMatchObject({ code: 'TOKEN_REFRESH_FAILED' });
    expect((error as Error).message).toBe('');
  });

  it('maps a foreign coded error (e.g. a Node ECONNREFUSED) to TOKEN_REFRESH_FAILED, not its own code', async () => {
    const foreign = Object.assign(new Error('refused'), {
      code: 'ECONNREFUSED',
    });
    const source = createProxySource({
      client: mockClient(jest.fn().mockRejectedValue(foreign)),
      platform: 'IOS',
    });

    await expect(
      source.refreshToken({ provider: 'mock', sessionId: 's-1' }),
    ).rejects.toMatchObject({
      code: 'TOKEN_REFRESH_FAILED',
      message: 'refused',
    });
  });
});
