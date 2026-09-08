// The kyc-bridge half of the hosted verification page, as a standalone
// script. Every page renderVerificationPage serves inlines this string first
// and then its own provider script in the SAME nonced <script> block, so the
// bridge is the one place the wire protocol is spoken and the pages are
// plain consumers of window.__kycBridge.
//
// apps/api does not depend on kyc-core, so BRIDGE_SOURCE and
// BRIDGE_PROTOCOL_VERSION are duplicated here and pinned by
// tests/verificationPages.test.ts against the published protocol.
//
// The script is a string, so tests/bridgeScript.test.ts runs it the way the
// browser would - new Function('window', BRIDGE_SCRIPT)(fakeWindow) - and
// asserts behaviour instead of substrings.

export const BRIDGE_SOURCE = 'kyc-bridge';
export const BRIDGE_PROTOCOL_VERSION = 1;

/**
 * Shared bridge emitter. Outbound: React Native first, then the iframe
 * parent. Inbound: window.__kycBridge.setToken(tokenOrEnvelope) for
 * react-native-webview's injectJavaScript, plus a postMessage listener for
 * the web host - both accept the { source, v, type: 'setToken', token }
 * envelope that kyc-core's createSetTokenMessage builds, or a bare string.
 *
 * `post` and `readToken` are published on window.__kycBridge by MERGING into
 * whatever object is already there, never by replacing it: React Native
 * injects its own setToken accessor before content loads
 * (kyc-react-native's BRIDGE_STUB_SCRIPT, which queues refreshes that arrive
 * during page load), and the page's own setToken assignment lands on the
 * same object afterwards.
 */
export const BRIDGE_SCRIPT = `
    var BRIDGE_SOURCE = '${BRIDGE_SOURCE}';
    var BRIDGE_VERSION = ${BRIDGE_PROTOCOL_VERSION};
    function post(type, payload) {
      var message = { source: BRIDGE_SOURCE, v: BRIDGE_VERSION, type: type };
      if (payload) { message.payload = payload; }
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
      }
    }
    function readToken(value) {
      if (typeof value === 'string') { return value; }
      if (value && typeof value === 'object' && typeof value.token === 'string') {
        return value.token;
      }
      return null;
    }
    var kycBridge = window.__kycBridge || {};
    kycBridge.post = post;
    kycBridge.readToken = readToken;
    window.__kycBridge = kycBridge;
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { return; }
      }
      if (!data || data.source !== BRIDGE_SOURCE || data.v !== BRIDGE_VERSION) { return; }
      if (data.type === 'setToken' && window.__kycBridge.setToken) {
        window.__kycBridge.setToken(data);
      }
    });`;
