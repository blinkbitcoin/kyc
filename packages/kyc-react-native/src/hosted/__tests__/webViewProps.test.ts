import {
  BRIDGE_STUB_SCRIPT,
  createHostedWebViewProps,
  createNavigationGuard,
  FALLBACK_ORIGIN_WHITELIST,
  matchesOrigin,
  originOf,
} from '../webViewProps';

const URL = 'https://kyc.example.com/hosted/sess-1?x=1';

describe('originOf', () => {
  it('keeps scheme, host and port and lowercases them', () => {
    expect(originOf(URL)).toBe('https://kyc.example.com');
    expect(originOf('http://10.0.2.2:5100/hosted/a')).toBe(
      'http://10.0.2.2:5100',
    );
    expect(originOf('HTTPS://KYC.Example.com/a')).toBe(
      'https://kyc.example.com',
    );
  });

  it('returns null for anything that is not http(s)', () => {
    expect(originOf('data:text/html,<b>hi</b>')).toBeNull();
    expect(originOf('about:blank')).toBeNull();
    expect(originOf('/relative')).toBeNull();
  });
});

describe('matchesOrigin', () => {
  it('matches an exact origin case-insensitively', () => {
    expect(
      matchesOrigin('https://KYC.example.com', 'https://kyc.example.com'),
    ).toBe(true);
    expect(
      matchesOrigin('https://other.example.com', 'https://kyc.example.com'),
    ).toBe(false);
  });

  it('matches a subdomain wildcard but never the bare domain or a lookalike', () => {
    expect(
      matchesOrigin('https://*.sumsub.com', 'https://api.sumsub.com'),
    ).toBe(true);
    expect(
      matchesOrigin('https://*.sumsub.com', 'https://a.b.sumsub.com'),
    ).toBe(true);
    expect(matchesOrigin('https://*.sumsub.com', 'https://sumsub.com')).toBe(
      false,
    );
    expect(
      matchesOrigin('https://*.sumsub.com', 'https://evilsumsub.com'),
    ).toBe(false);
    expect(matchesOrigin('https://*.sumsub.com', 'http://api.sumsub.com')).toBe(
      false,
    );
  });
});

describe('createNavigationGuard', () => {
  const guard = createNavigationGuard([
    'https://kyc.example.com',
    'https://*.sumsub.com',
  ]);

  it('allows the session origin and the declared provider origins', () => {
    expect(guard({ url: URL })).toBe(true);
    expect(guard({ url: 'https://api.sumsub.com/frame' })).toBe(true);
  });

  it('allows the blank document the platform loads first', () => {
    expect(guard({ url: 'about:blank' })).toBe(true);
  });

  it('blocks off-origin top-level navigation and non-http schemes', () => {
    expect(guard({ url: 'https://phish.example.com/' })).toBe(false);
    expect(guard({ url: 'data:text/html,<b>hi</b>' })).toBe(false);
  });

  it('defers to originWhitelist when there is no origin to pin', () => {
    expect(createNavigationGuard([])({ url: 'https://anything.example' })).toBe(
      true,
    );
  });
});

describe('createHostedWebViewProps', () => {
  const props = createHostedWebViewProps({ url: URL });

  it('is the one place the WebView is hardened', () => {
    expect(props).toMatchObject({
      javaScriptEnabled: true,
      domStorageEnabled: true,
      allowsInlineMediaPlayback: true,
      mediaPlaybackRequiresUserAction: false,
      mediaCapturePermissionGrantType: 'grant',
      setSupportMultipleWindows: false,
      cacheEnabled: false,
      allowFileAccess: false,
      startInLoadingState: true,
      androidLayerType: 'hardware',
      injectedJavaScriptBeforeContentLoaded: BRIDGE_STUB_SCRIPT,
    });
    expect(typeof props.onShouldStartLoadWithRequest).toBe('function');
  });

  it('pins originWhitelist to the session origin', () => {
    expect(props.originWhitelist).toEqual(['https://kyc.example.com']);
    expect(
      createHostedWebViewProps({
        url: URL,
        allowedOrigin: 'https://pinned.example',
      }).originWhitelist,
    ).toEqual(['https://pinned.example']);
  });

  it('falls back to https-only (never "*") when no origin can be derived', () => {
    const loose = createHostedWebViewProps({ url: 'about:blank' });
    expect(loose.originWhitelist).toEqual([...FALLBACK_ORIGIN_WHITELIST]);
    expect(loose.originWhitelist).not.toContain('*');
    expect(
      loose.onShouldStartLoadWithRequest({ url: 'https://anything.example' }),
    ).toBe(true);
  });

  it('puts provider frames in originWhitelist so the guard ever sees them', () => {
    // react-native-webview checks originWhitelist first and escalates a miss
    // to the system browser, so a frame origin left out of it would leave the
    // app entirely instead of reaching onShouldStartLoadWithRequest.
    const withFrames = createHostedWebViewProps({
      url: URL,
      allowedNavigationOrigins: ['https://*.sumsub.com'],
    });
    expect(withFrames.originWhitelist).toEqual([
      'https://kyc.example.com',
      'https://*.sumsub.com',
    ]);
    expect(
      withFrames.onShouldStartLoadWithRequest({
        url: 'https://api.sumsub.com/frame',
      }),
    ).toBe(true);
    expect(
      withFrames.onShouldStartLoadWithRequest({
        url: 'https://elsewhere.example/',
      }),
    ).toBe(false);
  });
});

describe('BRIDGE_STUB_SCRIPT', () => {
  const evaluate = (): Record<string, unknown> => {
    const win: Record<string, unknown> = {};
    // eslint-disable-next-line no-new-func
    new Function('window', BRIDGE_STUB_SCRIPT)(win);
    return win;
  };

  it('queues setToken calls made before the page installs its own handler', () => {
    const win = evaluate();
    const bridge = win.__kycBridge as { setToken: (value: string) => void };
    bridge.setToken('early-1');
    bridge.setToken('early-2');

    const received: string[] = [];
    bridge.setToken = (value: string) => received.push(value);

    expect(received).toEqual(['early-1', 'early-2']);
    bridge.setToken('later');
    expect(received).toEqual(['early-1', 'early-2', 'later']);
  });

  it('is idempotent, so a re-injection cannot drop the page handler', () => {
    const win = evaluate();
    const bridge = win.__kycBridge as { setToken: (value: string) => void };
    const received: string[] = [];
    bridge.setToken = (value: string) => received.push(value);
    // eslint-disable-next-line no-new-func
    new Function('window', BRIDGE_STUB_SCRIPT)(win);
    (win.__kycBridge as { setToken: (value: string) => void }).setToken(
      'after',
    );
    expect(received).toEqual(['after']);
  });
});
