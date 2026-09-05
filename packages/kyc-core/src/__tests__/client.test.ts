/**
 * Apollo client factory (proxy mode only - never reachable from ./hosted).
 */

import { CombinedGraphQLErrors } from '@apollo/client/errors';

import {
  createAuthContextSetter,
  createKycApolloClient,
  getApolloErrorCode,
  handleApolloErrors,
} from '../client';

const originalConsoleError = console.error;

describe('createKycApolloClient', () => {
  it('creates a client with a link chain and a cache', () => {
    const client = createKycApolloClient({
      uri: 'http://example.test/graphql',
    });

    expect(client).toBeDefined();
    expect(client.link).toBeDefined();
    expect(typeof client.link.request).toBe('function');
    expect(client.cache).toBeDefined();
  });

  it('accepts a token provider', () => {
    const client = createKycApolloClient({
      uri: 'http://example.test/graphql',
      getAuthToken: () => 'a-token',
    });

    expect(client.link).toBeDefined();
  });
});

describe('createAuthContextSetter (authLink)', () => {
  it('attaches a Bearer authorization header from the token provider', async () => {
    const setter = createAuthContextSetter(() => 'mock-jwt-token');

    const context = await setter(
      { headers: { 'content-type': 'application/json' } },
      {} as never,
    );

    expect(context.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer mock-jwt-token',
    });
  });

  it('supports async token providers', async () => {
    const setter = createAuthContextSetter(async () => 'async-token');

    const context = await setter({ headers: {} }, {} as never);

    expect(context.headers).toMatchObject({
      authorization: 'Bearer async-token',
    });
  });

  it('sends an empty authorization header without a token provider', async () => {
    const setter = createAuthContextSetter();

    const context = await setter({ headers: {} }, {} as never);

    expect(context.headers).toMatchObject({ authorization: '' });
  });

  it('sends an empty authorization header when the provider returns null', async () => {
    const setter = createAuthContextSetter(() => null);

    const context = await setter({ headers: {} }, {} as never);

    expect(context.headers).toMatchObject({ authorization: '' });
  });

  it('preserves existing headers when adding authorization', async () => {
    const setter = createAuthContextSetter(() => 'token');

    const context = await setter(
      { headers: { 'x-custom': 'value' } },
      {} as never,
    );

    expect(context.headers).toMatchObject({ 'x-custom': 'value' });
  });
});

describe('handleApolloErrors (errorLink)', () => {
  beforeEach(() => {
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('logs each GraphQL error with its code and message', () => {
    const error = new CombinedGraphQLErrors({ data: null }, [
      {
        message: 'Session not found',
        extensions: { code: 'SESSION_NOT_FOUND' },
      },
      { message: 'Second error', extensions: { code: 'SECOND_CODE' } },
    ]);

    handleApolloErrors({ error } as never);

    expect(console.error).toHaveBeenCalledWith(
      '[GraphQL error]: SESSION_NOT_FOUND - Session not found',
    );
    expect(console.error).toHaveBeenCalledWith(
      '[GraphQL error]: SECOND_CODE - Second error',
    );
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('logs a network error for non-GraphQL errors', () => {
    handleApolloErrors({
      error: new Error('Network connection failed'),
    } as never);

    expect(console.error).toHaveBeenCalledWith(
      '[Network error]: Error: Network connection failed',
    );
  });
});

describe('getApolloErrorCode', () => {
  it('extracts the code from a CombinedGraphQLErrors', () => {
    const error = new CombinedGraphQLErrors({ data: null }, [
      { message: 'x', extensions: { code: 'UNAUTHORIZED' } },
    ]);

    expect(getApolloErrorCode(error, 'FALLBACK')).toBe('UNAUTHORIZED');
  });

  it('falls back for non-Apollo errors', () => {
    expect(getApolloErrorCode(new Error('network'), 'FALLBACK')).toBe(
      'FALLBACK',
    );
  });

  it('falls back when an Apollo error carries no code', () => {
    const error = new CombinedGraphQLErrors({ data: null }, [{ message: 'x' }]);

    expect(getApolloErrorCode(error, 'FALLBACK')).toBe('FALLBACK');
  });
});
