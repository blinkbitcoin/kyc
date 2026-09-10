import { isTokenRefreshable } from '@blinkbitcoin/kyc-react';
import { describe, expect, it, vi } from 'vitest';

import { buildSource } from '../source';

import type { ApolloClient } from '@apollo/client';

const clientWith = (mutate: ReturnType<typeof vi.fn>) =>
  ({ mutate, query: vi.fn() }) as unknown as ApolloClient;

describe('buildSource', () => {
  it('proxy mode returns the refreshable Apollo-backed source', () => {
    const source = buildSource('proxy', clientWith(vi.fn()));

    expect(typeof source.start).toBe('function');
    expect(isTokenRefreshable(source)).toBe(true);
  });

  it('hosted mode takes its session from the same backend proxy', async () => {
    const mutate = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          verificationSessionStart: {
            provider: 'mock',
            sessionId: 's-1',
            url: 'http://localhost:5000/hosted/s-1',
            allowedOrigin: 'http://localhost:5000',
            accessToken: 'tok-1',
          },
        },
      })
      .mockResolvedValueOnce({
        data: { verificationSessionRefresh: { accessToken: 'tok-2' } },
      });

    const source = buildSource('hosted', clientWith(mutate));

    await expect(source.start()).resolves.toMatchObject({
      url: 'http://localhost:5000/hosted/s-1',
      allowedOrigin: 'http://localhost:5000',
    });
    expect(isTokenRefreshable(source)).toBe(true);
    if (isTokenRefreshable(source)) {
      await expect(
        source.refreshToken({ provider: 'mock', sessionId: 's-1' }),
      ).resolves.toBe('tok-2');
    }
  });

  it('falls back to the demo Apollo client', () => {
    expect(typeof buildSource('hosted').start).toBe('function');
  });
});
