import { vi } from 'vitest';

import { BRIDGE_PROTOCOL_VERSION, BRIDGE_SCRIPT, BRIDGE_SOURCE } from '../src/hosted/bridgeScript';

// The bridge ships to the browser as a string, so the only honest way to test
// it is to run it the way the page does: one script, one `window`. That is
// the pattern kyc-react-native uses for its own injected stub
// (packages/kyc-react-native/src/hosted/__tests__/webViewProps.test.ts).

interface BridgeApi {
  post: (type: string, payload?: unknown) => void;
  readToken: (value: unknown) => string | null;
  setToken?: (value: unknown) => void;
  [key: string]: unknown;
}

type MessageListener = (event: { data: unknown }) => void;

interface FakeWindow {
  addEventListener: (type: string, listener: MessageListener) => void;
  __kycBridge?: Partial<BridgeApi>;
  ReactNativeWebView?: { postMessage?: (body: string) => void };
  parent?: unknown;
}

interface InstalledBridge {
  window: FakeWindow;
  bridge: BridgeApi;
  /** What the browser does when the host posts a message at the page. */
  dispatch: (data: unknown) => void;
  /** Everything the window listened for, so a stray listener is visible. */
  listenedFor: string[];
}

const install = (window: Partial<FakeWindow> = {}): InstalledBridge => {
  const listeners: MessageListener[] = [];
  const listenedFor: string[] = [];
  const fake: FakeWindow = {
    addEventListener: (type, listener) => {
      listenedFor.push(type);
      if (type === 'message') {
        listeners.push(listener);
      }
    },
    ...window,
  };

  new Function('window', BRIDGE_SCRIPT)(fake);

  return {
    window: fake,
    bridge: fake.__kycBridge as BridgeApi,
    dispatch: (data) => {
      for (const listener of listeners) {
        listener({ data });
      }
    },
    listenedFor,
  };
};

/** A React Native host: the WebView's postMessage takes a JSON string. */
const reactNative = (): { window: Partial<FakeWindow>; postMessage: ReturnType<typeof vi.fn> } => {
  const postMessage = vi.fn();
  return { window: { ReactNativeWebView: { postMessage } }, postMessage };
};

/** A web host: the page is in an iframe, so window.parent is someone else. */
const iframe = (): { window: Partial<FakeWindow>; postMessage: ReturnType<typeof vi.fn> } => {
  const postMessage = vi.fn();
  return { window: { parent: { postMessage } }, postMessage };
};

const envelope = (type: string, payload?: unknown): Record<string, unknown> => ({
  source: BRIDGE_SOURCE,
  v: BRIDGE_PROTOCOL_VERSION,
  type,
  ...(payload === undefined ? {} : { payload }),
});

describe('the bridge script installs window.__kycBridge', () => {
  it('publishes post and readToken', () => {
    const { bridge } = install();
    expect(typeof bridge.post).toBe('function');
    expect(typeof bridge.readToken).toBe('function');
  });

  it('merges into a pre-existing bridge instead of replacing it', () => {
    // React Native injects its own setToken accessor before content loads; a
    // replacing assignment here would drop the queue it holds.
    const setToken = vi.fn();
    const existing = { setToken, __kycQueued: true };
    const { window, bridge } = install({ __kycBridge: existing });

    expect(window.__kycBridge).toBe(existing);
    expect(bridge.setToken).toBe(setToken);
    expect(bridge.__kycQueued).toBe(true);
    expect(typeof bridge.post).toBe('function');
  });

  it('listens for exactly one thing: message', () => {
    expect(install().listenedFor).toEqual(['message']);
  });
});

