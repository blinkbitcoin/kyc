import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  ClientErrorCodes,
  createSetTokenScript,
  getErrorMessage,
} from '@blinkbitcoin/kyc-core/hosted';

import { useTokenRefresh } from '../useTokenRefresh';

import type { MutableRefObject } from 'react';
import type {
  TokenRefreshableSource,
  VerificationSession,
  VerificationSource,
} from '@blinkbitcoin/kyc-core/hosted';
import type { TokenInjectable } from '../useTokenRefresh';

const session: VerificationSession = { provider: 'mock', sessionId: 'sess-1' };

let refresh: () => void;

const Harness: React.FC<{
  source: VerificationSource;
  target: MutableRefObject<TokenInjectable | null>;
  onFailure: (error: { code: string; message: string }) => void;
  getSession: () => VerificationSession | null;
}> = ({ source, target, onFailure, getSession }) => {
  refresh = useTokenRefresh(source, { getSession, target, onFailure });
  return null;
};

const plain = (): VerificationSource => ({
  start: async () => session,
  interpret: () => null,
});

const refreshable = (
  refreshToken: TokenRefreshableSource['refreshToken'],
): TokenRefreshableSource => ({ ...plain(), refreshToken });

const mount = async (
  source: VerificationSource,
  overrides: {
    target?: MutableRefObject<TokenInjectable | null>;
    getSession?: () => VerificationSession | null;
  } = {},
) => {
  const injectJavaScript = jest.fn();
  const target =
    overrides.target ??
    ({
      current: { injectJavaScript },
    } as MutableRefObject<TokenInjectable | null>);
  const onFailure = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <Harness
        source={source}
        target={target}
        onFailure={onFailure}
        getSession={overrides.getSession ?? (() => session)}
      />,
    );
  });
  return { renderer, injectJavaScript, onFailure };
};

describe('useTokenRefresh - refusals', () => {
  it('fails with TOKEN_EXPIRED when the source cannot refresh', async () => {
    const { onFailure } = await mount(plain());

    await ReactTestRenderer.act(async () => {
      refresh();
    });

    expect(onFailure).toHaveBeenCalledWith({
      code: ClientErrorCodes.TOKEN_EXPIRED,
      message: expect.any(String),
    });
  });

  it('fails with TOKEN_EXPIRED when there is no session to refresh', async () => {
    const refreshToken = jest.fn(async () => 'never');
    const { onFailure } = await mount(refreshable(refreshToken), {
      getSession: () => null,
    });

    await ReactTestRenderer.act(async () => {
      refresh();
    });

    expect(refreshToken).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith({
      code: ClientErrorCodes.TOKEN_EXPIRED,
      message: expect.any(String),
    });
  });
});

describe('useTokenRefresh - injecting', () => {
  it('pushes the fresh token into the page as a bare setToken call', async () => {
    const source = refreshable(jest.fn(async () => 'tok-2'));
    const { injectJavaScript, onFailure } = await mount(source);

    await ReactTestRenderer.act(async () => {
      refresh();
    });

    expect(source.refreshToken).toHaveBeenCalledWith(session);
    expect(injectJavaScript).toHaveBeenCalledWith(
      createSetTokenScript('tok-2'),
    );
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('does nothing when no WebView is attached', async () => {
    const target = {
      current: null,
    } as MutableRefObject<TokenInjectable | null>;
    const { onFailure } = await mount(
      refreshable(async () => 'tok-2'),
      { target },
    );

    await ReactTestRenderer.act(async () => {
      refresh();
    });

    expect(onFailure).not.toHaveBeenCalled();
  });

  it('reports a rejected refresh as TOKEN_REFRESH_FAILED', async () => {
    // toVerificationError attaches copy at the edge: getErrorMessage returns
    // the fixed TOKEN_REFRESH_FAILED copy for a known code regardless of the
    // upstream provider's raw message - it never reaches the user.
    const { onFailure, injectJavaScript } = await mount(
      refreshable(async () => {
        throw {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'upstream down',
        } as never;
      }),
    );

    await ReactTestRenderer.act(async () => {
      refresh();
    });

    expect(injectJavaScript).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith({
      code: ClientErrorCodes.TOKEN_REFRESH_FAILED,
      message: getErrorMessage(ClientErrorCodes.TOKEN_REFRESH_FAILED),
    });
  });

  it('survives a rejection with no message', async () => {
    const { onFailure } = await mount(
      refreshable(async () => {
        throw undefined as never;
      }),
    );

    await ReactTestRenderer.act(async () => {
      refresh();
    });

    expect(onFailure).toHaveBeenCalledWith({
      code: ClientErrorCodes.TOKEN_REFRESH_FAILED,
      message: expect.any(String),
    });
  });
});

describe('useTokenRefresh - guards', () => {
  it('injects only the newest token when two refreshes overlap', async () => {
    const resolvers: Array<(token: string) => void> = [];
    const source = refreshable(
      () => new Promise<string>(resolve => resolvers.push(resolve)),
    );
    const { injectJavaScript } = await mount(source);

    await ReactTestRenderer.act(async () => {
      refresh();
      refresh();
    });
    await ReactTestRenderer.act(async () => {
      resolvers[0]('stale');
      resolvers[1]('fresh');
    });

    expect(injectJavaScript).toHaveBeenCalledTimes(1);
    expect(injectJavaScript).toHaveBeenCalledWith(
      createSetTokenScript('fresh'),
    );
  });

  it('injects nothing and reports nothing after unmount', async () => {
    let resolveToken!: (token: string) => void;
    let rejectToken!: (cause: unknown) => void;
    const source = refreshable(
      () =>
        new Promise<string>((resolve, reject) => {
          resolveToken = resolve;
          rejectToken = reject;
        }),
    );
    const first = await mount(source);
    await ReactTestRenderer.act(async () => {
      refresh();
    });
    await ReactTestRenderer.act(async () => {
      first.renderer.unmount();
    });
    await ReactTestRenderer.act(async () => {
      resolveToken('too-late');
    });
    expect(first.injectJavaScript).not.toHaveBeenCalled();

    const second = await mount(source);
    await ReactTestRenderer.act(async () => {
      refresh();
    });
    await ReactTestRenderer.act(async () => {
      second.renderer.unmount();
    });
    await ReactTestRenderer.act(async () => {
      rejectToken({ code: 'X' });
    });
    expect(second.onFailure).not.toHaveBeenCalled();
  });
});
