import { createHostedSource } from '../hostedSource';
import { isTokenRefreshable } from '../types';

import type { TokenRefreshableSource, VerificationSource } from '../types';

describe('createHostedSource - static url', () => {
  it('resolves the url with the default provider, deriving allowedOrigin from it', async () => {
    const source = createHostedSource({ url: 'https://api.test/hosted/s-1' });

    await expect(source.start()).resolves.toEqual({
      provider: 'hosted',
      url: 'https://api.test/hosted/s-1',
      allowedOrigin: 'https://api.test',
    });
  });

  it('leaves allowedOrigin undefined for a non-http(s) url', async () => {
    const source = createHostedSource({ url: 'about:blank' });

    await expect(source.start()).resolves.toEqual({
      provider: 'hosted',
      url: 'about:blank',
      allowedOrigin: undefined,
    });
  });

  it('carries the origin pin and a custom provider name', async () => {
    const source = createHostedSource({
      url: 'https://api.test/hosted/s-1',
      allowedOrigin: 'https://api.test',
      provider: 'sumsub',
    });

    await expect(source.start()).resolves.toEqual({
      provider: 'sumsub',
      url: 'https://api.test/hosted/s-1',
      allowedOrigin: 'https://api.test',
    });
  });
});

describe('createHostedSource - getSession', () => {
  it('awaits the host callback and keeps the session it returns', async () => {
    const source = createHostedSource({
      getSession: async () => ({
        provider: 'sumsub',
        sessionId: 's-1',
        url: 'https://api.test/hosted/s-1',
        allowedOrigin: 'https://api.test',
        applicantId: 'a-1',
      }),
    });

    await expect(source.start()).resolves.toEqual({
      provider: 'sumsub',
      sessionId: 's-1',
      url: 'https://api.test/hosted/s-1',
      allowedOrigin: 'https://api.test',
      applicantId: 'a-1',
    });
  });

  it('accepts a synchronous callback and falls back to the configured origin', async () => {
    const source = createHostedSource({
      allowedOrigin: 'https://api.test',
      getSession: () => ({
        provider: 'mock',
        url: 'https://api.test/hosted/s-2',
      }),
    });

    await expect(source.start()).resolves.toEqual({
      provider: 'mock',
      url: 'https://api.test/hosted/s-2',
      allowedOrigin: 'https://api.test',
    });
  });

  it('derives allowedOrigin from the session url when neither the session nor the options give one', async () => {
    const source = createHostedSource({
      getSession: () => ({
        provider: 'mock',
        url: 'https://provider.test/hosted/s-3',
      }),
    });

    await expect(source.start()).resolves.toEqual({
      provider: 'mock',
      url: 'https://provider.test/hosted/s-3',
      allowedOrigin: 'https://provider.test',
    });
  });

  it('prefers an explicit allowedOrigin option over one derived from the session url', async () => {
    const source = createHostedSource({
      allowedOrigin: 'https://pinned.test',
      getSession: () => ({
        provider: 'mock',
        url: 'https://provider.test/hosted/s-4',
      }),
    });

    await expect(source.start()).resolves.toMatchObject({
      allowedOrigin: 'https://pinned.test',
    });
  });

  it('prefers getSession over a configured url', async () => {
    const source = createHostedSource({
      url: 'https://api.test/unused',
      getSession: () => ({ provider: 'mock', url: 'https://api.test/used' }),
    });

    await expect(source.start()).resolves.toMatchObject({
      url: 'https://api.test/used',
    });
  });

  it('rejects when the callback returns a session without a url', async () => {
    const source = createHostedSource({
      getSession: () => ({ provider: 'mock' }),
    });

    await expect(source.start()).rejects.toEqual({
      code: 'VALIDATION_ERROR',
      message: 'getSession() returned a session without a url',
    });
  });

  it('propagates a rejection from the callback unchanged', async () => {
    const failure = { code: 'UNAUTHORIZED' };
    const source = createHostedSource({
      getSession: () => Promise.reject(failure),
    });

    await expect(source.start()).rejects.toBe(failure);
  });
});

describe('createHostedSource - misconfiguration', () => {
  it('rejects when neither url nor getSession is given', async () => {
    const source = createHostedSource({});

    await expect(source.start()).rejects.toEqual({
      code: 'VALIDATION_ERROR',
      message:
        'createHostedSource requires either a url or a getSession callback',
    });
  });
});

describe('createHostedSource - capabilities', () => {
  it('is not token refreshable by default', () => {
    expect(
      isTokenRefreshable(createHostedSource({ url: 'https://a.test' })),
    ).toBe(false);
  });

  it('is token refreshable when a refreshToken callback is given', async () => {
    const refreshToken = jest.fn().mockResolvedValue('tok-2');
    const source = createHostedSource({ url: 'https://a.test', refreshToken });

    expect(isTokenRefreshable(source)).toBe(true);
    if (isTokenRefreshable(source)) {
      await expect(
        source.refreshToken({ provider: 'mock', sessionId: 's-1' }),
      ).resolves.toBe('tok-2');
    }
    expect(refreshToken).toHaveBeenCalledWith({
      provider: 'mock',
      sessionId: 's-1',
    });
  });

  it('interprets bridge messages and ignores everything else', () => {
    const source = createHostedSource({ url: 'https://a.test' });

    expect(
      source.interpret({ source: 'kyc-bridge', v: 1, type: 'cancel' }),
    ).toEqual({
      type: 'cancel',
    });
    expect(source.interpret({ type: 'cancel' })).toBeNull();
  });
});

describe('createHostedSource - overload types (compile-time only)', () => {
  it('types a refreshToken-bearing options object as TokenRefreshableSource', () => {
    // This assignment is the assertion: it only compiles if the overload
    // resolves to TokenRefreshableSource, not the base VerificationSource.
    const refreshable: TokenRefreshableSource = createHostedSource({
      url: 'https://a.test',
      refreshToken: async () => 'tok',
    });

    const plain: VerificationSource = createHostedSource({
      url: 'https://a.test',
    });
    expect(isTokenRefreshable(plain)).toBe(false);
    expect(isTokenRefreshable(refreshable)).toBe(true);
  });
});
