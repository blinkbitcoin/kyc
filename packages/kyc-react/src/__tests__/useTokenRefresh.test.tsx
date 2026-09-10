import { act, renderHook } from '@testing-library/react';
import {
  ClientErrorCodes,
  createSetTokenMessage,
  getErrorMessage,
} from '@blinkbitcoin/kyc-core';

import { useTokenRefresh } from '../useTokenRefresh';

import type { RefObject } from 'react';
import type {
  TokenRefreshableSource,
  VerificationSession,
  VerificationSource,
} from '@blinkbitcoin/kyc-core';
import type { TokenPostable } from '../useTokenRefresh';

const ORIGIN = 'https://kyc.example.com';

const session: VerificationSession = {
  provider: 'mock',
  sessionId: 'sess-1',
  url: `${ORIGIN}/hosted/sess-1`,
  allowedOrigin: ORIGIN,
};

const plain = (): VerificationSource => ({
  start: async () => session,
  interpret: () => null,
});

const refreshable = (
  refreshToken: TokenRefreshableSource['refreshToken'],
): TokenRefreshableSource => ({ ...plain(), refreshToken });

const mount = (
  source: VerificationSource,
  overrides: {
    target?: RefObject<TokenPostable | null>;
    getSession?: () => VerificationSession | null;
  } = {},
) => {
  const postMessage = jest.fn();
  const target =
    overrides.target ??
    ({
      current: { contentWindow: { postMessage } },
    } as RefObject<TokenPostable | null>);
  const onFailure = jest.fn();
  const view = renderHook(() =>
    useTokenRefresh(source, {
      getSession: overrides.getSession ?? (() => session),
      target,
      onFailure,
    }),
  );
  return { view, postMessage, onFailure };
};

describe('useTokenRefresh - refusals', () => {
  it('fails with TOKEN_EXPIRED when the source cannot refresh', () => {
    const { view, onFailure } = mount(plain());

    act(() => view.result.current());

    expect(onFailure).toHaveBeenCalledWith({
      code: ClientErrorCodes.TOKEN_EXPIRED,
      message: expect.any(String),
    });
  });

  it('fails with TOKEN_EXPIRED when there is no session to refresh', () => {
    const refreshToken = jest.fn(async () => 'never');
    const { view, onFailure } = mount(refreshable(refreshToken), {
      getSession: () => null,
    });

    act(() => view.result.current());

    expect(refreshToken).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith({
      code: ClientErrorCodes.TOKEN_EXPIRED,
      message: expect.any(String),
    });
  });

  it('fails with TOKEN_EXPIRED when the session carries no origin to post to', () => {
    const refreshToken = jest.fn(async () => 'never');
    const { view, onFailure } = mount(refreshable(refreshToken), {
      getSession: () => ({ provider: 'mock', url: 'about:blank' }),
    });

    act(() => view.result.current());

    expect(refreshToken).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith({
      code: ClientErrorCodes.TOKEN_EXPIRED,
      message: expect.any(String),
    });
  });
});

