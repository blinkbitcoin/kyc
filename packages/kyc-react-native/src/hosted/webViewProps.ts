// The hardened react-native-webview configuration, as data.
//
// Every security-relevant WebView decision lives here so it can be unit
// tested as a plain object and reviewed in one place:
//   - camera/microphone are granted to the pinned origin (that is the whole
//     point: issue #4246 was a WebView that never granted capture),
//   - originWhitelist carries the session origin AND the provider origins
//     the host declares: react-native-webview checks it FIRST and, on a
//     miss, hands the URL to the system browser (Linking.openURL) instead
//     of consulting our guard - so an origin missing from it is escalated
//     out of the app, not blocked,
//   - onShouldStartLoadWithRequest re-checks the same list for every
//     navigation (main frame and subframes) and blocks everything else,
//   - no multiple windows, no disk cache, no file access,
//   - a __kycBridge stub is installed BEFORE the page's own script, so a
//     token refresh that arrives during page load is queued, not lost.

/** The shape react-native-webview hands onShouldStartLoadWithRequest. */
export interface NavigationRequest {
  url: string;
}

export type MediaCapturePermissionGrantType =
  | 'grant'
  | 'grantIfSameHostElsePrompt'
  | 'grantIfSameHostElseDeny'
  | 'prompt'
  | 'deny';

export interface HardenedWebViewProps {
  javaScriptEnabled: boolean;
  domStorageEnabled: boolean;
  allowsInlineMediaPlayback: boolean;
  mediaPlaybackRequiresUserAction: boolean;
  mediaCapturePermissionGrantType: MediaCapturePermissionGrantType;
  originWhitelist: string[];
  onShouldStartLoadWithRequest: (request: NavigationRequest) => boolean;
  setSupportMultipleWindows: boolean;
  cacheEnabled: boolean;
  allowFileAccess: boolean;
  injectedJavaScriptBeforeContentLoaded: string;
  startInLoadingState: boolean;
  androidLayerType: 'hardware';
}

export interface HostedWebViewOptions {
  /** The hosted page URL from the session. */
  url: string;
  /** Origin pin; defaults to the url's own origin. */
  allowedOrigin?: string;
  /** Extra origins the page may navigate to, e.g. 'https://*.sumsub.com'. */
  allowedNavigationOrigins?: string[];
}

/**
 * Used only when no origin can be derived at all. Still https-only - never
 * '*', which would let the page navigate to any scheme.
 */
export const FALLBACK_ORIGIN_WHITELIST: readonly string[] = ['https://*'];

/**
 * Installed before the page's own script. It defines window.__kycBridge with
 * a setToken *accessor*: calls made before the page installs its real
 * handler are queued, and the page's `window.__kycBridge.setToken = fn`
 * assignment flushes the queue into it. Without this, a refresh injected
 * while the page is still loading would be dropped silently.
 */
export const BRIDGE_STUB_SCRIPT = `(function () {
  var bridge = window.__kycBridge || {};
  if (bridge.__kycQueued) { return; }
  var pending = [];
  var handler = null;
  Object.defineProperty(bridge, 'setToken', {
    configurable: true,
    enumerable: true,
    get: function () {
      return function (value) {
        if (handler) { handler(value); } else { pending.push(value); }
      };
    },
    set: function (fn) {
      handler = fn;
      var queued = pending;
      pending = [];
      for (var i = 0; i < queued.length; i++) { fn(queued[i]); }
    },
  });
  bridge.__kycQueued = true;
  window.__kycBridge = bridge;
})();
true;`;

const ORIGIN_RE = /^(https?:\/\/[^/?#]+)/i;
const WILDCARD_RE = /^(https?:\/\/)\*\.(.+)$/;

/** scheme://host[:port] of an http(s) URL, lowercased; null for anything else. */
export const originOf = (url: string): string | null => {
  const match = ORIGIN_RE.exec(url);
  return match ? match[1].toLowerCase() : null;
};

/** Exact origin, or a single '*.' subdomain wildcard (never the bare domain). */
export const matchesOrigin = (pattern: string, origin: string): boolean => {
  const wanted = pattern.toLowerCase();
  if (wanted === origin) {
    return true;
  }
  const wildcard = WILDCARD_RE.exec(wanted);
  if (!wildcard) {
    return false;
  }
  const [, scheme, domain] = wildcard;
  return (
    origin.startsWith(scheme) &&
    origin.slice(scheme.length).endsWith(`.${domain}`)
  );
};

/**
 * Navigation gate. react-native-webview runs it for every navigation action
 * the platform reports - main frame and subframes alike - after
 * originWhitelist has already accepted the URL. An empty allow-list means
 * "nothing to pin" and defers to originWhitelist, so a non-http(s) session
 * url still loads.
 *
 * Defence in depth, not a sandbox: on Android an unanswered
 * shouldOverrideUrlLoading is ALLOWED after 250ms, so a loaded device can
 * let a navigation through before this returns.
 */
export const createNavigationGuard =
  (allowed: readonly string[]) =>
  (request: NavigationRequest): boolean => {
    if (allowed.length === 0 || request.url === 'about:blank') {
      return true;
    }
    const origin = originOf(request.url);
    return (
      origin !== null && allowed.some(pattern => matchesOrigin(pattern, origin))
    );
  };

export const createHostedWebViewProps = ({
  url,
  allowedOrigin,
  allowedNavigationOrigins = [],
}: HostedWebViewOptions): HardenedWebViewProps => {
  const origin = allowedOrigin ?? originOf(url);
  return {
    javaScriptEnabled: true,
    domStorageEnabled: true,
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    // iOS/macOS only: it grants WKWebView capture without a second, in-page
    // prompt. Android has no equivalent - react-native-webview's
    // onPermissionRequest grants camera/mic to whatever origin asks, as long
    // as the app itself holds the OS permission. Either way the OS-level
    // prompt is the host's job (checkPermissions).
    mediaCapturePermissionGrantType: 'grant',
    // The provider origins belong here too: a URL that misses this list is
    // never offered to onShouldStartLoadWithRequest - react-native-webview
    // opens it in the system browser instead.
    originWhitelist: origin
      ? [origin, ...allowedNavigationOrigins]
      : [...FALLBACK_ORIGIN_WHITELIST],
    onShouldStartLoadWithRequest: createNavigationGuard(
      origin ? [origin, ...allowedNavigationOrigins] : [],
    ),
    setSupportMultipleWindows: false,
    cacheEnabled: false,
    allowFileAccess: false,
    injectedJavaScriptBeforeContentLoaded: BRIDGE_STUB_SCRIPT,
    startInLoadingState: true,
    androidLayerType: 'hardware',
  };
};
