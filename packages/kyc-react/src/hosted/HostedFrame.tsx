// The hosted page, embedded.
//
// Applies createHostedFrameProps, installs the window 'message' listener
// behind createMessageGuard (origin pin + "was it really our frame?"), and
// turns a frame load failure into the normalized NETWORK_ERROR event. This
// package is where NETWORK_ERROR is produced - the core sources never
// invent it.
//
// The 'error' listener is attached with addEventListener on the raw node,
// not the JSX onError prop: React only wires up a non-delegated 'load'
// listener for <iframe> (see react-dom's per-tag listenToNonDelegatedEvent
// table), never 'error' - an <iframe onError> handler is simply never
// invoked, in the DOM as much as in jsdom.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ClientErrorCodes } from '@blinkbitcoin/kyc-core';

import { createHostedFrameProps, createMessageGuard } from './frameProps';

import type { CSSProperties, FC, RefObject } from 'react';
import type { VerificationEvent } from '@blinkbitcoin/kyc-core';
import type { TokenPostable } from '../useTokenRefresh';

export const HOSTED_FRAME_TEST_ID = 'verification-iframe';
export const DEFAULT_FRAME_TITLE = 'Identity verification';

export interface HostedFrameProps {
  /** The hosted page URL from the session. */
  url: string;
  /** postMessage origin pin from the session. Without it nothing is trusted. */
  allowedOrigin?: string;
  /** Raw page payload, straight from the message event - feed it to interpret(). */
  onMessage: (raw: unknown) => void;
  /** Normalized events this view produces itself (load failures). */
  onEvent: (event: VerificationEvent) => void;
  /** Attach to post token refreshes into the page. */
  frameRef?: RefObject<TokenPostable | null>;
  title?: string;
  style?: CSSProperties;
  testId?: string;
}

export const HostedFrame: FC<HostedFrameProps> = ({
  url,
  allowedOrigin,
  onMessage,
  onEvent,
  frameRef,
  title = DEFAULT_FRAME_TITLE,
  style,
  testId = HOSTED_FRAME_TEST_ID,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  const hardened = useMemo(
    () => createHostedFrameProps({ url, title }),
    [url, title],
  );

  // Stable across renders (empty deps, reads through the ref) so the same
  // function value is used to add and remove the native listener.
  const handleLoadError = useCallback(() => {
    onEventRef.current({ type: 'error', code: ClientErrorCodes.NETWORK_ERROR });
  }, []);

  const setFrame = useCallback(
    (node: HTMLIFrameElement | null) => {
      iframeRef.current?.removeEventListener('error', handleLoadError);
      iframeRef.current = node;
      if (frameRef) {
        frameRef.current = node;
      }
      node?.addEventListener('error', handleLoadError);
    },
    [frameRef, handleLoadError],
  );

  useEffect(() => {
    if (!allowedOrigin) {
      // Not gated on NODE_ENV: this package does no build-time env
      // substitution, and a session with no origin pin is a misconfiguration
      // in every environment. It is logged once per frame, not once per
      // message, so a chatty page cannot flood the console.
      console.warn(
        '[kyc-react] HostedFrame received a session without an allowedOrigin, so every message from the page is ignored and token refresh is disabled. createHostedSource derives allowedOrigin from the page URL - make sure the session carries an http(s) url.',
      );
    }
    const accepts = createMessageGuard({
      allowedOrigin,
      // Read live rather than cached: a frame's contentWindow identity is
      // stable across a real navigation, but reading it fresh needs no
      // extra bookkeeping and stays correct if that identity ever changes.
      getFrameWindow: () => iframeRef.current?.contentWindow ?? null,
    });
    const listener = (event: MessageEvent): void => {
      if (!accepts(event)) {
        return;
      }
      onMessageRef.current(event.data);
    };
    window.addEventListener('message', listener);
    return () => {
      window.removeEventListener('message', listener);
    };
  }, [allowedOrigin]);

  return (
    <div style={{ ...styles.container, ...style }}>
      <iframe
        {...hardened}
        ref={setFrame}
        data-testid={testId}
        style={styles.frame}
      />
    </div>
  );
};

const styles: Record<string, CSSProperties> = {
  container: { width: '100%', height: '100%', minHeight: 480 },
  frame: { width: '100%', height: '100%', minHeight: 480, border: 'none' },
};