describe('useTokenRefresh - posting', () => {
  it('posts the full setToken envelope to the pinned origin, never "*"', async () => {
    const source = refreshable(jest.fn(async () => 'tok-2'));
    const { view, postMessage, onFailure } = mount(source);

    await act(async () => {
      view.result.current();
    });

    expect(source.refreshToken).toHaveBeenCalledWith(session);
    expect(postMessage).toHaveBeenCalledWith(
      createSetTokenMessage('tok-2'),
      ORIGIN,
    );
    expect(postMessage.mock.calls[0][1]).not.toBe('*');
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('does nothing when no frame is attached', async () => {
    const target = { current: null } as RefObject<TokenPostable | null>;
    const { view, onFailure } = mount(
      refreshable(async () => 'tok-2'),
      { target },
    );

    await act(async () => {
      view.result.current();
    });

    expect(onFailure).not.toHaveBeenCalled();
  });

  it('does nothing when the frame has no content window yet', async () => {
    const target = {
      current: { contentWindow: null },
    } as RefObject<TokenPostable | null>;
    const { view, onFailure } = mount(
      refreshable(async () => 'tok-2'),
      { target },
    );

    await act(async () => {
      view.result.current();
    });

    expect(onFailure).not.toHaveBeenCalled();
  });

  it('reports a rejected refresh as TOKEN_REFRESH_FAILED', async () => {
    // toIdentityVerificationError attaches copy at the edge: getErrorMessage returns
    // the fixed TOKEN_REFRESH_FAILED copy for a known code regardless of the
    // upstream provider's raw message - it never reaches the user. (Deviation
    // from the brief's literal 'upstream down' expectation, which does not
    // match core's actual getErrorMessage - mirrors the RN package's real
    // test at packages/kyc-react-native/src/__tests__/useTokenRefresh.test.tsx.)
    const { view, onFailure, postMessage } = mount(
      refreshable(async () => {
        throw {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'upstream down',
        } as never;
      }),
    );

    await act(async () => {
      view.result.current();
    });

    expect(postMessage).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith({
      code: ClientErrorCodes.TOKEN_REFRESH_FAILED,
      message: getErrorMessage(ClientErrorCodes.TOKEN_REFRESH_FAILED),
    });
  });

  it('survives a rejection with no message', async () => {
    const { view, onFailure } = mount(
      refreshable(async () => {
        throw undefined as never;
      }),
    );

    await act(async () => {
      view.result.current();
    });

    expect(onFailure).toHaveBeenCalledWith({
      code: ClientErrorCodes.TOKEN_REFRESH_FAILED,
      message: expect.any(String),
    });
  });
});

describe('useTokenRefresh - guards', () => {
  it('posts only the newest token when two refreshes overlap', async () => {
    const resolvers: Array<(token: string) => void> = [];
    const source = refreshable(
      () => new Promise<string>(resolve => resolvers.push(resolve)),
    );
    const { view, postMessage } = mount(source);

    await act(async () => {
      view.result.current();
      view.result.current();
    });
    await act(async () => {
      resolvers[0]('stale');
      resolvers[1]('fresh');
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      createSetTokenMessage('fresh'),
      ORIGIN,
    );
  });

  it('drops a token whose session was replaced while it was in flight', async () => {
    let resolveToken!: (token: string) => void;
    const source = refreshable(
      () =>
        new Promise<string>(resolve => {
          resolveToken = resolve;
        }),
    );
    let current: VerificationSession | null = session;
    const { view, postMessage } = mount(source, {
      getSession: () => current,
    });

    await act(async () => {
      view.result.current();
    });
    current = { ...session, sessionId: 'sess-2' };
    await act(async () => {
      resolveToken('stale');
    });

    expect(postMessage).not.toHaveBeenCalled();
  });

  it('drops a token when the session is gone by the time it arrives', async () => {
    let resolveToken!: (token: string) => void;
    const source = refreshable(
      () =>
        new Promise<string>(resolve => {
          resolveToken = resolve;
        }),
    );
    let current: VerificationSession | null = session;
    const { view, postMessage } = mount(source, {
      getSession: () => current,
    });

    await act(async () => {
      view.result.current();
    });
    current = null;
    await act(async () => {
      resolveToken('stale');
    });

    expect(postMessage).not.toHaveBeenCalled();
  });

  it('identifies a session with no sessionId by its url', async () => {
    const urlOnly: VerificationSession = {
      provider: 'mock',
      url: `${ORIGIN}/hosted/anon`,
      allowedOrigin: ORIGIN,
    };
    const { view, postMessage } = mount(
      refreshable(async () => 'tok-2'),
      {
        getSession: () => urlOnly,
      },
    );

    await act(async () => {
      view.result.current();
    });

    expect(postMessage).toHaveBeenCalledWith(
      createSetTokenMessage('tok-2'),
      ORIGIN,
    );
  });

  it('posts nothing and reports nothing after unmount', async () => {
    let resolveToken!: (token: string) => void;
    let rejectToken!: (cause: unknown) => void;
    const source = refreshable(
      () =>
        new Promise<string>((resolve, reject) => {
          resolveToken = resolve;
          rejectToken = reject;
        }),
    );

    const first = mount(source);
    await act(async () => {
      first.view.result.current();
    });
    first.view.unmount();
    await act(async () => {
      resolveToken('too-late');
    });
    expect(first.postMessage).not.toHaveBeenCalled();

    const second = mount(source);
    await act(async () => {
      second.view.result.current();
    });
    second.view.unmount();
    await act(async () => {
      rejectToken({ code: 'X' });
    });
    expect(second.onFailure).not.toHaveBeenCalled();
  });
});