describe('post', () => {
  it('sends a JSON envelope through the React Native WebView', () => {
    const host = reactNative();
    install(host.window).bridge.post('submitted');

    expect(host.postMessage).toHaveBeenCalledTimes(1);
    const [body] = host.postMessage.mock.calls[0] as [string];
    expect(typeof body).toBe('string');
    expect(JSON.parse(body)).toEqual(envelope('submitted'));
  });

  it('carries the payload when there is one, and omits the key when there is not', () => {
    const host = reactNative();
    const { bridge } = install(host.window);
    bridge.post('statusChanged', { status: 'approved' });
    bridge.post('cancel');

    const sent = host.postMessage.mock.calls.map(([body]) => JSON.parse(body as string));
    expect(sent[0]).toEqual(envelope('statusChanged', { status: 'approved' }));
    expect(sent[1]).toEqual(envelope('cancel'));
    expect('payload' in sent[1]).toBe(false);
  });

  it('sends the object itself to the iframe parent, with a wildcard origin', () => {
    // '*' is deliberate: the host pins the origin on its side (the page is
    // embedded by whoever the app says, and it cannot know that origin).
    const host = iframe();
    install(host.window).bridge.post('complete', { status: 'approved' });

    expect(host.postMessage).toHaveBeenCalledTimes(1);
    expect(host.postMessage).toHaveBeenCalledWith(
      envelope('complete', { status: 'approved' }),
      '*'
    );
  });

  it('prefers React Native when both transports are present', () => {
    const native = reactNative();
    const web = iframe();
    install({ ...native.window, ...web.window }).bridge.post('submitted');

    expect(native.postMessage).toHaveBeenCalledTimes(1);
    expect(web.postMessage).not.toHaveBeenCalled();
  });

  it('falls through to the parent when ReactNativeWebView cannot post', () => {
    // An object without postMessage is not a transport - an old or partially
    // initialised WebView must not swallow the event.
    const host = iframe();
    install({ ...host.window, ReactNativeWebView: {} }).bridge.post('submitted');

    expect(host.postMessage).toHaveBeenCalledWith(envelope('submitted'), '*');
  });

  it('posts nowhere at all at the top level', () => {
    // Opened directly in a browser tab: window.parent === window. Nothing to
    // talk to, and no throw either - the page still runs.
    const win: Partial<FakeWindow> = {};
    const installed = install(win);
    installed.window.parent = installed.window;

    expect(() => installed.bridge.post('sessionExpired')).not.toThrow();
  });

  it('posts nowhere when there is no parent to speak of', () => {
    expect(() => install().bridge.post('sessionExpired')).not.toThrow();
  });
});

describe('readToken', () => {
  it('takes a bare token string', () => {
    expect(install().bridge.readToken('token-1')).toBe('token-1');
  });

  it('takes the kyc-core setToken envelope', () => {
    expect(install().bridge.readToken(envelope('setToken'))).toBeNull();
    expect(install().bridge.readToken({ ...envelope('setToken'), token: 'token-2' })).toBe(
      'token-2'
    );
  });

  it.each([undefined, null, 0, false, {}, { token: 7 }, ['token-3']])(
    'returns null for %s, which is not a token',
    (value) => {
      expect(install().bridge.readToken(value)).toBeNull();
    }
  );
});

describe('the inbound message listener', () => {
  const setUp = (): { setToken: ReturnType<typeof vi.fn>; dispatch: (data: unknown) => void } => {
    const setToken = vi.fn();
    const installed = install();
    installed.bridge.setToken = setToken;
    return { setToken, dispatch: installed.dispatch };
  };

  it('hands a setToken envelope to the page handler', () => {
    const { setToken, dispatch } = setUp();
    const message = { ...envelope('setToken'), token: 'token-1' };
    dispatch(message);

    // The whole envelope is handed over, not just the token: readToken is
    // what normalizes it, and both shapes reach the same handler.
    expect(setToken).toHaveBeenCalledWith(message);
  });

  it('parses a JSON string, which is what react-native-webview delivers', () => {
    const { setToken, dispatch } = setUp();
    const message = { ...envelope('setToken'), token: 'token-1' };
    dispatch(JSON.stringify(message));

    expect(setToken).toHaveBeenCalledWith(message);
  });

  it('ignores a string that is not JSON instead of throwing', () => {
    const { setToken, dispatch } = setUp();
    expect(() => dispatch('not json {')).not.toThrow();
    expect(setToken).not.toHaveBeenCalled();
  });

  it.each([
    ['no data at all', undefined],
    ['another library on the same page', { source: 'other-bridge', v: 1, type: 'setToken' }],
    ['a future protocol version', { source: BRIDGE_SOURCE, v: 2, type: 'setToken' }],
    ['a message type the page does not answer', envelope('statusChanged')],
  ])('ignores %s', (_label, data) => {
    const { setToken, dispatch } = setUp();
    dispatch(data);
    expect(setToken).not.toHaveBeenCalled();
  });

  it('does nothing when no page handler is installed yet', () => {
    // The not-found page never installs one, and a real page installs it a
    // few lines after the bridge runs.
    const installed = install();
    expect(() => installed.dispatch({ ...envelope('setToken'), token: 'token-1' })).not.toThrow();
    expect(installed.bridge.setToken).toBeUndefined();
  });
});
