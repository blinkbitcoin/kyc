// The hosted-page bridge protocol.
//
// A hosted verification page (this repo's apps/api, or any page that speaks
// this protocol) posts versioned envelopes to its host:
//   page -> app:  window.ReactNativeWebView.postMessage(JSON.stringify(msg))
//                 window.parent.postMessage(msg, allowedOrigin)
//   app -> page:  window.__kycBridge.setToken(token)  (token refresh only)
//
// The `source` discriminator is what lets a host ignore the provider SDK's
// own postMessages, and `v` lets an old app reject a newer page instead of
// misreading it. No DOM, no React, no Apollo: this module is part of the
// Apollo-free ./hosted entry.

import { isVerificationStatus } from './types';

import type { VerificationEvent } from './types';

/** Envelope discriminator - anything else is not ours. */
export const BRIDGE_SOURCE = 'kyc-bridge';

/** Bump only for a breaking envelope change; older versions are rejected. */
export const BRIDGE_PROTOCOL_VERSION = 1;

/** Code used when a page reports an error without one of its own. */
export const BRIDGE_ERROR_CODE = 'BRIDGE_PROTOCOL';

/** The event types the protocol can carry (the normalized vocabulary). */
export type BridgeEventType = VerificationEvent['type'];

/** page -> app: one normalized event. */
export interface BridgeMessage {
  source: typeof BRIDGE_SOURCE;
  v: typeof BRIDGE_PROTOCOL_VERSION;
  type: BridgeEventType;
  payload?: Record<string, unknown>;
}

/** app -> page: the only inbound message, used for token refresh. */
export interface BridgeSetTokenMessage {
  source: typeof BRIDGE_SOURCE;
  v: typeof BRIDGE_PROTOCOL_VERSION;
  type: 'setToken';
  token: string;
}

const asRecord = (message: unknown): Record<string, unknown> | null => {
  if (typeof message === 'string') {
    try {
      const parsed: unknown = JSON.parse(message);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return message && typeof message === 'object'
    ? (message as Record<string, unknown>)
    : null;
};

const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * Translate a raw page message (object or JSON string) into a normalized
 * event, or null when it is not a well-formed message of this protocol.
 * Every source that embeds a hosted page uses this as its `interpret`.
 */
export const interpretBridgeMessage = (
  raw: unknown,
): VerificationEvent | null => {
  const data = asRecord(raw);
  if (
    !data ||
    data.source !== BRIDGE_SOURCE ||
    data.v !== BRIDGE_PROTOCOL_VERSION
  ) {
    return null;
  }

  const payload = data.payload === undefined ? {} : asRecord(data.payload);
  if (!payload) {
    return null;
  }

  switch (data.type) {
    case 'applicantLoaded': {
      const applicantId = str(payload.applicantId);
      return applicantId ? { type: 'applicantLoaded', applicantId } : null;
    }
    case 'submitted':
      return { type: 'submitted' };
    case 'statusChanged': {
      const status = payload.status;
      return isVerificationStatus(status)
        ? { type: 'statusChanged', status }
        : null;
    }
    case 'complete': {
      const status = payload.status;
      if (!isVerificationStatus(status)) {
        return null;
      }
      const applicantId = str(payload.applicantId);
      return applicantId
        ? { type: 'complete', status, applicantId }
        : { type: 'complete', status };
    }
    case 'cancel':
      return { type: 'cancel' };
    case 'tokenExpired':
      return { type: 'tokenExpired' };
    case 'sessionExpired':
      return { type: 'sessionExpired' };
    case 'error':
      return {
        type: 'error',
        code: str(payload.code) ?? BRIDGE_ERROR_CODE,
        message: str(payload.message),
      };
    default:
      return null;
  }
};

/** Build an outbound envelope (used by the hosted page and by test doubles). */
export const createBridgeMessage = (
  type: BridgeEventType,
  payload?: Record<string, unknown>,
): BridgeMessage => ({
  source: BRIDGE_SOURCE,
  v: BRIDGE_PROTOCOL_VERSION,
  type,
  ...(payload ? { payload } : {}),
});

/** Build the app -> page token-refresh message. */
export const createSetTokenMessage = (
  token: string,
): BridgeSetTokenMessage => ({
  source: BRIDGE_SOURCE,
  v: BRIDGE_PROTOCOL_VERSION,
  type: 'setToken',
  token,
});

/**
 * The same message as an injectable snippet for react-native-webview's
 * `injectJavaScript` (web hosts post `createSetTokenMessage` to the frame
 * instead). JSON.stringify does the escaping; the trailing `true;` is what
 * injectJavaScript expects as a return value.
 */
export const createSetTokenScript = (token: string): string =>
  `window.__kycBridge && window.__kycBridge.setToken(${JSON.stringify(
    createSetTokenMessage(token),
  )});\ntrue;`;
